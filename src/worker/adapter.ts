// The worker's view of Orca: the host API it was granted, plus Orca's own CLI for what the host API leaves out (typing
// into a terminal of a workspace that isn't focused, launching an agent with a model and effort, mailing a chat). The
// CLI is the one Orca ships beside the worker's own executable, aimed at the same Orca profile.
//
// An agent runs in a terminal or as a chat (Orca's graphical client). A chat has no terminal: it is reached by Orca's
// orchestration mail, which Orca delivers when its current turn ends, and which needs a terminal as the sender. The
// plugin keeps one quiet terminal per workspace for that ("Ensemble"), made when a chat first needs a message.
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { chatHandleFromPaneKey, chatSessionId, isChatHandle, parseOmpModels, parsePiModels, type Surface } from "../shared/agents";
import { callerIs } from "./caller";

/** The `orca` object Orca passes to the worker's activate(). Only what this plugin uses. */
export interface OrcaWorker {
  api: { major: number; minor: number };
  host: { call<T = unknown>(method: string, params?: unknown, options?: { signal?: AbortSignal }): Promise<T>; has(method: string): boolean };
  commands: { register(id: string, handler: (args: unknown) => unknown): { dispose(): void } };
  events: { on(event: string, handler: (payload: any) => unknown): { dispose(): void } };
  hooks: { on(hook: string, handler: (event: any, next: (event: any) => unknown) => unknown): { dispose(): void } };
  panels: { handle(name: string, handler: (input: any, context: { panel?: string; signal?: AbortSignal }) => unknown): { dispose(): void }; post(name: string, data: unknown, options?: { panel?: string }): void };
  storage: { get(key: string): Promise<unknown>; set(key: string, value: unknown): Promise<void>; onDidChange?(handler: (change: { key: string }) => void): { dispose(): void } };
  settings: { get(key: string): Promise<unknown> };
  log(message: string): void;
}

export type AgentState = "working" | "blocked" | "waiting" | "done";

export interface AgentRow {
  terminalId: string | null;
  title: string | null;
  agent: string | null;
  state: AgentState;
  stateStartedAt: number;
  sessionId?: string | null;
}

/** A refused launch, by why: the agent can't be a chat there, or Orca can't give it a model at launch. */
export class LaunchRefused extends Error {
  constructor(readonly reason: "chat" | "model", message: string) {
    super(message);
  }
}

/** Orca refusing a launch before it started anything: as a chat, or with a model it can't pass to this agent. */
export function launchRefusal(message: string): "chat" | "model" | null {
  if (/can['’]t open as a chat|cannot open as a chat|no structured session/i.test(message)) return "chat";
  if (/does not support launch-time model selection/i.test(message)) return "model";
  return null;
}

export interface WorkspaceRow {
  id: string;
  kind: "worktree" | "folder";
  name: string;
  project?: string | null;
  projectId?: string | null;
  path: string;
  branch: string | null;
  hostId: string | null;
}

/** The Orca profile folder Orca was started with: its --user-data-dir, else the platform default. */
function profileFromParent(): string | null {
  if (platform() === "win32") return null;
  try {
    const args = execFileSync("ps", ["-o", "args=", "-p", String(process.ppid)], { encoding: "utf8" });
    const match = args.match(/--user-data-dir=(\S+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function defaultProfile(): string {
  if (platform() === "darwin") return join(homedir(), "Library", "Application Support", "orca");
  if (platform() === "win32") return join(process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"), "orca");
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config"), "orca");
}

/** The `orca` CLI Orca ships beside the worker's executable (macOS: Contents/Resources/bin/orca). */
function cliBeside(execPath: string): string | null {
  const marker = ".app/Contents/";
  const at = execPath.indexOf(marker);
  if (at >= 0) {
    const cli = join(execPath.slice(0, at + marker.length), "Resources", "bin", "orca");
    if (existsSync(cli)) return cli;
  }
  for (let dir = dirname(execPath), depth = 0; depth < 5; dir = dirname(dir), depth += 1) {
    for (const candidate of [join(dir, "resources", "bin", "orca"), join(dir, "bin", "orca")]) if (existsSync(candidate)) return candidate;
  }
  return null;
}

export class OrcaAdapter {
  /** Agents by terminal id, kept from agent.status.changed and agents.list. */
  readonly agents = new Map<string, AgentRow & { workspaceId: string | null; workspaceListId?: string; at: number }>();
  /** Chats by their agent's session id, learned from status events: agents.list names a chat only by session. */
  private readonly chatsBySession = new Map<string, string>();
  /** The workspace path a message to a chat is sent from (the team's), set by the collaboration code. */
  chatHome: (handle: string) => string | null = () => null;
  /** The lead of a chat's team (or the chat itself when it leads), set by the collaboration code. */
  chatLead: (handle: string) => string | null = () => null;
  /** The `agent-team` command, for agents whose shell has no PATH from the launch hook (chats). */
  teamBin = "agent-team";
  private cli: string | null;
  private profile: string | null;

  constructor(readonly orca: OrcaWorker) {
    this.cli = cliBeside(process.execPath);
    this.profile = profileFromParent();
  }

  /** The profile an agent's shell reported; it wins over a guess. */
  learnProfile(userDataPath: string | null | undefined): void {
    if (userDataPath && userDataPath !== this.profile) this.profile = userDataPath;
  }

  get cliPath(): string | null {
    return this.cli;
  }

  /** The profile folder of the Orca this worker runs in: the one learned or guessed, else the platform default. */
  get profilePath(): string {
    return this.profile ?? defaultProfile();
  }

  /**
   * Runs `orca <args> --json` as the agent `as` when that agent's command is being handled (from its own shell: Orca
   * knows it as the one acting, and a launch shows in its chat as a handoff), else as the plugin.
   */
  cliAs<T = any>(as: string | null | undefined, args: string[], timeoutMs = 60_000): Promise<T> {
    const caller = callerIs(as);
    return caller ? caller.exec<T>(args, timeoutMs) : this.runCli<T>(args, timeoutMs);
  }

  /** Runs `orca <args> --json` against the plugin's Orca; resolves with its `result`. */
  runCli<T = any>(args: string[], timeoutMs = 60_000): Promise<T> {
    const cli = this.cli;
    if (!cli) return Promise.reject(new Error("The orca CLI was not found next to Orca."));
    const env: NodeJS.ProcessEnv = { HOME: homedir(), PATH: `${dirname(cli)}:/usr/bin:/bin:/usr/sbin:/sbin`, TMPDIR: process.env.TMPDIR ?? "/tmp", ORCA_USER_DATA_PATH: this.profile ?? defaultProfile() };
    return new Promise((resolve, reject) => {
      execFile("/bin/bash", [cli, ...args, "--json"], { env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
        let parsed: any = null;
        try {
          parsed = JSON.parse(stdout);
        } catch {
          // Not JSON: fall through to the error below.
        }
        if (parsed?.ok) return resolve(parsed.result as T);
        const message = parsed?.error?.message ?? error?.message ?? (String(stdout).trim() || "orca CLI failed");
        reject(Object.assign(new Error(message), { code: parsed?.error?.code as string | undefined }));
      });
    });
  }

  /**
   * Runs `orca <args>` and resolves with its output when the command succeeds, without expecting JSON: for capability
   * probes such as `orchestration worker-start --help`, which prints help text and exits 0.
   */
  rawCli(args: string[], timeoutMs = 60_000): Promise<string> {
    const cli = this.cli;
    if (!cli) return Promise.reject(new Error("The orca CLI was not found next to Orca."));
    const env: NodeJS.ProcessEnv = { HOME: homedir(), PATH: `${dirname(cli)}:/usr/bin:/bin:/usr/sbin:/sbin`, TMPDIR: process.env.TMPDIR ?? "/tmp", ORCA_USER_DATA_PATH: this.profile ?? defaultProfile() };
    return new Promise((resolve, reject) => {
      execFile("/bin/bash", [cli, ...args], { env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => (error ? reject(error) : resolve(String(stdout))));
    });
  }

  // ----- Agents and terminals

  /** The terminal or chat a status event is about: chats come with a pane key only. */
  static handleOf(payload: { terminalId?: string; paneKey?: string }): string | null {
    return payload.terminalId ?? chatHandleFromPaneKey(payload.paneKey);
  }

  noteStatus(payload: { terminalId?: string; paneKey?: string; workspaceId: string | null; workspaceListId?: string; title?: string; state: AgentState; sessionId?: string; mainAgent?: { stateStartedAt: number } }): void {
    const handle = OrcaAdapter.handleOf(payload);
    if (!handle) return;
    if (payload.sessionId && isChatHandle(handle)) this.chatsBySession.set(payload.sessionId, handle);
    const was = this.agents.get(handle);
    this.agents.set(handle, {
      terminalId: handle,
      title: payload.title ?? was?.title ?? null,
      agent: was?.agent ?? null,
      state: payload.state,
      stateStartedAt: payload.mainAgent?.stateStartedAt ?? Date.now(),
      sessionId: payload.sessionId ?? was?.sessionId ?? null,
      workspaceId: payload.workspaceId,
      workspaceListId: payload.workspaceListId ?? was?.workspaceListId,
      at: Date.now(),
    });
  }

  /** Marks an agent working: it is running a command, so it is in a turn. */
  noteWorking(terminalId: string): void {
    const was = this.agents.get(terminalId);
    if (was) this.agents.set(terminalId, { ...was, state: "working", at: Date.now() });
  }

  stateOf(terminalId: string): AgentState | null {
    return this.agents.get(terminalId)?.state ?? null;
  }

  /** Idle: waiting for input. Unknown counts as not idle, so nothing is typed into an agent mid-turn. */
  isIdle(terminalId: string): boolean {
    const state = this.stateOf(terminalId);
    return state === "done" || state === "waiting";
  }

  /** Agents of a workspace. Before host API 1.10, agents.list knows only the focused workspace. */
  async listAgents(workspaceId?: string): Promise<AgentRow[]> {
    const scoped = workspaceId && (this.orca.api.major > 1 || this.orca.api.minor >= 10);
    try {
      const listed = await this.orca.host.call<{ agents: AgentRow[] }>("agents.list", scoped ? { workspaceId } : {});
      const result = { agents: listed.agents.map((row) => (row.terminalId || !row.sessionId || !this.chatsBySession.has(row.sessionId) ? row : { ...row, terminalId: this.chatsBySession.get(row.sessionId)! })) };
      if (scoped || !workspaceId) return result.agents;
      const focused = await this.focusedWorkspace().catch(() => null);
      const same = (a?: string | null, b?: string | null) => !!a && !!b && (a === b || a.endsWith(`::${b.split("::").pop()}`) || b.endsWith(`::${a.split("::").pop()}`));
      return focused?.workspaceId && same(focused.workspaceId, workspaceId) ? result.agents : [];
    } catch {
      return [];
    }
  }

  /**
   * An agent's state when no status event told it yet (the worker just started, or its workspace isn't focused):
   * idle when its terminal printed nothing for a while, else working. Cached for 10 s; null when the terminal is gone.
   */
  private probes = new Map<string, { at: number; state: AgentState | null }>();
  async probeState(terminalId: string): Promise<AgentState | null> {
    const known = this.agents.get(terminalId);
    if (known) return known.state;
    if (isChatHandle(terminalId)) return null;
    const cached = this.probes.get(terminalId);
    if (cached && Date.now() - cached.at < 10_000) return cached.state;
    let state: AgentState | null = null;
    try {
      const result = await this.runCli<{ terminal: { connected?: boolean; lastOutputAt?: number; agentIdentity?: string | null } }>(["terminal", "show", "--terminal", terminalId], 15_000);
      const quiet = Date.now() - (result.terminal.lastOutputAt ?? 0);
      state = result.terminal.connected === false ? null : quiet > 15_000 ? "done" : "working";
    } catch {
      state = null;
    }
    this.probes.set(terminalId, { at: Date.now(), state });
    return state;
  }

  async listWorkspaces(): Promise<WorkspaceRow[]> {
    const result = await this.orca.host.call<{ workspaces: WorkspaceRow[] }>("workspace.list", {});
    return result.workspaces;
  }

  async focusedWorkspace(): Promise<{ workspaceId?: string; branch: string; displayName: string; terminals: { id: string; title?: string }[] } | null> {
    return this.orca.host.call("workspace.readContext", {});
  }

  async readTerminal(terminalId: string, maxLines = 400): Promise<string[]> {
    if (isChatHandle(terminalId)) return [];
    try {
      const result = await this.orca.host.call<{ lines: string[] }>("terminal.read", { terminalId, maxLines });
      return result.lines;
    } catch {
      return [];
    }
  }

  /** Chats that refused mail as gone: their tab was closed. */
  private readonly goneChats = new Set<string>();

  /**
   * Whether a chat is still open: Orca lists the agents of its workspace by session, so a chat whose session no longer
   * shows (and that said nothing for a minute) was closed. Without a way to tell, it counts as open.
   */
  private async chatAlive(handle: string): Promise<boolean> {
    if (this.goneChats.has(handle)) return false;
    const known = this.agents.get(handle);
    const scoped = this.orca.api.major > 1 || this.orca.api.minor >= 10;
    if (!known?.sessionId || !known.workspaceId || !scoped || Date.now() - known.at < 60_000) return true;
    const rows = await this.listAgents(known.workspaceId);
    return !rows.length || rows.some((row) => row.sessionId === known.sessionId);
  }

  /** Whether the terminal (or chat) still runs; a closed one is gone for good. */
  async terminalAlive(terminalId: string): Promise<boolean> {
    if (isChatHandle(terminalId)) return this.chatAlive(terminalId);
    try {
      const result = await this.runCli<{ terminal: { status: string } }>(["terminal", "show", "--terminal", terminalId], 15_000);
      return result.terminal.status !== "exited";
    } catch (error) {
      return !/not.found|unknown|no terminal|exited/i.test(String((error as Error).message));
    }
  }

  /** Types text into an agent and submits it, when it is idle; returns whether it went in. */
  async sendIfIdle(terminalId: string, text: string): Promise<boolean> {
    if (!this.isIdle(terminalId)) return false;
    return this.send(terminalId, text);
  }

  /** Types text into an agent's terminal and submits it, wherever the terminal is; a chat gets it as Orca mail. */
  async send(terminalId: string, text: string): Promise<boolean> {
    if (isChatHandle(terminalId)) return this.mail(terminalId, text);
    try {
      const result = await this.runCli<{ send: { accepted: boolean } }>(["terminal", "send", "--terminal", terminalId, "--text", text, "--enter"], 30_000);
      if (result.send.accepted) this.noteWorking(terminalId);
      return result.send.accepted;
    } catch {
      // The host API reaches a terminal of the focused workspace without the CLI.
      try {
        const result = await this.orca.host.call<{ accepted: boolean }>("terminal.sendText", { terminalId, text, enter: true });
        if (result.accepted) this.noteWorking(terminalId);
        return result.accepted;
      } catch {
        return false;
      }
    }
  }

  /** A launch's CLI call (as the lead when it is the one calling), with Orca's refusals as LaunchRefused. */
  private async launchCli<T>(args: string[], timeoutMs: number, as?: string | null): Promise<T> {
    try {
      return await this.cliAs<T>(as, args, timeoutMs);
    } catch (error) {
      const message = (error as Error).message;
      const refused = launchRefusal(message);
      throw refused ? new LaunchRefused(refused, message) : error;
    }
  }

  private noteLaunched(handle: string, agent: string, surface: Surface): void {
    this.agents.set(handle, { terminalId: handle, title: null, agent, state: "working", stateStartedAt: Date.now(), workspaceId: null, at: Date.now() });
    if (surface === "chat") this.goneChats.delete(handle);
  }

  /**
   * Starts an agent in the workspace at `path`, as a chat or in a terminal, with an optional model, effort and first
   * prompt. Throws LaunchRefused when Orca refuses the surface or the model before starting anything.
   */
  async launch(input: { path: string; agent: string; model?: string; effort?: string; prompt: string; focus?: boolean; surface?: Surface; as?: string | null }): Promise<{ terminalId: string; surface: Surface }> {
    const surface = input.surface ?? "terminal";
    const args = ["agent", "launch", "--agent", input.agent, "--worktree", `path:${input.path}`, "--surface", surface, "--prompt", input.prompt];
    if (input.model) args.push("--model", input.model);
    if (input.model && input.effort) args.push("--effort", input.effort);
    if (input.focus) args.push("--focus");
    const result = await this.launchCli<{ outcome: { kind: string; handle?: string }; agentTerminalHandle?: string }>(args, 120_000, input.as);
    const terminalId = result.outcome?.handle ?? result.agentTerminalHandle;
    if (!terminalId) throw new Error(`Orca did not start ${input.agent}.`);
    // Orca may still open a terminal when it couldn't check that the agent can be a chat there.
    const ran: Surface = result.outcome?.kind === "structured" || isChatHandle(terminalId) ? "chat" : "terminal";
    this.noteLaunched(terminalId, input.agent, ran);
    return { terminalId, surface: ran };
  }

  /** Creates a worktree workspace in a project and starts the lead in it; returns the lead's terminal or chat. */
  async createWorkspace(input: { projectPath: string; name: string; agent: string; model?: string; effort?: string; prompt: string; baseBranch?: string; surface?: Surface; as?: string | null }): Promise<{ terminalId: string; workspaceId: string; path: string; surface: Surface }> {
    const args = ["worktree", "create", "--repo", `path:${input.projectPath}`, "--name", input.name, "--agent", input.agent, "--surface", input.surface ?? "terminal", "--prompt", input.prompt, "--activate"];
    if (input.model) args.push("--model", input.model);
    if (input.model && input.effort) args.push("--effort", input.effort);
    if (input.baseBranch) args.push("--base-branch", input.baseBranch);
    const result = await this.launchCli<{ worktree: { id: string; path: string }; launch?: { outcome?: { kind?: string; handle?: string } }; agentTerminalHandle?: string }>(args, 180_000, input.as);
    const terminalId = result.launch?.outcome?.handle ?? result.agentTerminalHandle;
    if (!terminalId) throw new Error("Orca created the workspace but did not start the lead.");
    const ran: Surface = result.launch?.outcome?.kind === "structured" || isChatHandle(terminalId) ? "chat" : "terminal";
    this.noteLaunched(terminalId, input.agent, ran);
    return { terminalId, workspaceId: result.worktree.id, path: result.worktree.path, surface: ran };
  }

  /** Names an agent's tab: a terminal's title, or a chat's name. */
  async rename(handle: string, title: string): Promise<void> {
    const args = isChatHandle(handle) ? ["chat", "rename", "--session", chatSessionId(handle), "--name", title] : ["terminal", "rename", "--terminal", handle, "--title", title];
    await this.runCli(args).catch(() => undefined);
  }

  // ----- Mail to chats

  /** The quiet terminal each workspace's mail to chats is sent from, by workspace path. */
  private readonly senders = new Map<string, string>();

  /** The terminal mail to chats in the workspace at `path` comes from, made when there is none. */
  private async sender(path: string): Promise<string> {
    const known = this.senders.get(path);
    if (known && (await this.terminalAlive(known))) return known;
    const note = [
      "Ensemble: this terminal carries team messages to the lead and members that run as chats.",
      "Keep it open while a team works; closing it is safe, it comes back when needed.",
      "Ensemble：这个终端用来给以图形界面（聊天）运行的协调器和成员转发团队消息。团队工作时请保留它；关掉也没关系，需要时会重新打开。",
    ].join("\n");
    const created = await this.runCli<{ terminal: { handle: string } }>(["terminal", "create", "--worktree", `path:${path}`, "--title", "Ensemble", "--command", `printf '%b\n' '${note.replace(/'/g, "")}'; exec tail -f /dev/null`], 60_000);
    this.senders.set(path, created.terminal.handle);
    return created.terminal.handle;
  }

  /**
   * Sends text to a chat as Orca mail: an idle chat gets it as its next message, a busy one when its turn ends. Mail
   * needs a terminal as its sender: the workspace's Ensemble terminal. A chat that is gone refuses it.
   */
  async mail(handle: string, text: string): Promise<boolean> {
    const home = this.chatHome(handle);
    if (!home) return false;
    const subject = (text.replace(/^\[[^\]]*\]\s*/, "").split("\n").find((line) => line.trim()) ?? "Ensemble").trim().slice(0, 80) || "Ensemble";
    // The lead is calling: the message goes out from the lead's own shell, as the lead (no sender terminal needed).
    const lead = this.chatLead(handle);
    if (callerIs(lead)) {
      try {
        await this.cliAs(lead, ["orchestration", "send", "--to", `orca_session_id:${chatSessionId(handle)}`, "--subject", subject, "--body", text], 30_000);
        this.noteWorking(handle);
        return true;
      } catch {
        // Fall back to the workspace's sender terminal below.
      }
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const from = await this.sender(home);
      try {
        await this.runCli(["orchestration", "send", "--from", from, "--to", `orca_session_id:${chatSessionId(handle)}`, "--subject", subject, "--body", text], 30_000);
        this.noteWorking(handle);
        return true;
      } catch (error) {
        const code = (error as { code?: string }).code ?? "";
        if (/sender|terminal_not_found|no_active/i.test(code) && attempt === 0) {
          this.senders.delete(home);
          continue;
        }
        if (/session|not_found|closed/i.test(code)) this.goneChats.add(handle);
        return false;
      }
    }
    return false;
  }

  // ----- Models the host's agents can run

  private modelLists = new Map<string, { at: number; models: string[] }>();

  /**
   * The model selectors an agent lists, run in a login shell so its own PATH applies. OMP 19 prints them as JSON
   * (`omp models --json`); OMP before that, and pi, print the table `--list-models` gave. Cached for 5 minutes; empty
   * when it can't be run.
   */
  async agentModels(agent: "pi" | "omp"): Promise<string[]> {
    const known = this.modelLists.get(agent);
    if (known && Date.now() - known.at < 5 * 60_000) return known.models;
    const shell = process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : "/bin/zsh";
    let models = agent === "omp" ? await this.ompModelSelectors(shell) : null;
    if (models === null) {
      models = await new Promise<string[]>((resolve) => {
        execFile(shell, ["-lc", `${agent} --list-models`], { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => resolve(error && !stdout ? [] : parsePiModels(String(stdout))));
      });
    }
    this.modelLists.set(agent, { at: Date.now(), models });
    return models;
  }

  /** OMP 19's JSON catalog; null on an OMP that predates it, which uses the same table format as Pi. */
  private ompModelSelectors(shell: string): Promise<string[] | null> {
    return new Promise((resolve) => {
      execFile(shell, ["-lc", "omp models --json"], { timeout: 20_000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout) => resolve(error ? null : parseOmpModels(String(stdout))));
    });
  }

  /** pi's models as `provider/id`. */
  piModels(): Promise<string[]> {
    return this.agentModels("pi");
  }

  async focusTerminal(terminalId: string): Promise<void> {
    await this.orca.host.call("terminal.focus", { terminalId }).catch(() => this.runCli(["terminal", "switch", "--terminal", terminalId]).catch(() => undefined));
  }

  async closeTerminal(terminalId: string): Promise<void> {
    await this.orca.host.call("terminal.close", { terminalId }).catch(() => this.runCli(["terminal", "close", "--terminal", terminalId]).catch(() => undefined));
  }

  async notify(title: string, body?: string): Promise<void> {
    await this.orca.host.call("notifications.show", { title, ...(body ? { body: body.slice(0, 1000) } : {}) }).catch(() => undefined);
  }

  async openFile(workspaceId: string, path: string): Promise<void> {
    await this.orca.host.call("editor.open", { workspaceId, path });
  }
}
