import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);
var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};

// src/worker/main.ts
import { realpathSync } from "node:fs";
import { createServer } from "node:net";
import { unlinkSync } from "node:fs";
import { dirname as dirname3, join as join10 } from "node:path";
import { fileURLToPath } from "node:url";

// src/shared/json.ts
function toJson(value) {
  return value === void 0 ? value : JSON.parse(JSON.stringify(value));
}

// src/shared/modes.ts
var COLLAB_MODES = ["team", "delegation"];
var TEAM_MODES = ["auto", ...COLLAB_MODES, "none"];
var MODE_SPECS = {
  team: {
    id: "team",
    pattern: "MA-08",
    intake: true,
    visibility: "shared",
    fit: "the parts depend on each other and need to be agreed as one piece (an interface several roles build against, a cross-cutting change, a design several roles review), the requirements are still unclear, or several hypotheses need checking with members correcting each other",
    unfit: "small or clearly separable work, where every member reading every post only costs time"
  },
  delegation: {
    id: "delegation",
    pattern: "MA-04",
    intake: false,
    visibility: "isolated",
    fit: "the request splits into parts with clear owners that can be done without talking to each other (independent features, research per area, read-only exploration)",
    unfit: "parts that must agree on shared details while they are built, or many parts writing the same files"
  }
};
function effectiveMode(teamMode, override, locked) {
  return locked ?? override ?? teamMode;
}
function allowsMode(effective, mode) {
  return effective === "auto" || effective === mode;
}
function isTeamMode(value) {
  return typeof value === "string" && TEAM_MODES.includes(value);
}
var TEAM_BIN = "agent-team";
var LEAD_TOOLS = {
  status: `${TEAM_BIN} status`,
  role: `${TEAM_BIN} role`,
  delegate: `${TEAM_BIN} delegate`,
  brief: `${TEAM_BIN} brief`,
  kickoff: `${TEAM_BIN} kickoff`,
  tasks: `${TEAM_BIN} tasks`,
  broadcast: `${TEAM_BIN} broadcast`,
  send: `${TEAM_BIN} send`,
  wait: `${TEAM_BIN} wait`,
  board: `${TEAM_BIN} board`,
  close: `${TEAM_BIN} close`
};
var MEMBER_TOOLS = {
  read: `${TEAM_BIN} read`,
  post: `${TEAM_BIN} post`,
  claim: `${TEAM_BIN} claim`,
  task: `${TEAM_BIN} task`,
  report: `${TEAM_BIN} report`
};
var PLUGIN_MESSAGE_PREFIX = "[ensemble]";
var LEGACY_MESSAGE_PREFIX = "[agent-team]";
var PROMPT_LANGUAGES = ["zh", "en"];
function languageFromLocale(locale2) {
  return (locale2 ?? "").toLowerCase().startsWith("zh") ? "zh" : "en";
}
function isPromptLanguage(value) {
  return typeof value === "string" && PROMPT_LANGUAGES.includes(value);
}

// src/shared/paths.ts
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { join } from "node:path";
function rootKey(pluginRoot2) {
  return createHash("sha256").update(pluginRoot2).digest("hex").slice(0, 12);
}
function socketPath(pluginRoot2) {
  return `/tmp/orca-ensemble-${rootKey(pluginRoot2)}.sock`;
}
function dataDir(pluginRoot2) {
  return join(homedir(), ".orca-ensemble", rootKey(pluginRoot2));
}
var ENV = {
  socket: "AGENT_TEAM_SOCKET",
  bin: "AGENT_TEAM_BIN",
  node: "AGENT_TEAM_NODE"
};

// src/worker/adapter.ts
import { execFile, execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir as homedir2, platform } from "node:os";
import { dirname, join as join2 } from "node:path";

// src/shared/agents.ts
var SURFACES = ["chat", "terminal"];
var CHAT_AGENTS = /* @__PURE__ */ new Set(["claude", "codex", "omp", "grok", "cursor", "kimi", "copilot"]);
var TERMINAL_ONLY = /* @__PURE__ */ new Set(["pi"]);
var canChat = (agent) => CHAT_AGENTS.has(agent.trim());
var CHAT_OFFERED = /* @__PURE__ */ new Set([...CHAT_AGENTS, "opencode"]);
function surfaceOf(runtime) {
  const agent = runtime.agent.trim();
  if (TERMINAL_ONLY.has(agent)) return "terminal";
  if (runtime.surface === "chat") return "chat";
  if (!canChat(agent)) return "terminal";
  return runtime.surface ?? "chat";
}
var CHAT_HANDLE_PREFIX = "structured-agent-session-";
var isChatHandle = (handle) => !!handle && handle.startsWith(CHAT_HANDLE_PREFIX);
var chatSessionId = (handle) => handle.slice(CHAT_HANDLE_PREFIX.length);
function chatHandleFromPaneKey(paneKey) {
  if (!paneKey || !paneKey.startsWith(CHAT_HANDLE_PREFIX)) return null;
  const at = paneKey.indexOf(":");
  return at < 0 ? paneKey : paneKey.slice(0, at);
}
var CLI_MODEL_FLAGS = {
  pi: { model: "--model", effort: "--thinking" }
};
function cliModelArgs(agent, model, effort) {
  const flags = CLI_MODEL_FLAGS[agent.trim()];
  if (!flags || !model) return null;
  return [flags.model, model, ...effort && flags.effort ? [flags.effort, effort] : []];
}
var FULL_ACCESS_ARGS = {
  claude: "--dangerously-skip-permissions",
  codebuddy: "--dangerously-skip-permissions",
  codex: "--dangerously-bypass-approvals-and-sandbox",
  gemini: "--yolo",
  cursor: "--yolo",
  kimi: "--auto",
  "qwen-code": "--approval-mode yolo",
  droid: "--auto high",
  grok: "--permission-mode bypassPermissions",
  kiro: "--trust-all-tools",
  hermes: "--yolo",
  copilot: "--yolo"
};
var AUTO_ARGS = {
  claude: "--permission-mode auto",
  codex: "--approve-for-me"
};
var wordsOf = (args) => args.split(/\s+/).filter(Boolean);
var indexOfRun = (words, run) => words.findIndex((_, at) => run.every((word, k) => words[at + k] === word));
function withFullAccess(agent, words, before) {
  const full = FULL_ACCESS_ARGS[agent.trim()];
  if (!full) return { words: [...words], added: 0 };
  const yolo = wordsOf(full);
  if (indexOfRun(words, yolo) >= 0) return { words: [...words], added: 0 };
  let next = [...words];
  let at = before;
  const auto = AUTO_ARGS[agent.trim()] ? wordsOf(AUTO_ARGS[agent.trim()]) : [];
  const autoAt = auto.length ? indexOfRun(next, auto) : -1;
  if (autoAt > 0) {
    next.splice(autoAt, auto.length);
    if (autoAt < at) at -= auto.length;
  }
  next = [...next.slice(0, at), ...yolo, ...next.slice(at)];
  return { words: next, added: next.length - words.length };
}
function parsePiModels(output) {
  const models = [];
  for (const line of output.split("\n")) {
    const columns = line.trim().split(/\s{2,}/);
    if (columns.length < 2 || columns[0] === "provider") continue;
    const [provider, model] = columns;
    if (!provider || !model || /\s/.test(provider) || /\s/.test(model)) continue;
    models.push(`${provider}/${model}`);
  }
  return [...new Set(models)];
}
function parseOmpModels(output) {
  let catalog;
  try {
    catalog = JSON.parse(output);
  } catch {
    return null;
  }
  const rows = catalog?.models;
  if (!Array.isArray(rows)) return null;
  const selectors = /* @__PURE__ */ new Set();
  for (const row of rows) {
    const selector = row?.selector;
    if (typeof selector === "string" && selector.trim()) selectors.add(selector.trim());
  }
  return [...selectors];
}
function resolvePiModel(model, known) {
  const wanted = model.trim();
  if (!known.length) return { ok: true, model: wanted };
  const lower = wanted.toLowerCase();
  const exact = known.find((entry) => entry.toLowerCase() === lower);
  if (exact) return { ok: true, model: exact };
  const byId = known.filter((entry) => entry.slice(entry.indexOf("/") + 1).toLowerCase() === lower);
  if (byId.length === 1) return { ok: true, model: byId[0] };
  if (byId.length > 1) return { ok: false, error: "ambiguous", matches: byId };
  if (wanted.includes("/")) return { ok: true, model: wanted };
  const near = known.filter((entry) => entry.toLowerCase().includes(lower)).slice(0, 8);
  return { ok: false, error: "unknown", matches: near };
}

// src/worker/caller.ts
import { AsyncLocalStorage } from "node:async_hooks";
var callers = new AsyncLocalStorage();
function asCaller(caller, work) {
  return caller ? callers.run(caller, work) : work();
}
function currentCaller() {
  return callers.getStore() ?? null;
}
function callerIs(handle) {
  const caller = currentCaller();
  return caller && handle && caller.handle === handle ? caller : null;
}

// src/worker/adapter.ts
var LaunchRefused = class extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
};
function launchRefusal(message) {
  if (/can['’]t open as a chat|cannot open as a chat|no structured session/i.test(message)) return "chat";
  if (/does not support launch-time model selection/i.test(message)) return "model";
  return null;
}
function profileFromParent() {
  if (platform() === "win32") return null;
  try {
    const args = execFileSync("ps", ["-o", "args=", "-p", String(process.ppid)], { encoding: "utf8" });
    const match = args.match(/--user-data-dir=(\S+)/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
function defaultProfile() {
  if (platform() === "darwin") return join2(homedir2(), "Library", "Application Support", "orca");
  if (platform() === "win32") return join2(process.env.APPDATA ?? join2(homedir2(), "AppData", "Roaming"), "orca");
  return join2(process.env.XDG_CONFIG_HOME ?? join2(homedir2(), ".config"), "orca");
}
function cliBeside(execPath) {
  const marker = ".app/Contents/";
  const at = execPath.indexOf(marker);
  if (at >= 0) {
    const cli = join2(execPath.slice(0, at + marker.length), "Resources", "bin", "orca");
    if (existsSync(cli)) return cli;
  }
  for (let dir = dirname(execPath), depth = 0; depth < 5; dir = dirname(dir), depth += 1) {
    for (const candidate of [join2(dir, "resources", "bin", "orca"), join2(dir, "bin", "orca")]) if (existsSync(candidate)) return candidate;
  }
  return null;
}
var OrcaAdapter = class _OrcaAdapter {
  constructor(orca2) {
    this.orca = orca2;
    this.cli = cliBeside(process.execPath);
    this.profile = profileFromParent();
  }
  /** Agents by terminal id, kept from agent.status.changed and agents.list. */
  agents = /* @__PURE__ */ new Map();
  /** Chats by their agent's session id, learned from status events: agents.list names a chat only by session. */
  chatsBySession = /* @__PURE__ */ new Map();
  /** The workspace path a message to a chat is sent from (the team's), set by the collaboration code. */
  chatHome = () => null;
  /** The lead of a chat's team (or the chat itself when it leads), set by the collaboration code. */
  chatLead = () => null;
  /** The `agent-team` command, for agents whose shell has no PATH from the launch hook (chats). */
  teamBin = "agent-team";
  cli;
  profile;
  /** The profile an agent's shell reported; it wins over a guess. */
  learnProfile(userDataPath) {
    if (userDataPath && userDataPath !== this.profile) this.profile = userDataPath;
  }
  get cliPath() {
    return this.cli;
  }
  /** The profile folder of the Orca this worker runs in: the one learned or guessed, else the platform default. */
  get profilePath() {
    return this.profile ?? defaultProfile();
  }
  /**
   * Runs `orca <args> --json` as the agent `as` when that agent's command is being handled (from its own shell: Orca
   * knows it as the one acting, and a launch shows in its chat as a handoff), else as the plugin.
   */
  cliAs(as, args, timeoutMs = 6e4) {
    const caller = callerIs(as);
    return caller ? caller.exec(args, timeoutMs) : this.runCli(args, timeoutMs);
  }
  /** Runs `orca <args> --json` against the plugin's Orca; resolves with its `result`. */
  runCli(args, timeoutMs = 6e4) {
    const cli = this.cli;
    if (!cli) return Promise.reject(new Error("The orca CLI was not found next to Orca."));
    const env = { HOME: homedir2(), PATH: `${dirname(cli)}:/usr/bin:/bin:/usr/sbin:/sbin`, TMPDIR: process.env.TMPDIR ?? "/tmp", ORCA_USER_DATA_PATH: this.profile ?? defaultProfile() };
    return new Promise((resolve, reject) => {
      execFile("/bin/bash", [cli, ...args, "--json"], { env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error2, stdout) => {
        let parsed = null;
        try {
          parsed = JSON.parse(stdout);
        } catch {
        }
        if (parsed?.ok) return resolve(parsed.result);
        const message = parsed?.error?.message ?? error2?.message ?? (String(stdout).trim() || "orca CLI failed");
        reject(Object.assign(new Error(message), { code: parsed?.error?.code }));
      });
    });
  }
  /**
   * Runs `orca <args>` and resolves with its output when the command succeeds, without expecting JSON: for capability
   * probes such as `orchestration worker-start --help`, which prints help text and exits 0.
   */
  rawCli(args, timeoutMs = 6e4) {
    const cli = this.cli;
    if (!cli) return Promise.reject(new Error("The orca CLI was not found next to Orca."));
    const env = { HOME: homedir2(), PATH: `${dirname(cli)}:/usr/bin:/bin:/usr/sbin:/sbin`, TMPDIR: process.env.TMPDIR ?? "/tmp", ORCA_USER_DATA_PATH: this.profile ?? defaultProfile() };
    return new Promise((resolve, reject) => {
      execFile("/bin/bash", [cli, ...args], { env, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 }, (error2, stdout) => error2 ? reject(error2) : resolve(String(stdout)));
    });
  }
  // ----- Agents and terminals
  /** The terminal or chat a status event is about: chats come with a pane key only. */
  static handleOf(payload) {
    return payload.terminalId ?? chatHandleFromPaneKey(payload.paneKey);
  }
  noteStatus(payload) {
    const handle = _OrcaAdapter.handleOf(payload);
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
      at: Date.now()
    });
  }
  /** Marks an agent working: it is running a command, so it is in a turn. */
  noteWorking(terminalId) {
    const was = this.agents.get(terminalId);
    if (was) this.agents.set(terminalId, { ...was, state: "working", at: Date.now() });
  }
  stateOf(terminalId) {
    return this.agents.get(terminalId)?.state ?? null;
  }
  /** Idle: waiting for input. Unknown counts as not idle, so nothing is typed into an agent mid-turn. */
  isIdle(terminalId) {
    const state = this.stateOf(terminalId);
    return state === "done" || state === "waiting";
  }
  /** Agents of a workspace. Before host API 1.10, agents.list knows only the focused workspace. */
  async listAgents(workspaceId) {
    const scoped = workspaceId && (this.orca.api.major > 1 || this.orca.api.minor >= 10);
    try {
      const listed = await this.orca.host.call("agents.list", scoped ? { workspaceId } : {});
      const result = { agents: listed.agents.map((row) => row.terminalId || !row.sessionId || !this.chatsBySession.has(row.sessionId) ? row : { ...row, terminalId: this.chatsBySession.get(row.sessionId) }) };
      if (scoped || !workspaceId) return result.agents;
      const focused = await this.focusedWorkspace().catch(() => null);
      const same = (a, b) => !!a && !!b && (a === b || a.endsWith(`::${b.split("::").pop()}`) || b.endsWith(`::${a.split("::").pop()}`));
      return focused?.workspaceId && same(focused.workspaceId, workspaceId) ? result.agents : [];
    } catch {
      return [];
    }
  }
  /**
   * An agent's state when no status event told it yet (the worker just started, or its workspace isn't focused):
   * idle when its terminal printed nothing for a while, else working. Cached for 10 s; null when the terminal is gone.
   */
  probes = /* @__PURE__ */ new Map();
  async probeState(terminalId) {
    const known = this.agents.get(terminalId);
    if (known) return known.state;
    if (isChatHandle(terminalId)) return null;
    const cached2 = this.probes.get(terminalId);
    if (cached2 && Date.now() - cached2.at < 1e4) return cached2.state;
    let state = null;
    try {
      const result = await this.runCli(["terminal", "show", "--terminal", terminalId], 15e3);
      const quiet = Date.now() - (result.terminal.lastOutputAt ?? 0);
      state = result.terminal.connected === false ? null : quiet > 15e3 ? "done" : "working";
    } catch {
      state = null;
    }
    this.probes.set(terminalId, { at: Date.now(), state });
    return state;
  }
  async listWorkspaces() {
    const result = await this.orca.host.call("workspace.list", {});
    return result.workspaces;
  }
  async focusedWorkspace() {
    return this.orca.host.call("workspace.readContext", {});
  }
  async readTerminal(terminalId, maxLines = 400) {
    if (isChatHandle(terminalId)) return [];
    try {
      const result = await this.orca.host.call("terminal.read", { terminalId, maxLines });
      return result.lines;
    } catch {
      return [];
    }
  }
  /** Chats that refused mail as gone: their tab was closed. */
  goneChats = /* @__PURE__ */ new Set();
  /**
   * Whether a chat is still open: Orca lists the agents of its workspace by session, so a chat whose session no longer
   * shows (and that said nothing for a minute) was closed. Without a way to tell, it counts as open.
   */
  async chatAlive(handle) {
    if (this.goneChats.has(handle)) return false;
    const known = this.agents.get(handle);
    const scoped = this.orca.api.major > 1 || this.orca.api.minor >= 10;
    if (!known?.sessionId || !known.workspaceId || !scoped || Date.now() - known.at < 6e4) return true;
    const rows = await this.listAgents(known.workspaceId);
    return !rows.length || rows.some((row) => row.sessionId === known.sessionId);
  }
  /** Whether the terminal (or chat) still runs; a closed one is gone for good. */
  async terminalAlive(terminalId) {
    if (isChatHandle(terminalId)) return this.chatAlive(terminalId);
    try {
      const result = await this.runCli(["terminal", "show", "--terminal", terminalId], 15e3);
      return result.terminal.status !== "exited";
    } catch (error2) {
      return !/not.found|unknown|no terminal|exited/i.test(String(error2.message));
    }
  }
  /** Types text into an agent and submits it, when it is idle; returns whether it went in. */
  async sendIfIdle(terminalId, text) {
    if (!this.isIdle(terminalId)) return false;
    return this.send(terminalId, text);
  }
  /** Types text into an agent's terminal and submits it, wherever the terminal is; a chat gets it as Orca mail. */
  async send(terminalId, text) {
    if (isChatHandle(terminalId)) return this.mail(terminalId, text);
    try {
      const result = await this.runCli(["terminal", "send", "--terminal", terminalId, "--text", text, "--enter"], 3e4);
      if (result.send.accepted) this.noteWorking(terminalId);
      return result.send.accepted;
    } catch {
      try {
        const result = await this.orca.host.call("terminal.sendText", { terminalId, text, enter: true });
        if (result.accepted) this.noteWorking(terminalId);
        return result.accepted;
      } catch {
        return false;
      }
    }
  }
  /** A launch's CLI call (as the lead when it is the one calling), with Orca's refusals as LaunchRefused. */
  async launchCli(args, timeoutMs, as) {
    try {
      return await this.cliAs(as, args, timeoutMs);
    } catch (error2) {
      const message = error2.message;
      const refused = launchRefusal(message);
      throw refused ? new LaunchRefused(refused, message) : error2;
    }
  }
  noteLaunched(handle, agent, surface) {
    this.agents.set(handle, { terminalId: handle, title: null, agent, state: "working", stateStartedAt: Date.now(), workspaceId: null, at: Date.now() });
    if (surface === "chat") this.goneChats.delete(handle);
  }
  /**
   * Starts an agent in the workspace at `path`, as a chat or in a terminal, with an optional model, effort and first
   * prompt. Throws LaunchRefused when Orca refuses the surface or the model before starting anything.
   */
  async launch(input) {
    const surface = input.surface ?? "terminal";
    const args = ["agent", "launch", "--agent", input.agent, "--worktree", `path:${input.path}`, "--surface", surface, "--prompt", input.prompt];
    if (input.model) args.push("--model", input.model);
    if (input.model && input.effort) args.push("--effort", input.effort);
    if (input.focus) args.push("--focus");
    const result = await this.launchCli(args, 12e4, input.as);
    const terminalId = result.outcome?.handle ?? result.agentTerminalHandle;
    if (!terminalId) throw new Error(`Orca did not start ${input.agent}.`);
    const ran = result.outcome?.kind === "structured" || isChatHandle(terminalId) ? "chat" : "terminal";
    this.noteLaunched(terminalId, input.agent, ran);
    return { terminalId, surface: ran };
  }
  /** Creates a worktree workspace in a project and starts the lead in it; returns the lead's terminal or chat. */
  async createWorkspace(input) {
    const args = ["worktree", "create", "--repo", `path:${input.projectPath}`, "--name", input.name, "--agent", input.agent, "--surface", input.surface ?? "terminal", "--prompt", input.prompt, "--activate"];
    if (input.model) args.push("--model", input.model);
    if (input.model && input.effort) args.push("--effort", input.effort);
    if (input.baseBranch) args.push("--base-branch", input.baseBranch);
    const result = await this.launchCli(args, 18e4, input.as);
    const terminalId = result.launch?.outcome?.handle ?? result.agentTerminalHandle;
    if (!terminalId) throw new Error("Orca created the workspace but did not start the lead.");
    const ran = result.launch?.outcome?.kind === "structured" || isChatHandle(terminalId) ? "chat" : "terminal";
    this.noteLaunched(terminalId, input.agent, ran);
    return { terminalId, workspaceId: result.worktree.id, path: result.worktree.path, surface: ran };
  }
  /** Names an agent's tab: a terminal's title, or a chat's name. */
  async rename(handle, title) {
    const args = isChatHandle(handle) ? ["chat", "rename", "--session", chatSessionId(handle), "--name", title] : ["terminal", "rename", "--terminal", handle, "--title", title];
    await this.runCli(args).catch(() => void 0);
  }
  // ----- Mail to chats
  /** The quiet terminal each workspace's mail to chats is sent from, by workspace path. */
  senders = /* @__PURE__ */ new Map();
  /** The terminal mail to chats in the workspace at `path` comes from, made when there is none. */
  async sender(path) {
    const known = this.senders.get(path);
    if (known && await this.terminalAlive(known)) return known;
    const note = [
      "Ensemble: this terminal carries team messages to the lead and members that run as chats.",
      "Keep it open while a team works; closing it is safe, it comes back when needed.",
      "Ensemble\uFF1A\u8FD9\u4E2A\u7EC8\u7AEF\u7528\u6765\u7ED9\u4EE5\u56FE\u5F62\u754C\u9762\uFF08\u804A\u5929\uFF09\u8FD0\u884C\u7684\u534F\u8C03\u5668\u548C\u6210\u5458\u8F6C\u53D1\u56E2\u961F\u6D88\u606F\u3002\u56E2\u961F\u5DE5\u4F5C\u65F6\u8BF7\u4FDD\u7559\u5B83\uFF1B\u5173\u6389\u4E5F\u6CA1\u5173\u7CFB\uFF0C\u9700\u8981\u65F6\u4F1A\u91CD\u65B0\u6253\u5F00\u3002"
    ].join("\n");
    const created = await this.runCli(["terminal", "create", "--worktree", `path:${path}`, "--title", "Ensemble", "--command", `printf '%b
' '${note.replace(/'/g, "")}'; exec tail -f /dev/null`], 6e4);
    this.senders.set(path, created.terminal.handle);
    return created.terminal.handle;
  }
  /**
   * Sends text to a chat as Orca mail: an idle chat gets it as its next message, a busy one when its turn ends. Mail
   * needs a terminal as its sender: the workspace's Ensemble terminal. A chat that is gone refuses it.
   */
  async mail(handle, text) {
    const home = this.chatHome(handle);
    if (!home) return false;
    const subject = (text.replace(/^\[[^\]]*\]\s*/, "").split("\n").find((line) => line.trim()) ?? "Ensemble").trim().slice(0, 80) || "Ensemble";
    const lead = this.chatLead(handle);
    if (callerIs(lead)) {
      try {
        await this.cliAs(lead, ["orchestration", "send", "--to", `orca_session_id:${chatSessionId(handle)}`, "--subject", subject, "--body", text], 3e4);
        this.noteWorking(handle);
        return true;
      } catch {
      }
    }
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const from = await this.sender(home);
      try {
        await this.runCli(["orchestration", "send", "--from", from, "--to", `orca_session_id:${chatSessionId(handle)}`, "--subject", subject, "--body", text], 3e4);
        this.noteWorking(handle);
        return true;
      } catch (error2) {
        const code = error2.code ?? "";
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
  modelLists = /* @__PURE__ */ new Map();
  /**
   * The model selectors an agent lists, run in a login shell so its own PATH applies. OMP 19 prints them as JSON
   * (`omp models --json`); OMP before that, and pi, print the table `--list-models` gave. Cached for 5 minutes; empty
   * when it can't be run.
   */
  async agentModels(agent) {
    const known = this.modelLists.get(agent);
    if (known && Date.now() - known.at < 5 * 6e4) return known.models;
    const shell = process.env.SHELL && existsSync(process.env.SHELL) ? process.env.SHELL : "/bin/zsh";
    let models = agent === "omp" ? await this.ompModelSelectors(shell) : null;
    if (models === null) {
      models = await new Promise((resolve) => {
        execFile(shell, ["-lc", `${agent} --list-models`], { timeout: 2e4, maxBuffer: 4 * 1024 * 1024 }, (error2, stdout) => resolve(error2 && !stdout ? [] : parsePiModels(String(stdout))));
      });
    }
    this.modelLists.set(agent, { at: Date.now(), models });
    return models;
  }
  /** OMP 19's JSON catalog; null on an OMP that predates it, which uses the same table format as Pi. */
  ompModelSelectors(shell) {
    return new Promise((resolve) => {
      execFile(shell, ["-lc", "omp models --json"], { timeout: 2e4, maxBuffer: 4 * 1024 * 1024 }, (error2, stdout) => resolve(error2 ? null : parseOmpModels(String(stdout))));
    });
  }
  /** pi's models as `provider/id`. */
  piModels() {
    return this.agentModels("pi");
  }
  async focusTerminal(terminalId) {
    await this.orca.host.call("terminal.focus", { terminalId }).catch(() => this.runCli(["terminal", "switch", "--terminal", terminalId]).catch(() => void 0));
  }
  async closeTerminal(terminalId) {
    await this.orca.host.call("terminal.close", { terminalId }).catch(() => this.runCli(["terminal", "close", "--terminal", terminalId]).catch(() => void 0));
  }
  async notify(title, body) {
    await this.orca.host.call("notifications.show", { title, ...body ? { body: body.slice(0, 1e3) } : {} }).catch(() => void 0);
  }
  async openFile(workspaceId, path) {
    await this.orca.host.call("editor.open", { workspaceId, path });
  }
};

// src/worker/api.ts
import { existsSync as existsSync3 } from "node:fs";
import { mkdir as mkdir2, writeFile as writeFile3 } from "node:fs/promises";
import { join as join8 } from "node:path";

// src/shared/collab.ts
var MEMBER_POST_KINDS = ["update", "finding", "question", "answer", "done"];
var TASK_STATES = ["todo", "doing", "done", "dropped"];
var MAX_NUDGES = 3;
var MAX_DISPATCHES = 6;
var MAX_TEAM_SIZE = 8;
var TO_ALL = "all";
var MAX_ROUNDS = 3;
var DEFAULT_TEAM_ROUNDS = 2;
function excerpt(text, max) {
  const value = (text ?? "").trim();
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}\u2026`;
}
function newRunId(random = Math.random) {
  return `R${Math.floor(random() * 4294967296).toString(16).padStart(8, "0").toUpperCase()}`;
}
function memberName(member, zh = false) {
  return member.title.trim().toLowerCase() === member.role.trim().toLowerCase() ? member.title : zh ? `${member.title}\uFF08${member.role}\uFF09` : `${member.title} (${member.role})`;
}
function memberTitle(role, taken = []) {
  const name2 = role.trim();
  const used = new Set(taken.map((title) => title.trim().toLowerCase()));
  if (!used.has(name2.toLowerCase())) return name2;
  let n = 2;
  while (used.has(`${name2} ${n}`.toLowerCase())) n += 1;
  return `${name2} ${n}`;
}
function createRun(input) {
  const rounds = input.mode === "team" ? Math.min(MAX_ROUNDS, Math.max(1, input.rounds ?? DEFAULT_TEAM_ROUNDS)) : 1;
  return {
    version: 1,
    id: input.id,
    language: input.language ?? "en",
    leadAgentId: input.leadAgentId,
    workspaceId: input.workspaceId,
    mode: input.mode,
    title: input.title.trim() || input.id,
    reason: input.reason?.trim() ?? "",
    createdAt: input.now,
    updatedAt: input.now,
    status: "active",
    round: 1,
    rounds,
    brief: input.brief ?? null,
    members: [],
    posts: [],
    claims: [],
    tasks: [],
    planApproval: input.mode === "team" && input.planApproval === true,
    leadInboxSeq: 0,
    leadReadSeq: 0,
    notifiedRound: 0,
    events: [],
    eventSeq: 0,
    batches: []
  };
}
function normalizeRun(run) {
  return {
    ...run,
    language: run.language ?? "en",
    planApproval: run.planApproval ?? false,
    leadInboxSeq: run.leadInboxSeq ?? 0,
    events: Array.isArray(run.events) ? run.events : [],
    batches: Array.isArray(run.batches) ? run.batches : [],
    eventSeq: run.eventSeq ?? (Array.isArray(run.events) ? run.events.at(-1)?.seq ?? 0 : 0),
    tasks: (Array.isArray(run.tasks) ? run.tasks : []).map((task) => ({ ...task, plan: task.plan ? { ...task.plan, delivered: task.plan.delivered ?? true } : null, feedback: task.feedback ?? "", returnedBy: task.returnedBy ?? null })),
    members: run.members.map((member) => ({ ...member, dispatches: member.dispatches ?? 0, inboxSeq: member.inboxSeq ?? 0, retired: member.retired ?? false }))
  };
}
function memberOf(run, agentId) {
  return run.members.find((member) => member.agentId === agentId);
}
function updateMember(run, agentId, patch, now2) {
  return { ...run, updatedAt: now2, members: run.members.map((member) => member.agentId === agentId ? { ...member, ...patch } : member) };
}
function upsertMember(run, member, now2) {
  const fresh = { ...member, state: "working", result: null, collected: false, doneRound: 0, readSeq: memberOf(run, member.agentId)?.readSeq ?? 0, nudges: 0, dispatchedAt: now2, dispatches: 0, inboxSeq: memberOf(run, member.agentId)?.inboxSeq ?? 0, retired: false };
  const exists = memberOf(run, member.agentId) !== void 0;
  return { ...run, updatedAt: now2, members: exists ? run.members.map((entry) => entry.agentId === member.agentId ? fresh : entry) : [...run.members, fresh] };
}
function addPost(run, post, now2) {
  const full = { ...post, text: post.text.trim(), seq: (run.posts.at(-1)?.seq ?? 0) + 1, at: now2, round: run.round };
  let next = { ...run, updatedAt: now2, posts: [...run.posts, full] };
  if (post.kind === "done" && post.author !== "lead") {
    next = updateMember(next, post.agentId, { doneRound: run.round }, now2);
    next = releaseFreeClaims(next, post.agentId);
  }
  return { run: next, post: full };
}
function normalizePath(path) {
  const value = path.trim().replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/\/+$/, "");
  return value === "." ? "" : value;
}
function pathsOverlap(a, b) {
  const left = normalizePath(a);
  const right = normalizePath(b);
  return left === "" || right === "" || left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}
function claimPaths(run, agentId, paths, now2) {
  const member = memberOf(run, agentId);
  if (!member) return { run, conflicts: [] };
  const wanted = [...new Set(paths.map(normalizePath))];
  const holders = new Set(run.members.filter((entry) => entry.state === "working" || entry.state === "attention").map((entry) => entry.agentId));
  const conflicts = wanted.flatMap(
    (path) => run.claims.filter((claim2) => claim2.agentId !== agentId && holders.has(claim2.agentId) && pathsOverlap(claim2.path, path)).map((claim2) => ({ path: path || ".", heldBy: claim2.role, held: claim2.path || "." }))
  );
  if (conflicts.length) return { run, conflicts };
  const own2 = new Set(run.claims.filter((claim2) => claim2.agentId === agentId).map((claim2) => claim2.path));
  const added = wanted.filter((path) => !own2.has(path)).map((path) => ({ role: member.role, agentId, path, at: now2 }));
  return { run: { ...run, updatedAt: now2, claims: [...run.claims, ...added] }, conflicts: [] };
}
function releaseFreeClaims(run, agentId) {
  const held = new Set((run.tasks ?? []).filter((task) => task.owner === agentId && task.state === "doing").flatMap((task) => task.files));
  return { ...run, claims: run.claims.filter((claim2) => claim2.agentId !== agentId || held.has(claim2.path)) };
}
function releaseClaims(run, agentId, paths) {
  const drop = paths ? new Set(paths.map(normalizePath)) : null;
  return { ...run, claims: run.claims.filter((claim2) => claim2.agentId !== agentId || drop !== null && !drop.has(claim2.path)) };
}
var busy = (member) => member.state === "working" || member.state === "attention";
function roundComplete(run) {
  return run.members.length > 0 && !run.members.some(busy);
}
function runFinished(run) {
  return roundComplete(run) && (run.mode === "delegation" || run.round >= run.rounds && !dispatchPlan(run).length && !pendingPlans(run).length && !undeliveredVerdicts(run).length);
}
function workingMembers(run) {
  return run.members.filter(busy);
}
function nextStep(run) {
  if (run.status !== "active") return { kind: "none" };
  if (run.mode === "team") {
    const assignments = dispatchPlan(run);
    if (assignments.length) return { kind: "dispatch", assignments };
    const verdicts = undeliveredVerdicts(run);
    const idleOwners = verdicts.filter((task) => memberOf(run, task.owner)?.state === "done").map((task) => task.id);
    if (idleOwners.length) return { kind: "verdicts", taskIds: idleOwners };
    const plans = pendingPlans(run);
    const untold = plans.filter((task) => !task.plan.notified).map((task) => task.id);
    if (untold.length) return { kind: "plans", taskIds: untold };
    if (plans.length || verdicts.length) return { kind: "none" };
  }
  if (!roundComplete(run)) return { kind: "none" };
  if (run.mode === "team" && run.round < run.rounds && run.members.some((member) => member.state === "done")) return { kind: "next-round", round: run.round + 1 };
  if (run.notifiedRound >= run.round) return { kind: "none" };
  if (!run.members.some((member) => !member.collected)) return { kind: "none" };
  return { kind: "notify-lead" };
}
function startRound(run, now2) {
  return {
    ...run,
    updatedAt: now2,
    round: run.round + 1,
    rounds: Math.max(run.rounds, run.round + 1),
    members: run.members.map((member) => member.state === "failed" || member.retired ? member : { ...member, state: "working", collected: false, nudges: 0, dispatches: 0, dispatchedAt: now2 })
  };
}
function wakeMembers(run, agentIds, now2) {
  const ids = new Set(agentIds);
  const complete = roundComplete(run);
  const round = complete ? run.round + 1 : run.round;
  return {
    ...run,
    updatedAt: now2,
    round,
    rounds: Math.max(run.rounds, round),
    members: run.members.map((member) => ids.has(member.agentId) && member.state !== "working" ? { ...member, state: "working", collected: false, nudges: complete ? 0 : member.nudges, dispatches: complete ? 0 : member.dispatches, dispatchedAt: now2 } : member)
  };
}
function startBatch(run, now2) {
  return roundComplete(run) ? { ...run, updatedAt: now2, round: run.round + 1, rounds: run.round + 1 } : run;
}
function addBatch(run, batch, now2) {
  const fresh = { round: run.round, title: batch.title.trim(), reason: batch.reason.trim(), at: now2, taskIds: [], warnings: [...batch.warnings], followUp: batch.followUp, summary: "", summaryAt: null };
  return { ...run, updatedAt: now2, batches: [...run.batches.filter((entry) => entry.round !== run.round), fresh] };
}
function attachPacket(run, taskId) {
  return { ...run, batches: run.batches.map((batch) => batch.round === run.round && !batch.taskIds.includes(taskId) ? { ...batch, taskIds: [...batch.taskIds, taskId] } : batch) };
}
function batchToSummarize(run) {
  const batch = run.batches.at(-1);
  if (run.mode !== "delegation" || !batch || batch.summaryAt || !batch.taskIds.length) return void 0;
  const owners = new Set(batch.taskIds.map((id) => taskOf(run, id)?.owner).filter((owner) => !!owner));
  const members2 = run.members.filter((member) => owners.has(member.agentId));
  return members2.length && members2.every((member) => !busy(member) && member.collected) ? batch : void 0;
}
function summarizeBatch(run, text, now2) {
  const batch = batchToSummarize(run);
  if (!batch) return run;
  return { ...run, updatedAt: now2, batches: run.batches.map((entry) => entry === batch ? { ...entry, summary: excerpt(text, 8e3), summaryAt: now2 } : entry) };
}
function markCollected(run, now2, readSeq) {
  return { ...run, updatedAt: now2, leadReadSeq: Math.max(run.leadReadSeq, readSeq ?? run.posts.at(-1)?.seq ?? 0), members: run.members.map((member) => busy(member) ? member : { ...member, collected: true }) };
}
function finishMember(run, agentId, outcome, lastMessage2, now2) {
  const member = memberOf(run, agentId);
  if (!member) return run;
  let next = updateMember(run, agentId, { state: outcome === "failed" ? "failed" : "done", result: excerpt(lastMessage2, 4e3) || null, collected: false }, now2);
  if (run.mode === "team" && member.doneRound !== run.round) {
    const zh = run.language === "zh";
    const text = outcome === "failed" ? `${zh ? "\uFF08\u51FA\u9519\u505C\u6B62\uFF09" : "(stopped with an error)"} ${excerpt(lastMessage2, 600)}`.trim() : excerpt(lastMessage2, 1500) || (zh ? "\uFF08\u7ED3\u675F\u65F6\u6CA1\u6709\u6700\u7EC8\u56DE\u590D\uFF09" : "(finished without a final reply)");
    next = addPost(next, { author: member.role, agentId, kind: "done", text, to: [], files: [] }, now2).run;
  }
  if (run.mode === "delegation") {
    const finished = outcome === "completed";
    next = { ...next, tasks: next.tasks.map((task) => task.owner === agentId && task.state === "doing" ? { ...task, state: finished ? "done" : "dropped", result: finished ? excerpt(lastMessage2, 300) : `${outcome}: ${excerpt(lastMessage2, 300)}`, updatedAt: now2 } : task) };
    return releaseClaims(next, agentId);
  }
  const keep = (task) => task.plan !== null && (task.plan.status === "pending" || !task.plan.delivered);
  const held = next.tasks.filter((task) => task.owner === agentId && task.state === "doing" && !keep(task));
  if (held.length) {
    next = { ...next, tasks: next.tasks.map((task) => held.includes(task) ? { ...task, state: "todo", owner: null, ownerTitle: null, plan: null, returnedBy: agentId, updatedAt: now2 } : task) };
    const ids = held.map((task) => task.id).join(", ");
    next = addPost(next, { author: "lead", agentId: run.leadAgentId, kind: "note", text: run.language === "zh" ? `${member.title} \u672C\u8F6E\u7ED3\u675F\u65F6\u6CA1\u6709\u5B8C\u6210 ${ids}\uFF0C\u5DF2\u653E\u56DE\u4EFB\u52A1\u677F\u3002` : `${member.title} ended its turn without finishing ${ids}; back on the board.`, to: [], files: [] }, now2).run;
  }
  const kept = new Set(next.tasks.filter((task) => task.owner === agentId && task.state === "doing").flatMap((task) => task.files));
  return { ...next, claims: next.claims.filter((claim2) => claim2.agentId !== agentId || kept.has(claim2.path)) };
}
var say = (run, en, zh) => run.language === "zh" ? zh : en;
var sameRole = (a, b) => (a ?? "").trim().toLowerCase() === (b ?? "").trim().toLowerCase();
function taskOf(run, id) {
  return run.tasks.find((task) => task.id.toLowerCase() === id.trim().toLowerCase());
}
function waitingOn(run, task) {
  return task.deps.filter((dep) => {
    const state = taskOf(run, dep)?.state;
    return state !== "done" && state !== "dropped";
  });
}
function taskReady(run, task) {
  return task.state === "todo" && waitingOn(run, task).length === 0;
}
function mayTake(member, task) {
  return task.role === null || sameRole(task.role, member.role);
}
function addTasks(run, tasks, createdBy, now2) {
  const errors = [];
  const added = [];
  let number3 = run.tasks.reduce((max, task) => Math.max(max, Number(task.id.slice(1)) || 0), 0);
  tasks.forEach((input, index) => {
    const deps = [];
    for (const ref of input.after ?? []) {
      const trimmed = String(ref).trim();
      const position = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN;
      const byPosition = Number.isInteger(position) && position >= 1 && position <= index ? added[position - 1] : void 0;
      const target = byPosition ?? taskOf({ ...run, tasks: [...run.tasks, ...added] }, trimmed);
      if (!target) errors.push(say(run, `task ${index + 1} ("${input.title}"): "${trimmed}" is not an earlier task`, `\u4EFB\u52A1 ${index + 1}\uFF08\u300C${input.title}\u300D\uFF09\uFF1A\u300C${trimmed}\u300D\u4E0D\u662F\u6392\u5728\u5B83\u524D\u9762\u7684\u4EFB\u52A1`));
      else if (!deps.includes(target.id)) deps.push(target.id);
    }
    number3 += 1;
    added.push({
      id: `T${number3}`,
      title: input.title.trim(),
      detail: (input.detail ?? "").trim(),
      role: input.role?.trim() ? input.role.trim() : null,
      deps,
      files: [...new Set((input.files ?? []).map(normalizePath))],
      state: "todo",
      owner: null,
      ownerTitle: null,
      result: "",
      plan: null,
      feedback: "",
      returnedBy: null,
      createdBy,
      updatedAt: now2
    });
  });
  if (errors.length) return { run, added: [], errors };
  return { run: { ...run, updatedAt: now2, tasks: [...run.tasks, ...added] }, added, errors };
}
function claimTask(run, agentId, id, now2) {
  const member = memberOf(run, agentId);
  if (!member) return { run, error: say(run, "You are not a member of this run.", "\u4F60\u4E0D\u662F\u8FD9\u6B21\u8FD0\u884C\u7684\u6210\u5458\u3002") };
  if (member.retired) return { run, error: say(run, "You were replaced in this run; take no more tasks.", "\u4F60\u5728\u8FD9\u6B21\u8FD0\u884C\u4E2D\u5DF2\u88AB\u66FF\u6362\uFF0C\u4E0D\u8981\u518D\u9886\u53D6\u4EFB\u52A1\u3002") };
  const ready = run.tasks.filter((task2) => taskReady(run, task2) && mayTake(member, task2));
  const task = id ? taskOf(run, id) : ready.find((entry) => entry.role !== null) ?? ready[0];
  if (!task) return { run, error: id ? say(run, `There is no task ${id}.`, `\u6CA1\u6709\u4EFB\u52A1 ${id}\u3002`) : say(run, "No open task is ready for you.", "\u73B0\u5728\u6CA1\u6709\u53EF\u4EE5\u9886\u53D6\u7684\u4EFB\u52A1\u3002") };
  if (task.state === "doing") return { run, error: say(run, `${task.id} is already taken by ${task.ownerTitle ?? "another member"}.`, `${task.id} \u5DF2\u88AB ${task.ownerTitle ?? "\u5176\u4ED6\u6210\u5458"} \u9886\u53D6\u3002`) };
  if (task.state !== "todo") return { run, error: say(run, `${task.id} is ${task.state}.`, `${task.id} \u7684\u72B6\u6001\u662F ${task.state}\u3002`) };
  if (!mayTake(member, task)) return { run, error: say(run, `${task.id} is for the ${task.role} role.`, `${task.id} \u6307\u5B9A\u7ED9\u89D2\u8272 ${task.role}\u3002`) };
  const waiting = waitingOn(run, task);
  if (waiting.length) return { run, error: say(run, `${task.id} waits for ${waiting.join(", ")}.`, `${task.id} \u9700\u8981\u7B49\u5F85 ${waiting.join(", ")} \u5B8C\u6210\u3002`) };
  let next = run;
  if (task.files.length) {
    const result = claimPaths(next, agentId, task.files, now2);
    if (result.conflicts.length) return { run, error: say(run, `${task.id}'s files are held: ${result.conflicts.map((conflict) => `${conflict.path} by ${conflict.heldBy}`).join("; ")}. Take another task or ask them on the board.`, `${task.id} \u7684\u6587\u4EF6\u5DF2\u88AB\u5360\u7528\uFF1A${result.conflicts.map((conflict) => `${conflict.path}\uFF08${conflict.heldBy}\uFF09`).join("\uFF1B")}\u3002\u8BF7\u9886\u53D6\u5176\u4ED6\u4EFB\u52A1\uFF0C\u6216\u5728\u9ED1\u677F\u4E0A\u95EE\u5BF9\u65B9\u3002`) };
    next = result.run;
  }
  const taken = { ...task, state: "doing", owner: agentId, ownerTitle: member.title, plan: null, returnedBy: null, updatedAt: now2 };
  return { run: { ...next, updatedAt: now2, tasks: next.tasks.map((entry) => entry.id === task.id ? taken : entry) }, task: taken };
}
function completeTask(run, agentId, id, result, now2) {
  const task = taskOf(run, id);
  if (!task) return { run, error: say(run, `There is no task ${id}.`, `\u6CA1\u6709\u4EFB\u52A1 ${id}\u3002`) };
  if (task.owner !== agentId || task.state !== "doing") return { run, error: say(run, `${task.id} is not yours to finish (${task.state}${task.ownerTitle ? `, ${task.ownerTitle}` : ""}). Claim it first.`, `${task.id} \u4E0D\u662F\u4F60\u6B63\u5728\u505A\u7684\u4EFB\u52A1\uFF08${task.state}${task.ownerTitle ? `\uFF0C${task.ownerTitle}` : ""}\uFF09\uFF0C\u8BF7\u5148\u9886\u53D6\u3002`) };
  if (run.planApproval && task.plan?.status !== "approved") return { run, error: say(run, `${task.id} needs an approved plan first: submit it (action "plan") and end your turn; the lead approves or sends it back.`, `${task.id} \u9700\u8981\u5148\u901A\u8FC7\u8BA1\u5212\u5BA1\u6279\uFF1A\u63D0\u4EA4\u8BA1\u5212\uFF08action "plan"\uFF09\u540E\u7ED3\u675F\u672C\u8F6E\uFF0C\u7531\u534F\u8C03\u5668\u6279\u51C6\u6216\u6253\u56DE\u3002`) };
  if (!result.trim()) return { run, error: say(run, "Say what you changed and how you checked it in the result.", "\u8BF7\u5728 result \u91CC\u5199\u6E05\u6539\u4E86\u4EC0\u4E48\u3001\u600E\u4E48\u9A8C\u8BC1\u7684\u3002") };
  const done = { ...task, state: "done", result: result.trim(), updatedAt: now2 };
  const next = task.files.length ? releaseClaims(run, agentId, task.files) : run;
  return { run: { ...next, updatedAt: now2, tasks: next.tasks.map((entry) => entry.id === task.id ? done : entry) }, task: done };
}
function releaseTask(run, agentId, id, now2) {
  const task = taskOf(run, id);
  if (!task || task.owner !== agentId || task.state !== "doing") return { run, error: say(run, `${id} is not a task you are working on.`, `${id} \u4E0D\u662F\u4F60\u6B63\u5728\u505A\u7684\u4EFB\u52A1\u3002`) };
  const next = task.files.length ? releaseClaims(run, agentId, task.files) : run;
  return { run: { ...next, updatedAt: now2, tasks: next.tasks.map((entry) => entry.id === task.id ? { ...entry, state: "todo", owner: null, ownerTitle: null, plan: null, returnedBy: agentId, updatedAt: now2 } : entry) } };
}
function updateTasks(run, changes, now2) {
  const errors = [];
  let next = run;
  for (const change of changes) {
    const task = taskOf(next, change.id);
    if (!task) {
      errors.push(say(run, `There is no task ${change.id}.`, `\u6CA1\u6709\u4EFB\u52A1 ${change.id}\u3002`));
      continue;
    }
    let deps = task.deps;
    if (change.after) {
      const position = next.tasks.indexOf(task);
      const earlier = new Set(next.tasks.slice(0, position).map((entry) => entry.id.toLowerCase()));
      const bad = change.after.filter((dep) => !earlier.has(dep.trim().toLowerCase()));
      if (bad.length) {
        errors.push(say(run, `${task.id} can only wait for earlier tasks, not ${bad.join(", ")}.`, `${task.id} \u53EA\u80FD\u7B49\u5F85\u6392\u5728\u5B83\u524D\u9762\u7684\u4EFB\u52A1\uFF0C\u4E0D\u80FD\u7B49\u5F85 ${bad.join(", ")}\u3002`));
        continue;
      }
      deps = change.after.map((dep) => taskOf(next, dep).id);
    }
    const reassigned = change.role !== void 0 && !sameRole(change.role, task.role);
    const reopen = change.state === "todo" || reassigned && task.state === "doing";
    const owner = reopen || change.state === "dropped" ? null : task.owner;
    if (task.owner && owner === null && task.files.length) next = releaseClaims(next, task.owner, task.files);
    const updated = {
      ...task,
      title: change.title?.trim() || task.title,
      detail: change.detail !== void 0 ? change.detail.trim() : task.detail,
      role: change.role !== void 0 ? change.role?.trim() ? change.role.trim() : null : task.role,
      deps,
      state: change.state ?? (reopen ? "todo" : task.state),
      owner,
      ownerTitle: owner ? task.ownerTitle : null,
      plan: owner ? task.plan : null,
      feedback: change.feedback !== void 0 ? change.feedback.trim() : task.feedback,
      returnedBy: reopen || reassigned ? null : task.returnedBy,
      updatedAt: now2
    };
    next = { ...next, updatedAt: now2, tasks: next.tasks.map((entry) => entry.id === task.id ? updated : entry) };
  }
  return { run: next, errors };
}
function dispatchPlan(run) {
  if (run.status !== "active" || run.mode !== "team") return [];
  const reopen = roundComplete(run) && run.notifiedRound >= run.round;
  const holding = new Set(run.tasks.filter((task) => task.state === "doing" && task.owner).map((task) => task.owner));
  const idle = run.members.filter((member) => member.state === "done" && !member.retired && !holding.has(member.agentId) && (reopen || member.dispatches < MAX_DISPATCHES));
  const used = /* @__PURE__ */ new Set();
  const assignments = [];
  for (const task of run.tasks) {
    if (!taskReady(run, task)) continue;
    const fits = (member2) => !used.has(member2.agentId) && member2.agentId !== task.returnedBy && (task.files.length === 0 || claimPaths(run, member2.agentId, task.files, run.updatedAt).conflicts.length === 0);
    const member = idle.find((entry) => fits(entry) && task.role !== null && sameRole(task.role, entry.role)) ?? (task.role === null ? idle.find(fits) : void 0);
    if (!member) continue;
    used.add(member.agentId);
    assignments.push({ taskId: task.id, agentId: member.agentId });
  }
  return assignments;
}
function assignTasks(run, assignments, now2) {
  const reopen = roundComplete(run) && run.notifiedRound >= run.round;
  let next = reopen ? { ...run, round: run.round + 1, rounds: Math.max(run.rounds, run.round + 1) } : run;
  for (const { taskId, agentId } of assignments) {
    const member = memberOf(next, agentId);
    const task = taskOf(next, taskId);
    if (!member || !task || !taskReady(next, task) || member.state === "working") continue;
    const taken = claimTask(next, agentId, task.id, now2);
    if (!taken.task) continue;
    next = updateMember(taken.run, agentId, { state: "working", collected: false, dispatchedAt: now2, dispatches: (reopen ? 0 : member.dispatches) + 1 }, now2);
  }
  return { ...next, updatedAt: now2 };
}
function rejectTask(run, id, feedback, now2) {
  const task = taskOf(run, id);
  if (!task) return { run, error: say(run, `There is no task ${id}.`, `\u6CA1\u6709\u4EFB\u52A1 ${id}\u3002`) };
  if (task.state !== "done") return { run, error: say(run, `${task.id} is ${task.state}; only a done task can be sent back.`, `${task.id} \u7684\u72B6\u6001\u662F ${task.state}\uFF0C\u53EA\u80FD\u6253\u56DE\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\u3002`) };
  if (!feedback.trim()) return { run, error: say(run, "Say what is wrong, so the next owner can fix it.", "\u8BF7\u5199\u660E\u95EE\u9898\u6240\u5728\uFF0C\u65B9\u4FBF\u4E0B\u4E00\u4E2A\u8D1F\u8D23\u4EBA\u4FEE\u6B63\u3002") };
  const reopened = { ...task, state: "todo", owner: null, ownerTitle: null, plan: null, returnedBy: null, feedback: feedback.trim(), result: `previous attempt: ${excerpt(task.result, 300)}`, updatedAt: now2 };
  return { run: { ...run, updatedAt: now2, tasks: run.tasks.map((entry) => entry.id === task.id ? reopened : entry) }, task: reopened };
}
function submitPlan(run, agentId, id, text, now2) {
  if (!run.planApproval) return { run, error: say(run, "This run doesn't need plan approval; go ahead with the task.", "\u8FD9\u6B21\u8FD0\u884C\u4E0D\u9700\u8981\u8BA1\u5212\u5BA1\u6279\uFF0C\u76F4\u63A5\u505A\u4EFB\u52A1\u5373\u53EF\u3002") };
  const task = taskOf(run, id);
  if (!task || task.owner !== agentId || task.state !== "doing") return { run, error: say(run, `${id} is not a task you are working on. Claim it first.`, `${id} \u4E0D\u662F\u4F60\u6B63\u5728\u505A\u7684\u4EFB\u52A1\uFF0C\u8BF7\u5148\u9886\u53D6\u3002`) };
  if (!text.trim()) return { run, error: say(run, "The plan is empty.", "\u8BA1\u5212\u662F\u7A7A\u7684\u3002") };
  const planned = { ...task, plan: { text: text.trim(), status: "pending", feedback: "", notified: false, delivered: false }, updatedAt: now2 };
  return { run: { ...run, updatedAt: now2, tasks: run.tasks.map((entry) => entry.id === task.id ? planned : entry) }, task: planned };
}
function markPlansNotified(run, taskIds, notified, now2) {
  const ids = new Set(taskIds);
  return { ...run, updatedAt: now2, tasks: run.tasks.map((task) => ids.has(task.id) && task.plan ? { ...task, plan: { ...task.plan, notified } } : task) };
}
function reviewPlan(run, id, approve, feedback, now2) {
  const task = taskOf(run, id);
  if (!task?.plan || task.plan.status !== "pending" || task.state !== "doing") return { run, error: say(run, `${id} has no plan waiting for approval.`, `${id} \u6CA1\u6709\u5F85\u5BA1\u6279\u7684\u8BA1\u5212\u3002`) };
  if (!approve && !feedback.trim()) return { run, error: say(run, "Say what to change when you send a plan back.", "\u6253\u56DE\u8BA1\u5212\u65F6\u8BF7\u5199\u660E\u8981\u6539\u4EC0\u4E48\u3002") };
  const reviewed = { ...task, plan: { ...task.plan, status: approve ? "approved" : "rejected", feedback: feedback.trim(), delivered: false }, updatedAt: now2 };
  return { run: { ...run, updatedAt: now2, tasks: run.tasks.map((entry) => entry.id === task.id ? reviewed : entry) }, task: reviewed };
}
function pendingPlans(run) {
  return run.tasks.filter((task) => task.state === "doing" && task.plan?.status === "pending");
}
function addressedTo(post, member) {
  return post.to.some((to) => sameRole(to, member.role) || sameRole(to, member.title) || sameRole(to, TO_ALL));
}
function inboxOf(run, agentId) {
  const member = memberOf(run, agentId);
  if (!member) return [];
  return run.posts.filter((post) => post.seq > member.inboxSeq && post.agentId !== agentId && addressedTo(post, member));
}
function leadInbox(run) {
  return run.posts.filter((post) => post.seq > run.leadInboxSeq && post.author !== "lead" && post.to.some((to) => sameRole(to, "lead")));
}
function inboxText(posts, lang = "en") {
  if (!posts.length) return "";
  return [WORDS[lang].inbox(posts.length), ...posts.map((post) => postLine(post, lang))].join("\n");
}
function markInbox(run, agentId, seq, now2) {
  if (agentId === "lead") return { ...run, updatedAt: now2, leadInboxSeq: Math.max(run.leadInboxSeq, seq) };
  return updateMember(run, agentId, { inboxSeq: Math.max(memberOf(run, agentId)?.inboxSeq ?? 0, seq) }, now2);
}
function unstaffedRoles(run) {
  if (run.status !== "active" || run.mode !== "team") return [];
  const staffed = (role) => run.members.some((member) => !member.retired && member.state !== "failed" && sameRole(member.role, role));
  const roles = [];
  for (const task of run.tasks) {
    if (task.role && taskReady(run, task) && !staffed(task.role) && !roles.some((role) => sameRole(role, task.role))) roles.push(task.role);
  }
  return roles;
}
function retireRole(run, role, now2) {
  const leaving = run.members.filter((member) => sameRole(member.role, role) && !member.retired).map((member) => member.agentId);
  if (!leaving.length) return run;
  return {
    ...run,
    updatedAt: now2,
    members: run.members.map((member) => leaving.includes(member.agentId) ? { ...member, retired: true } : member),
    tasks: run.tasks.map((task) => task.owner && leaving.includes(task.owner) && task.state === "doing" ? { ...task, state: "todo", owner: null, ownerTitle: null, plan: null, returnedBy: null, updatedAt: now2 } : task),
    claims: run.claims.filter((claim2) => !leaving.includes(claim2.agentId))
  };
}
function undeliveredVerdicts(run) {
  return run.tasks.filter((task) => task.state === "doing" && task.owner !== null && task.plan !== null && task.plan.status !== "pending" && !task.plan.delivered);
}
function markVerdictsDelivered(run, taskIds, delivered, now2) {
  const ids = new Set(taskIds);
  return { ...run, updatedAt: now2, tasks: run.tasks.map((task) => ids.has(task.id) && task.plan ? { ...task, plan: { ...task.plan, delivered } } : task) };
}
function touchMember(run, agentId, now2) {
  const member = memberOf(run, agentId);
  if (!member || member.retired || member.state !== "done") return run;
  return updateMember(run, agentId, { state: "working", collected: false, dispatchedAt: new Date(Date.parse(now2) - 5e3).toISOString() }, now2);
}
var WORDS = {
  en: {
    taskState: { todo: "todo", doing: "doing", done: "done", dropped: "dropped" },
    waitsFor: "waits for",
    anyone: "anyone",
    result: "result",
    plan: "plan",
    planStatus: { pending: "pending", approved: "approved", rejected: "rejected" },
    lead: "lead",
    sentBack: "sent back",
    files: "files",
    noTasks: "No tasks on the board.",
    tasks: "Tasks",
    round: "round",
    empty: "The board is empty.",
    noNew: (seq) => `No new posts since #${seq}.`,
    more: (seq) => `\u2026 more posts after #${seq}; read again with since ${seq}.`,
    inbox: (count) => `\u{1F4EC} ${count} new message${count === 1 ? "" : "s"} for you:`,
    requirements: "Requirements",
    acceptance: "Acceptance criteria",
    constraints: "Constraints",
    outOfScope: "Out of scope",
    memberState: { working: "working", done: "finished", attention: "needs attention", failed: "failed" },
    runState: { closed: "closed", finished: "finished", progress: "in progress" },
    run: (id, mode, pattern, title) => `Run ${id} (${mode} mode, ${pattern}) "${title}"`,
    roundOf: (round, rounds) => `round ${round} of ${rounds}`,
    batch: (round) => `batch ${round}`,
    task: "task",
    claims: "Claims",
    noMembers: "no members yet",
    board: (count, unread) => `Board: ${count} posts, ${unread} unread.`,
    mode: { team: "team", delegation: "delegation" },
    colon: ": ",
    comma: ", ",
    paren: (text) => ` (${text})`
  },
  zh: {
    taskState: { todo: "\u5F85\u529E", doing: "\u8FDB\u884C\u4E2D", done: "\u5DF2\u5B8C\u6210", dropped: "\u5DF2\u53D6\u6D88" },
    waitsFor: "\u7B49\u5F85",
    anyone: "\u4EFB\u4F55\u4EBA",
    result: "\u7ED3\u679C",
    plan: "\u8BA1\u5212",
    planStatus: { pending: "\u5F85\u5BA1\u6279", approved: "\u5DF2\u6279\u51C6", rejected: "\u5DF2\u6253\u56DE" },
    lead: "\u534F\u8C03\u5668",
    sentBack: "\u88AB\u6253\u56DE",
    files: "\u6587\u4EF6",
    noTasks: "\u4EFB\u52A1\u677F\u4E0A\u8FD8\u6CA1\u6709\u4EFB\u52A1\u3002",
    tasks: "\u4EFB\u52A1",
    round: "\u7B2C",
    empty: "\u9ED1\u677F\u4E0A\u8FD8\u6CA1\u6709\u5E16\u5B50\u3002",
    noNew: (seq) => `#${seq} \u4E4B\u540E\u6CA1\u6709\u65B0\u5E16\u5B50\u3002`,
    more: (seq) => `\u2026\u2026 #${seq} \u4E4B\u540E\u8FD8\u6709\u5E16\u5B50\uFF1B\u7528 since ${seq} \u7EE7\u7EED\u8BFB\u53D6\u3002`,
    inbox: (count) => `\u{1F4EC} \u4F60\u6709 ${count} \u6761\u65B0\u6D88\u606F\uFF1A`,
    requirements: "\u9700\u6C42",
    acceptance: "\u9A8C\u6536\u6807\u51C6",
    constraints: "\u7EA6\u675F",
    outOfScope: "\u4E0D\u5728\u8303\u56F4\u5185",
    memberState: { working: "\u8FDB\u884C\u4E2D", done: "\u5DF2\u5B8C\u6210", attention: "\u9700\u5904\u7406", failed: "\u5931\u8D25" },
    runState: { closed: "\u5DF2\u7ED3\u675F", finished: "\u5DF2\u5B8C\u6210", progress: "\u8FDB\u884C\u4E2D" },
    run: (id, mode, pattern, title) => `\u8FD0\u884C ${id}\uFF08${mode}\u6A21\u5F0F\uFF0C${pattern}\uFF09\u300C${title}\u300D`,
    roundOf: (round, rounds) => `\u7B2C ${round}/${rounds} \u8F6E`,
    batch: (round) => `\u7B2C ${round} \u6279`,
    task: "\u4EFB\u52A1",
    claims: "\u5DF2\u8BA4\u9886",
    noMembers: "\u8FD8\u6CA1\u6709\u6210\u5458",
    board: (count, unread) => `\u9ED1\u677F\uFF1A${count} \u6761\u5E16\u5B50\uFF0C${unread} \u6761\u672A\u8BFB\u3002`,
    mode: { team: "\u56E2\u961F", delegation: "\u59D4\u6D3E" },
    colon: "\uFF1A",
    comma: "\uFF0C",
    paren: (text) => `\uFF08${text}\uFF09`
  }
};
function taskLine(run, task, lang = run.language ?? "en") {
  const w = WORDS[lang];
  const waiting = task.state === "todo" ? waitingOn(run, task) : [];
  const state = waiting.length ? `${w.taskState.todo}${w.comma}${w.waitsFor} ${waiting.join(", ")}` : w.taskState[task.state];
  const who = task.ownerTitle ? ` \u2014 ${task.ownerTitle}` : "";
  const result = task.result && (task.state === "done" || task.state === "todo") ? `
    ${w.result}${w.colon}${excerpt(task.result, 200)}` : "";
  const plan = task.plan ? `
    ${w.plan}${w.paren(w.planStatus[task.plan.status]).trimStart()}${w.colon}${excerpt(task.plan.text, 200)}${task.plan.feedback ? ` \xB7 ${w.lead}${w.colon}${excerpt(task.plan.feedback, 160)}` : ""}` : "";
  const feedback = task.feedback && task.state !== "done" ? `
    ${w.sentBack}${w.colon}${excerpt(task.feedback, 200)}` : "";
  return `- ${task.id} [${state}] (${task.role ?? w.anyone}) ${task.title}${who}${task.files.length ? ` \xB7 ${w.files}${w.colon}${task.files.join(", ")}` : ""}${result}${plan}${feedback}`;
}
function taskBoardText(run, lang = run.language ?? "en") {
  const w = WORDS[lang];
  if (!run.tasks.length) return w.noTasks;
  const counts = TASK_STATES.map((state) => `${run.tasks.filter((task) => task.state === state).length} ${w.taskState[state]}`).join(w.comma);
  return [`${w.tasks}${w.paren(counts)}${w.colon.trimEnd()}`, ...run.tasks.map((task) => taskLine(run, task, lang))].join("\n");
}
function postLine(post, lang = "en") {
  const w = WORDS[lang];
  const to = post.to.length ? ` \u2192 ${post.to.join(", ")}` : "";
  const files = post.files.length ? `
  ${w.files}${w.colon}${post.files.join(", ")}` : "";
  const round = lang === "zh" ? `[\u7B2C ${post.round} \u8F6E]` : `[round ${post.round}]`;
  return `#${post.seq} ${round} ${post.author} \xB7 ${post.kind}${to}
${post.text.split("\n").map((line) => `  ${line}`).join("\n")}${files}`;
}
function boardPage(run, since, budget) {
  const w = WORDS[run.language ?? "en"];
  const posts = run.posts.filter((post) => post.seq > since);
  if (!posts.length) return { text: since ? w.noNew(since) : w.empty, lastSeq: since, more: false };
  const lines = [];
  let used = 0;
  let lastSeq = since;
  for (const post of posts) {
    const line = postLine(post, run.language ?? "en");
    if (lines.length && used + line.length + 2 > budget) break;
    lines.push(line);
    used += line.length + 2;
    lastSeq = post.seq;
  }
  const more = lastSeq < posts.at(-1).seq;
  return { text: lines.join("\n\n") + (more ? `

${w.more(lastSeq)}` : ""), lastSeq, more };
}
function briefText(brief, lang = "en") {
  const w = WORDS[lang];
  const list = (title, items) => items.length ? [`${title}${lang === "zh" ? "\uFF1A" : ":"}`, ...items.map((item) => `- ${item}`)] : [];
  return [
    `# ${brief.title}`,
    brief.goal,
    ...list(w.requirements, brief.requirements),
    ...list(w.acceptance, brief.acceptance),
    ...list(w.constraints, brief.constraints),
    ...list(w.outOfScope, brief.outOfScope)
  ].join("\n");
}
function runSummary(run) {
  const lang = run.language ?? "en";
  const w = WORDS[lang];
  const state = run.status === "closed" ? w.runState.closed : runFinished(run) ? w.runState.finished : w.runState.progress;
  const head = `${w.run(run.id, w.mode[run.mode], MODE_SPECS[run.mode].pattern, run.title)} \xB7 ${state} \xB7 ${run.mode === "team" ? w.roundOf(run.round, run.rounds) : w.batch(run.round)}`;
  const members2 = run.members.map((member) => `- ${memberName(member, lang === "zh")}: ${w.memberState[member.state]}${member.task ? ` \xB7 ${w.task}: ${excerpt(member.task, 120)}` : ""}`);
  const claims = run.claims.length ? [`${w.claims}:`, ...run.claims.map((claim2) => `- ${claim2.role}: ${claim2.path || "."}`)] : [];
  return [head, ...members2.length ? members2 : [`- ${w.noMembers}`], ...claims, run.tasks.length ? taskBoardText(run) : "", run.mode === "team" ? w.board(run.posts.length, run.posts.filter((post) => post.seq > run.leadReadSeq).length) : ""].filter(Boolean).join("\n");
}
var squash = (text) => text.toLowerCase().replace(/\s+/g, " ").replace(/^["'“”「」『』]+|["'“”「」『』]+$/g, "").trim();
function confirmsBrief(conversation, after, quote) {
  const needle = squash(quote);
  if (!needle) return false;
  const position = typeof after === "number" ? { seq: after } : after;
  const later = (message) => "at" in position ? message.at !== void 0 && Date.parse(message.at) > Date.parse(position.at) : message.seq > position.seq;
  return conversation.some((message) => {
    if (message.role !== "user" || !later(message) || [PLUGIN_MESSAGE_PREFIX, LEGACY_MESSAGE_PREFIX].some((prefix) => message.text.trimStart().startsWith(prefix))) return false;
    const text = squash(message.text);
    return text.includes(needle) && needle.length >= Math.min(text.length, Math.ceil(text.length * 0.4));
  });
}

// src/shared/prompt.ts
var prompt_exports = {};
__export(prompt_exports, {
  assignmentPrompt: () => assignmentPrompt,
  broadcastPrompt: () => broadcastPrompt,
  chatNote: () => chatNote,
  delegationTaskPrompt: () => delegationTaskPrompt,
  leadNoticePrompt: () => leadNoticePrompt,
  leadStartPrompt: () => leadStartPrompt,
  memberStartPrompt: () => memberStartPrompt,
  memberSystemPrompt: () => memberSystemPrompt,
  mentionPrompt: () => mentionPrompt,
  modeChangedPrompt: () => modeChangedPrompt,
  orchestratorPrompt: () => orchestratorPrompt,
  planReviewedPrompt: () => planReviewedPrompt,
  planWaitingPrompt: () => planWaitingPrompt,
  roleHeader: () => roleHeader,
  teamChangedMessage: () => teamChangedMessage,
  teamKickoffPrompt: () => teamKickoffPrompt,
  teamRoundPrompt: () => teamRoundPrompt,
  verdictLine: () => verdictLine
});

// node_modules/zod/v4/core/util.js
var util_exports = {};
__export(util_exports, {
  BIGINT_FORMAT_RANGES: () => BIGINT_FORMAT_RANGES,
  CONSTANT_CATCH: () => CONSTANT_CATCH,
  Class: () => Class,
  NUMBER_FORMAT_RANGES: () => NUMBER_FORMAT_RANGES,
  aborted: () => aborted,
  allowsEval: () => allowsEval,
  assert: () => assert,
  assertEqual: () => assertEqual,
  assertIs: () => assertIs,
  assertNever: () => assertNever,
  assertNotEqual: () => assertNotEqual,
  assignProp: () => assignProp,
  attachSchema: () => attachSchema,
  base64ToUint8Array: () => base64ToUint8Array,
  base64urlToUint8Array: () => base64urlToUint8Array,
  cached: () => cached,
  captureStackTrace: () => captureStackTrace,
  cleanEnum: () => cleanEnum,
  cleanRegex: () => cleanRegex,
  clone: () => clone,
  cloneDef: () => cloneDef,
  codePointLength: () => codePointLength,
  constantCatch: () => constantCatch,
  createTransparentProxy: () => createTransparentProxy,
  defineLazy: () => defineLazy,
  defineLazyInternal: () => defineLazyInternal,
  derived: () => derived,
  esc: () => esc,
  escapeRegex: () => escapeRegex,
  explicitlyAborted: () => explicitlyAborted,
  extend: () => extend,
  finalizeIssue: () => finalizeIssue,
  floatSafeRemainder: () => floatSafeRemainder,
  getElementAtPath: () => getElementAtPath,
  getEnumValues: () => getEnumValues,
  getLengthableOrigin: () => getLengthableOrigin,
  getParsedType: () => getParsedType,
  getSizableOrigin: () => getSizableOrigin,
  hexToUint8Array: () => hexToUint8Array,
  hide: () => hide,
  installLazyProp: () => installLazyProp,
  isObject: () => isObject,
  isPlainObject: () => isPlainObject,
  issue: () => issue,
  joinValues: () => joinValues,
  jsonStringifyReplacer: () => jsonStringifyReplacer,
  members: () => members,
  merge: () => merge,
  mergeDefs: () => mergeDefs,
  normalizeParams: () => normalizeParams,
  nullish: () => nullish,
  numKeys: () => numKeys,
  objectClone: () => objectClone,
  omit: () => omit,
  optionalKeys: () => optionalKeys,
  own: () => own,
  parsedType: () => parsedType,
  partial: () => partial,
  pick: () => pick,
  prefixIssues: () => prefixIssues,
  primitiveTypes: () => primitiveTypes,
  promiseAllObject: () => promiseAllObject,
  propertyKeyTypes: () => propertyKeyTypes,
  randomString: () => randomString,
  rawShape: () => rawShape,
  required: () => required,
  safeExtend: () => safeExtend,
  shallowClone: () => shallowClone,
  sizeCaps: () => sizeCaps,
  slugify: () => slugify,
  stringifyPrimitive: () => stringifyPrimitive,
  toZod: () => toZod,
  uint8ArrayToBase64: () => uint8ArrayToBase64,
  uint8ArrayToBase64url: () => uint8ArrayToBase64url,
  uint8ArrayToHex: () => uint8ArrayToHex,
  unwrapMessage: () => unwrapMessage
});
function assertEqual(val) {
  return val;
}
function assertNotEqual(val) {
  return val;
}
function toZod() {
  return (schema) => schema;
}
function assertIs(_arg) {
}
function assertNever(_x) {
  throw new Error("Unexpected value in exhaustive check");
}
function assert(_) {
}
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array2, separator = "|") {
  return array2.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}
var Cached = class {
  constructor(getter) {
    this._getter = getter;
    this._value = void 0;
  }
  get value() {
    const getter = this._getter;
    if (getter !== void 0) {
      this._value = getter();
      this._getter = void 0;
    }
    return this._value;
  }
};
function cached(getter) {
  return new Cached(getter);
}
function nullish(input) {
  return input === null || input === void 0;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
var EVALUATING = /* @__PURE__ */ Symbol("evaluating");
function defineLazy(object2, key2, getter) {
  let value = void 0;
  Object.defineProperty(object2, key2, {
    get() {
      if (value === EVALUATING) {
        return void 0;
      }
      if (value === void 0) {
        value = EVALUATING;
        value = getter();
      }
      return value;
    },
    set(v) {
      Object.defineProperty(object2, key2, {
        value: v
        // configurable: true,
      });
    },
    configurable: true
  });
}
function objectClone(obj) {
  return Object.create(Object.getPrototypeOf(obj), Object.getOwnPropertyDescriptors(obj));
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function rawShape(def) {
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  return desc?.get ? desc.get.raw : desc?.value;
}
function sourceShape(schema) {
  return rawShape(schema._zod.def) ?? schema._zod.def.shape;
}
function deferProp(target, key2, getter) {
  Object.defineProperty(target, key2, {
    get() {
      const value = getter();
      assignProp(this, key2, value);
      return value;
    },
    enumerable: true,
    configurable: true
  });
}
function putProp(target, key2, value) {
  if (key2 in target)
    assignProp(target, key2, value);
  else
    target[key2] = value;
}
function mirrorShape(target, source, keys, wrap) {
  const raw = sourceShape(source);
  for (const key2 of keys) {
    const desc = Object.getOwnPropertyDescriptor(raw, key2);
    if (!desc.enumerable)
      continue;
    if (desc.get) {
      deferProp(target, key2, () => {
        const value = source._zod.def.shape[key2];
        return wrap ? wrap(value, key2) : value;
      });
    } else
      putProp(target, key2, wrap ? wrap(desc.value, key2) : desc.value);
  }
}
function mirrorProps(target, source) {
  for (const key2 of Reflect.ownKeys(source)) {
    const desc = Object.getOwnPropertyDescriptor(source, key2);
    if (!desc.enumerable)
      continue;
    if (desc.get)
      deferProp(target, key2, () => source[key2]);
    else
      putProp(target, key2, desc.value);
  }
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function cloneDef(schema) {
  return mergeDefs(schema._zod.def);
}
function getElementAtPath(obj, path) {
  if (!path)
    return obj;
  return path.reduce((acc, key2) => acc?.[key2], obj);
}
function promiseAllObject(promisesObj) {
  const keys = Object.keys(promisesObj);
  const promises = keys.map((key2) => promisesObj[key2]);
  return Promise.all(promises).then((results) => {
    const resolvedObj = {};
    for (let i = 0; i < keys.length; i++) {
      resolvedObj[keys[i]] = results[i];
    }
    return resolvedObj;
  });
}
function randomString(length = 10) {
  const chars = "abcdefghijklmnopqrstuvwxyz";
  let str = "";
  for (let i = 0; i < length; i++) {
    str += chars[Math.floor(Math.random() * chars.length)];
  }
  return str;
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {
};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === void 0)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
function numKeys(data) {
  let keyCount = 0;
  for (const key2 in data) {
    if (Object.prototype.hasOwnProperty.call(data, key2)) {
      keyCount++;
    }
  }
  return keyCount;
}
var getParsedType = (data) => {
  const t = typeof data;
  switch (t) {
    case "undefined":
      return "undefined";
    case "string":
      return "string";
    case "number":
      return Number.isNaN(data) ? "nan" : "number";
    case "boolean":
      return "boolean";
    case "function":
      return "function";
    case "bigint":
      return "bigint";
    case "symbol":
      return "symbol";
    case "object":
      if (Array.isArray(data)) {
        return "array";
      }
      if (data === null) {
        return "null";
      }
      if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
        return "promise";
      }
      if (typeof Map !== "undefined" && data instanceof Map) {
        return "map";
      }
      if (typeof Set !== "undefined" && data instanceof Set) {
        return "set";
      }
      if (typeof Date !== "undefined" && data instanceof Date) {
        return "date";
      }
      if (typeof File !== "undefined" && data instanceof File) {
        return "file";
      }
      return "object";
    default:
      throw new Error(`Unknown data type: ${t}`);
  }
};
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
var primitiveTypes = /* @__PURE__ */ new Set([
  "string",
  "number",
  "bigint",
  "boolean",
  "symbol",
  "undefined"
]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== void 0) {
    if (params?.error !== void 0)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function createTransparentProxy(getter) {
  let target;
  return new Proxy({}, {
    get(_, prop, receiver) {
      target ?? (target = getter());
      return Reflect.get(target, prop, receiver);
    },
    set(_, prop, value, receiver) {
      target ?? (target = getter());
      return Reflect.set(target, prop, value, receiver);
    },
    has(_, prop) {
      target ?? (target = getter());
      return Reflect.has(target, prop);
    },
    deleteProperty(_, prop) {
      target ?? (target = getter());
      return Reflect.deleteProperty(target, prop);
    },
    ownKeys(_) {
      target ?? (target = getter());
      return Reflect.ownKeys(target);
    },
    getOwnPropertyDescriptor(_, prop) {
      target ?? (target = getter());
      return Reflect.getOwnPropertyDescriptor(target, prop);
    },
    defineProperty(_, prop, descriptor) {
      target ?? (target = getter());
      return Reflect.defineProperty(target, prop, descriptor);
    }
  });
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin !== void 0 && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = /* @__PURE__ */ (() => ({
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-34028234663852886e22, 34028234663852886e22],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}))();
var BIGINT_FORMAT_RANGES = {
  int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
  uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const newShape = {};
  mirrorShape(newShape, schema, maskedKeys(schema, mask));
  return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
}
function maskedKeys(schema, mask) {
  const raw = sourceShape(schema);
  const keys = [];
  for (const key2 of Reflect.ownKeys(mask)) {
    if (!Object.getOwnPropertyDescriptor(raw, key2)?.enumerable) {
      throw new Error(`Unrecognized key: "${String(key2)}"`);
    }
    if (mask[key2])
      keys.push(key2);
  }
  return keys;
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const omitted = new Set(maskedKeys(schema, mask));
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key2) => !omitted.has(key2)));
  return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = sourceShape(schema);
    for (const key2 of Reflect.ownKeys(shape)) {
      if (Object.getOwnPropertyDescriptor(existingShape, key2) !== void 0) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function extended(schema, shape) {
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
  mirrorProps(newShape, shape);
  return newShape;
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function merge(a, b) {
  if (!b?._zod?.def) {
    throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
  }
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const newShape = {};
  mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
  mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
  const def = mergeDefs(a._zod.def, {
    shape: newShape,
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class2, schema, mask, name2 = "partial") {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(`.${name2}() cannot be used on object schemas containing refinements`);
  }
  const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class2 && ((value, key2) => selected && !selected.has(key2) ? value : new Class2({ type: "optional", innerType: value })));
  return clone(schema, mergeDefs(schema._zod.def, { shape: newShape, checks: [] }));
}
function required(Class2, schema, mask) {
  const selected = mask ? new Set(maskedKeys(schema, mask)) : void 0;
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key2) => (
    // overwrite with non-optional
    selected && !selected.has(key2) ? value : new Class2({ type: "nonoptional", innerType: value })
  ));
  return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex; i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a3;
    (_a3 = iss).path ?? (_a3.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function sizeCaps(defChecks) {
  const caps = [];
  for (const ch of defChecks ?? []) {
    const d = ch._zod.def;
    if (!/_(length|size)$|_equals$/.test(d.check))
      break;
    const max = d.maximum ?? d.length ?? d.size;
    if (max >= 0)
      caps.push([max, ch]);
  }
  return caps;
}
function attachSchema(issues, start, inst) {
  var _a3;
  for (let i = start; i < issues.length; i++) {
    (_a3 = issues[i]).schema ?? (_a3.schema = inst);
  }
}
function finalizeIssue(iss, ctx, config2) {
  var _a3;
  const traits = iss.inst?._zod?.traits;
  if (traits?.has("$ZodType")) {
    if (traits.has("$ZodCheck"))
      (_a3 = iss).schema ?? (_a3.schema = iss.inst);
    else
      iss.schema = iss.inst;
  }
  const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : void 0;
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config2.customError?.(iss)) ?? unwrapMessage(config2.localeError?.(iss)) ?? "Invalid input";
  const full = {};
  for (const k of Object.keys(iss)) {
    if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__")
      continue;
    full[k] = iss[k];
  }
  full.path ?? (full.path = []);
  full.message = message;
  if (ctx?.reportInput) {
    full.input = iss.input;
  }
  return full;
}
function getSizableOrigin(input) {
  if (input instanceof Set)
    return "set";
  if (input instanceof Map)
    return "map";
  if (input instanceof File)
    return "file";
  return "unknown";
}
var highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str) {
  const units = str.length;
  if (!highSurrogate.test(str))
    return units;
  let count = units;
  for (let i = 0; i < units - 1; i++) {
    if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
      count--;
      i++;
    }
  }
  return count;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function parsedType(data) {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
        return obj.constructor.name;
      }
    }
  }
  return t;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function cleanEnum(obj) {
  return Object.entries(obj).filter(([k, _]) => {
    return Number.isNaN(Number.parseInt(k, 10));
  }).map((el) => el[1]);
}
function base64ToUint8Array(base642) {
  const binaryString = atob(base642);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}
function uint8ArrayToBase64(bytes) {
  let binaryString = "";
  for (let i = 0; i < bytes.length; i++) {
    binaryString += String.fromCharCode(bytes[i]);
  }
  return btoa(binaryString);
}
function base64urlToUint8Array(base64url2) {
  const base642 = base64url2.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - base642.length % 4) % 4);
  return base64ToUint8Array(base642 + padding);
}
function uint8ArrayToBase64url(bytes) {
  return uint8ArrayToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}
function hexToUint8Array(hex) {
  const cleanHex = hex.replace(/^0x/, "");
  if (cleanHex.length % 2 !== 0) {
    throw new Error("Invalid hex string length");
  }
  const bytes = new Uint8Array(cleanHex.length / 2);
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(cleanHex.slice(i, i + 2), 16);
  }
  return bytes;
}
function uint8ArrayToHex(bytes) {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
var Class = class {
  constructor(..._args) {
  }
};
function members(proto, table) {
  for (const key2 in table) {
    const desc = Object.getOwnPropertyDescriptor(table, key2);
    if (desc.get)
      Object.defineProperty(proto, key2, { ...desc, enumerable: false });
    else
      defineBound(proto, key2, desc.value);
  }
}
function own(inst, key2, value, enumerable = true) {
  Object.defineProperty(inst, key2, { configurable: true, writable: true, enumerable, value });
  return value;
}
function hide(inst, key2, value) {
  return own(inst, key2, value, false);
}
// @__NO_SIDE_EFFECTS__
function derived(computes, table) {
  for (const key2 in computes) {
    const compute = computes[key2];
    Object.defineProperty(table, key2, {
      configurable: true,
      enumerable: true,
      get() {
        return own(this, key2, compute(this));
      },
      set(value) {
        own(this, key2, value);
      }
    });
  }
  return table;
}
function defineBound(proto, key2, fn) {
  Object.defineProperty(proto, key2, {
    configurable: true,
    get() {
      return this == null ? fn : own(this, key2, fn.bind(this));
    },
    set(value) {
      own(this, key2, value);
    }
  });
}
function claim(inst, sentinel) {
  const proto = Object.getPrototypeOf(inst);
  return sentinel in proto ? void 0 : proto;
}
var installing;
var broke = false;
var breaker = {
  configurable: true,
  get() {
    broke = true;
    return void 0;
  }
};
function defineLazyInternal(inst, key2, compute) {
  const proto = Object.getPrototypeOf(inst._zod);
  if (key2 in proto && installing !== inst._zod) {
    installing = void 0;
    return;
  }
  installing = inst._zod;
  Object.defineProperty(proto, key2, {
    configurable: true,
    get() {
      Object.defineProperty(this, key2, breaker);
      const outer = broke;
      broke = false;
      try {
        const value = compute(this);
        if (broke)
          delete this[key2];
        else
          Object.defineProperty(this, key2, { configurable: true, writable: true, value });
        broke = broke || outer;
        return value;
      } catch (err) {
        delete this[key2];
        broke = broke || outer;
        throw err;
      }
    },
    set(value) {
      Object.defineProperty(this, key2, { configurable: true, writable: true, value });
    }
  });
}
function installLazyProp(inst, key2, make, enumerable) {
  const proto = claim(inst, key2);
  if (!proto)
    return;
  Object.defineProperty(proto, key2, {
    configurable: true,
    get() {
      const desc = { configurable: true, writable: true, enumerable, value: void 0 };
      Object.defineProperty(this, key2, desc);
      desc.value = make(this);
      Object.defineProperty(this, key2, desc);
      return desc.value;
    },
    set(value) {
      Object.defineProperty(this, key2, { configurable: true, writable: true, enumerable, value });
    }
  });
}
var CONSTANT_CATCH = "~constantCatch";
function constantCatch(value) {
  const fn = () => value;
  fn[CONSTANT_CATCH] = true;
  return fn;
}

// node_modules/zod/v4/core/core.js
var _a;
var _zodDesc = { value: void 0, enumerable: false };
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
  const E = _E;
  if (E) {
    const saved = E.stackTraceLimit;
    if (typeof saved === "number") {
      try {
        E.stackTraceLimit = 0;
      } catch {
        _E = null;
        return new Definition();
      }
      try {
        return new Definition();
      } finally {
        E.stackTraceLimit = saved;
      }
    }
  }
  return new Definition();
}
// @__NO_SIDE_EFFECTS__
function $constructor(name2, initializer3, proto, params) {
  const zodProto = {};
  function Internals(def) {
    this.def = def;
    this.constr = _;
    this.traits = /* @__PURE__ */ new Set();
  }
  Internals.prototype = zodProto;
  const protoMembers = proto;
  const initialized = protoMembers && /* @__PURE__ */ new WeakSet();
  function init(inst, def) {
    if (!inst._zod) {
      _zodDesc.value = new Internals(def);
      try {
        Object.defineProperty(inst, "_zod", _zodDesc);
      } finally {
        _zodDesc.value = void 0;
      }
    } else if (inst._zod.traits.has(name2)) {
      return;
    }
    inst._zod.traits.add(name2);
    initializer3(inst, def);
    if (initialized) {
      const own2 = Object.getPrototypeOf(inst);
      const ctorProto = inst._zod.constr.prototype;
      let up = own2;
      while (up && up !== ctorProto)
        up = Object.getPrototypeOf(up);
      const target = up ?? own2;
      if (!initialized.has(target)) {
        initialized.add(target);
        members(target, protoMembers);
      }
    }
    const proto2 = _.prototype;
    for (const k in proto2) {
      if (!Object.prototype.hasOwnProperty.call(proto2, k))
        continue;
      if (!(k in inst)) {
        inst[k] = proto2[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;
  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name2 });
  function _(def) {
    const inst = params?.Parent ? newError(Definition) : this;
    init(inst, def);
    const deferred = inst._zod.deferred;
    if (deferred) {
      for (const fn of deferred) {
        fn();
      }
      inst._zod.deferred = void 0;
    }
    const pp = globalThis.__zod_globalConfig?.postProcessor;
    if (pp)
      pp(inst);
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name2);
    }
  });
  Object.defineProperty(_, "name", { value: name2 });
  return _;
}
var $ZodAsyncError = class extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
};
var $ZodEncodeError = class extends Error {
  constructor(name2) {
    super(`Encountered unidirectional transform during encode: ${name2}`);
    this.name = "ZodEncodeError";
  }
};
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}

// node_modules/zod/v4/core/errors.js
function _getMessage() {
  const internals = this._zod;
  internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
  return internals.message;
}
function _setMessage(value) {
  this._zod.message = value;
}
var _messageDesc = {
  get: _getMessage,
  set: _setMessage,
  enumerable: true,
  configurable: true
};
var _issuesDesc = { value: void 0, enumerable: false };
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  _issuesDesc.value = def;
  Object.defineProperty(inst, "issues", _issuesDesc);
  _issuesDesc.value = void 0;
  Object.defineProperty(inst, "message", _messageDesc);
  const proto = Object.getPrototypeOf(inst);
  if (!_installedToString.has(proto)) {
    _installedToString.add(proto);
    Object.defineProperty(proto, "toString", {
      configurable: true,
      enumerable: false,
      get() {
        const value = () => this.message;
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
      }
    });
  }
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, void 0, {
  Parent: Error
});
function node(obj, key2, make) {
  if (!Object.prototype.hasOwnProperty.call(obj, key2)) {
    if (key2 === "__proto__") {
      Object.defineProperty(obj, key2, { value: make(), writable: true, enumerable: true, configurable: true });
    } else {
      obj[key2] = make();
    }
  }
  return obj[key2];
}
function flattenError(error2, mapper = (issue2) => issue2.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error2.issues) {
    if (sub.path.length > 0) {
      node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error2, mapper = (issue2) => issue2.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error3, path = []) => {
    for (const issue2 of error3.issues) {
      if (issue2.code === "invalid_union" && issue2.errors.length) {
        issue2.errors.map((issues) => processError({ issues }, [...path, ...issue2.path]));
      } else if (issue2.code === "invalid_key") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else if (issue2.code === "invalid_element") {
        processError({ issues: issue2.issues }, [...path, ...issue2.path]);
      } else {
        const fullpath = [...path, ...issue2.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue2));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (el === "_errors") {
              if (terminal)
                curr._errors.push(mapper(issue2));
              i++;
              continue;
            }
            if (!Object.prototype.hasOwnProperty.call(curr, el)) {
              Object.defineProperty(curr, el, {
                value: { _errors: [] },
                enumerable: true,
                writable: true,
                configurable: true
              });
            }
            const node2 = curr[el];
            if (terminal) {
              node2._errors.push(mapper(issue2));
            }
            curr = node2;
            i++;
          }
        }
      }
    }
  };
  processError(error2);
  return fieldErrors;
}

// node_modules/zod/v4/core/parse.js
function finalizeParams(callee, params) {
  return { callee: params?.callee ?? callee, Err: params?.Err };
}
var _parse = (_Err) => {
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new $ZodAsyncError();
    }
    if (result.issues.length) {
      const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, _params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var _parseAsync = (_Err) => {
  const fn = async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    if (result.issues.length) {
      const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
function failure(Err, issues, ctx) {
  let error2;
  return {
    success: false,
    get error() {
      if (!error2) {
        error2 = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
        issues = void 0;
        ctx = void 0;
      }
      return error2;
    },
    set error(e) {
      error2 = e;
      issues = void 0;
      ctx = void 0;
    }
  };
}
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
var COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
var COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
var validate = ((schema, value, _ctx) => {
  const validator = schema._zod.bag.validator;
  if (validator !== void 0) {
    if (validator(value) !== COMPILE_INVALID)
      return true;
    if (validator.definite === true && _ctx === void 0)
      return false;
  }
  return validateFallback(schema, value, _ctx);
});
function validateFallback(schema, value, _ctx) {
  const ctx = _ctx ? { ..._ctx, async: false, abortEarly: true } : { async: false, abortEarly: true };
  const fallbackRun = schema._zod.bag.fallbackRun;
  let result;
  if (fallbackRun) {
    ctx[COMPILE_FALLBACK] = true;
    result = fallbackRun({ value, issues: [] }, ctx);
  } else {
    result = schema._zod.run({ value, issues: [] }, ctx);
  }
  if (result instanceof Promise) {
    throw new $ZodAsyncError();
  }
  return result.issues.length === 0;
}
var validateAsync = async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true, abortEarly: true } : { async: true, abortEarly: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length === 0;
};
var _encode = (_Err) => {
  const parse2 = _parse(_Err);
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return parse2(schema, value, ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _decode = (_Err) => {
  const parse2 = _parse(_Err);
  const fn = (schema, value, _ctx, _params) => {
    return parse2(schema, value, _ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _encodeAsync = (_Err) => {
  const parseAsync2 = _parseAsync(_Err);
  const fn = async (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return await parseAsync2(schema, value, ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _decodeAsync = (_Err) => {
  const parseAsync2 = _parseAsync(_Err);
  const fn = async (schema, value, _ctx, _params) => {
    return await parseAsync2(schema, value, _ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};

// node_modules/zod/v4/core/regexes.js
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
function nanoidOfLength(length) {
  return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
}
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version2) => {
  if (!version2)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version2}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
function anchor(source) {
  return new RegExp(`^${source}$`);
}
var date = /* @__PURE__ */ anchor(dateSource);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const opts = ["Z"];
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const qualified = `${timeSource({ precision: args.precision, seconds: true })}(?:${opts.join("|")})`;
  const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var anyString = /^[\s\S]{0,}$/;
var integer = /^-?\d+$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;

// node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a3;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a3 = inst._zod).onattach ?? (_a3.onattach = []);
});
var _whenHasLength = (payload) => {
  const val = payload.value;
  return !nullish(val) && val.length !== void 0;
};
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? (
      // `value % 0n` throws, and nothing is a multiple of zero — the number branch already fails this way via NaN
      def.value !== BigInt(0) && payload.value % def.value === BigInt(0)
    ) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a3;
  $ZodCheck.init(inst, def);
  (_a3 = inst._zod.def).when ?? (_a3.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units > def.maximum ? codePointLength(input) : units;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a3;
  $ZodCheck.init(inst, def);
  (_a3 = inst._zod.def).when ?? (_a3.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a3;
  $ZodCheck.init(inst, def);
  (_a3 = inst._zod.def).when ?? (_a3.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a3, _b;
  $ZodCheck.init(inst, def);
  if (def.pattern)
    (_a3 = inst._zod).check ?? (_a3.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {
    });
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// node_modules/zod/v4/core/doc.js
var Doc = class {
  constructor(args = [], closed = {}) {
    this.content = [];
    this.indent = 0;
    this.args = args;
    this.closed = closed;
  }
  // the compiler catches a child's throw and keeps writing into this doc, so the indent has to unwind with it
  indented(fn) {
    this.indent += 1;
    try {
      fn(this);
    } finally {
      this.indent -= 1;
    }
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split("\n").filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const content = this?.content ?? [``];
    const factory = new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {
${content.join("\n")}
};`);
    return factory(...Object.values(this.closed));
  }
};

// node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 6,
  patch: 7
};

// node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a3;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const defChecks = inst._zod.def.checks;
  const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a3 = inst._zod).deferred ?? (_a3.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks2, ctx) => {
      if (payload.memo)
        return payload;
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks2) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError();
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          attachSchema(payload.issues, currLen, inst);
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return checkResult.then((checkResult2) => inst._zod.parse(checkResult2, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary2) => {
            return handleCanaryResult(canary2, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError();
        return result.then((result2) => runChecks(result2, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
}, {
  // Wrappers extend this by installing a richer factory over it; reading it eagerly would defeat the laziness.
  get "~standard"() {
    return hide(this, "~standard", standardProps(this));
  },
  set "~standard"(value) {
    own(this, "~standard", value);
  }
});
var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync2(inst, value) {
  const ctx = { async: true };
  return toStandardResult(await inst._zod.run({ value, issues: [] }, ctx), ctx);
}
function standardProps(inst) {
  return {
    validate: (value) => {
      const ctx = { async: false };
      try {
        const r = inst._zod.run({ value, issues: [] }, ctx);
        if (!(r instanceof Promise))
          return toStandardResult(r, ctx);
      } catch (_) {
      }
      return validateAsync2(inst, value);
    },
    vendor: "zod",
    version: 1
  };
}
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = def.pattern ?? anyString;
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_2) {
      }
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === void 0)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var URL_BAD_FORMAT = 1;
var URL_UNPARSEABLE = 2;
function canParseURL(input) {
  try {
    if (typeof URL !== "undefined" && typeof URL.canParse === "function")
      return URL.canParse(input);
    new URL(input);
    return true;
  } catch {
    return false;
  }
}
function validateURL(trimmed, def) {
  if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) {
    return canParseURL(trimmed) || URL_UNPARSEABLE;
  }
  return parseURLObject(trimmed, def);
}
function parseURLObject(trimmed, def) {
  if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) {
    return URL_BAD_FORMAT;
  }
  try {
    if (typeof URL !== "undefined") {
      const URLStatic = URL;
      if (typeof URLStatic.parse === "function")
        return URLStatic.parse(trimmed) ?? URL_UNPARSEABLE;
    }
    return new URL(trimmed);
  } catch {
    return URL_UNPARSEABLE;
  }
}
var asciiTabOrNewline = /[\t\n\r]/g;
function stripTabAndNewline(value) {
  return value.replace(asciiTabOrNewline, "");
}
function urlHostnameOk(url, hostname) {
  hostname.lastIndex = 0;
  return hostname.test(url.hostname);
}
function urlProtocolOk(url, protocol) {
  protocol.lastIndex = 0;
  return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
}
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      const url = validateURL(trimmed, def);
      if (url === URL_BAD_FORMAT) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          note: "Invalid URL format",
          input: payload.value,
          inst,
          continue: !def.abort
        });
        return;
      }
      if (url === URL_UNPARSEABLE) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          input: payload.value,
          inst,
          continue: !def.abort
        });
        return;
      }
      if (url === true) {
        payload.value = stripTabAndNewline(trimmed);
        return;
      }
      if (def.hostname && !urlHostnameOk(url, def.hostname)) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          note: "Invalid hostname",
          pattern: def.hostname.source,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
      if (def.protocol && !urlProtocolOk(url, def.protocol)) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          note: "Invalid protocol",
          pattern: def.protocol.source,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
      payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  if (def.length !== void 0 && (!Number.isInteger(def.length) || def.length < 1))
    throw new Error(`Invalid nanoid length: ${def.length}`);
  def.pattern ?? (def.pattern = def.length === void 0 ? nanoid : nanoidOfLength(def.length));
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
});
var ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
function isValidIPv6(value) {
  if (!ipv6Alphabet.test(value))
    return false;
  return canParseURL(`http://[${value}]`);
}
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (!isValidIPv6(payload.value)) {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
function isValidCIDRv6(value) {
  const parts = value.split("/");
  if (parts.length !== 2)
    return false;
  const [address, prefix] = parts;
  if (!prefix)
    return false;
  const prefixNum = Number(prefix);
  if (`${prefixNum}` !== prefix)
    return false;
  if (prefixNum < 0 || prefixNum > 128)
    return false;
  return isValidIPv6(address);
}
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (!isValidCIDRv6(payload.value)) {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64Charset);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var base64urlCharset = /^[A-Za-z0-9_-]*$/;
function isValidBase64URL(data) {
  if (!base64urlCharset.test(data))
    return false;
  const base642 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base642.padEnd(Math.ceil(base642.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64urlCharset);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : void 0 : void 0;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {
      }
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function capSize(inst, size) {
  const caps = sizeCaps(inst._zod.def.checks);
  if (!caps.length)
    return;
  const cap = Math.min(...caps.map((c) => c[0]));
  const parse2 = inst._zod.parse;
  inst._zod.parse = (payload, ctx) => {
    const n = size(payload.value);
    if (n > cap && !ctx?.skipChecks && ctx?.direction !== "backward") {
      for (const [max, ch] of sizeCaps(inst._zod.def.checks)) {
        if (n > max && ch._zod.def.when(payload)) {
          const start = payload.issues.length;
          ch._zod.check(payload);
          payload.issues[start].continue = false;
          attachSchema(payload.issues, start, inst);
          return payload;
        }
      }
    }
    return parse2(payload, ctx);
  };
}
var arraySize = (input) => Array.isArray(input) ? input.length : -1;
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  const memo2 = globalConfig.memoizer;
  memo2?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo2 ? memo2.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
    const proms = [];
    const abortEarly = ctx?.abortEarly;
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result2) => handleArrayResult(result2, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
        if (abortEarly && result.issues.length !== 0 && aborted(result))
          break;
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
  capSize(inst, arraySize);
});
function handlePropertyResult(result, final, key2, input, optin, optout) {
  const isPresent = key2 in input;
  const isOptionalOut = optout === "optional";
  if (!isPresent && isOptionalOut && optin === "optional") {
    return;
  }
  if (result.issues.length) {
    if (optin !== void 0 && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key2, result.issues));
  }
  if (!isPresent && optin === void 0) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: void 0,
        path: [key2]
      });
    }
    return;
  }
  if (result.value === void 0) {
    if (isPresent || optin === "defaulted" && !isOptionalOut) {
      final.value[key2] = void 0;
    }
  } else {
    final.value[key2] = result.value;
  }
}
var NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  const ownSymbols = Object.getOwnPropertySymbols(def.shape);
  const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
  const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
  for (const k of allKeys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    allKeys,
    symbolKeys,
    // string-only: handleCatchall matches it against `for...in`, which never yields a symbol
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const optin = _catchall.optin;
  const optout = _catchall.optout;
  let seen = 0;
  for (const key2 in input) {
    if (abortEarly && payload.issues.length !== seen) {
      if (aborted(payload, seen))
        break;
      seen = payload.issues.length;
    }
    if (keySet.has(key2))
      continue;
    if (key2 === "__proto__") {
      if (t === "never")
        unrecognized.push(key2);
      continue;
    }
    if (t === "never") {
      unrecognized.push(key2);
      continue;
    }
    const r = _catchall.run({ value: input[key2], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r2) => handlePropertyResult(r2, payload, key2, input, optin, optout)));
    } else {
      handlePropertyResult(r, payload, key2, input, optin, optout);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst,
      // Describes the shape of the input, not the validity of the parsed value, so it never aborts. The parse still fails; the schema's own checks just get to run first, and an enclosing intersection can reconcile the key against a sibling operand.
      continue: true
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  const sh = desc?.get ? desc.get.raw : def.shape ?? {};
  if (sh) {
    const get = () => {
      const newSh = { ...sh };
      Object.defineProperty(def, "shape", { value: newSh });
      get.raw = newSh;
      return newSh;
    };
    get.raw = sh;
    Object.defineProperty(def, "shape", { get });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazyInternal(inst, "propValues", (zod) => {
    const shape = zod.def.shape;
    const propValues = {};
    for (const key2 in shape) {
      const field = shape[key2]._zod;
      if (field.values) {
        if (!Object.prototype.hasOwnProperty.call(propValues, key2)) {
          assignProp(propValues, key2, /* @__PURE__ */ new Set());
        }
        for (const v of field.values)
          propValues[key2].add(v);
        if (field.optin !== void 0)
          propValues[key2].add(void 0);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  const memo2 = globalConfig.memoizer;
  memo2?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo2 ? memo2.alloc(inst, payload, {}, ctx) : {};
    const proms = [];
    const shape = value.shape;
    const abortEarly = ctx?.abortEarly;
    let seen = payload.issues.length;
    for (const key2 of value.allKeys) {
      if (abortEarly && payload.issues.length !== seen) {
        if (aborted(payload, seen))
          break;
        seen = payload.issues.length;
      }
      if (key2 === "__proto__")
        continue;
      const el = shape[key2];
      const optin = el._zod.optin;
      const optout = el._zod.optout;
      const r = el._zod.run({ value: input[key2], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r2) => handlePropertyResult(r2, payload, key2, input, optin, optout)));
      } else {
        handlePropertyResult(r, payload, key2, input, optin, optout);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
  };
});
var $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const memo2 = globalConfig.memoizer;
  const generateFastpass = (shape) => {
    const normalized = _normalized.value;
    const syms = normalized.symbolKeys;
    const doc = new Doc(["payload", "ctx"], { shape, inst, memo: memo2, syms });
    const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
    doc.write(`const input = payload.value;`);
    const ids = /* @__PURE__ */ Object.create(null);
    let counter = 0;
    for (const key2 of normalized.allKeys) {
      ids[key2] = `key_${counter++}`;
    }
    doc.write(memo2 ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
    for (const key2 of normalized.allKeys) {
      if (key2 === "__proto__")
        continue;
      const id = ids[key2];
      const k = typeof key2 === "symbol" ? `syms[${syms.indexOf(key2)}]` : esc(key2);
      const isPresent = `${k} in input`;
      const schema = shape[key2];
      const optin = schema?._zod?.optin;
      const isOptionalIn = optin !== void 0;
      const isOptionalOut = schema?._zod?.optout === "optional";
      doc.write(`const ${id} = ${parseStr(k)};`);
      if (isOptionalIn && isOptionalOut) {
        const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
        doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
      } else if (!isOptionalIn) {
        doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
      } else {
        doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
      `);
        if (optin === "defaulted") {
          doc.write(`newResult[${k}] = ${id}.value;`);
        } else {
          doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k}] = ${id}.value;
        }
      `);
        }
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    return doc.compile();
  };
  let fastpass;
  const isObject2 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst, ctx?.abortEarly === true);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== void 0) ? "optional" : void 0);
  defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : void 0);
  defineLazyInternal(inst, "values", (zod) => {
    if (zod.def.options.every((o) => o._zod.values)) {
      return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return void 0;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    if (zod.def.options.every((o) => o._zod.pattern)) {
      const patterns = zod.def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return void 0;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results2) => {
      return handleUnionResults(results2, payload, inst, ctx);
    });
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left2, right2]) => {
        return handleIntersectionResults(payload, left2, right2);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key2) => bKeys.indexOf(key2) !== -1);
    const newObj = { ...a, ...b };
    if (Object.prototype.hasOwnProperty.call(newObj, "__proto__"))
      delete newObj.__proto__;
    for (const key2 of sharedKeys) {
      if (key2 === "__proto__")
        continue;
      const sharedValue = mergeValues(a[key2], b[key2]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key2, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key2] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0; index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = /* @__PURE__ */ new Map();
  let unrecIssue;
  const keyIssues = /* @__PURE__ */ new Map();
  const collect = (iss, side) => {
    let keys;
    if (iss.code === "unrecognized_keys" && !iss.path?.length) {
      unrecIssue ?? (unrecIssue = iss);
      keys = iss.keys;
    } else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
      const k = String(iss.path[0]);
      if (!keyIssues.has(k))
        keyIssues.set(k, iss);
      keys = [k];
    } else {
      return false;
    }
    for (const k of keys) {
      if (!unrecKeys.has(k))
        unrecKeys.set(k, {});
      unrecKeys.get(k)[side] = true;
    }
    return true;
  };
  for (const iss of left.issues) {
    if (!collect(iss, "l"))
      result.issues.push(iss);
  }
  for (const iss of right.issues) {
    if (!collect(iss, "r"))
      result.issues.push(iss);
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length) {
    const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
    if (aggregated.length)
      result.issues.push({ ...unrecIssue, keys: aggregated });
    for (const k of bothKeys) {
      if (!aggregated.includes(k) && keyIssues.has(k))
        result.issues.push(keyIssues.get(k));
    }
  }
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    if (aborted(result))
      return result;
    throw new Error(`Unmergable intersection. Error path: ${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  defineLazyInternal(inst, "pattern", (zod) => {
    const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
    return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  const values = new Set(def.values);
  inst._zod.values = values;
  defineLazyInternal(inst, "pattern", (zod) => {
    const vals = zod.def.values;
    return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  globalConfig.memoizer?.guard(inst);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output2) => {
        payload.value = output2;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError();
    }
    payload.value = _out;
    return payload;
  };
});
function handleOptionalResult(payload, result) {
  payload.value = result.issues.length ? void 0 : result.value;
  return payload;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
  inst._zod.optout = "optional";
  defineLazyInternal(inst, "values", (zod) => {
    const values = zod.def.innerType._zod.values;
    return values ? /* @__PURE__ */ new Set([...values, void 0]) : void 0;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === void 0) {
      if (def.innerType._zod.optin !== "defaulted")
        return payload;
      const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
      if (result instanceof Promise)
        return result.then((result2) => handleOptionalResult(payload, result2));
      return handleOptionalResult(payload, result);
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
  inst._zod.parse = (payload, ctx) => {
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : void 0;
  });
  defineLazyInternal(inst, "values", (zod) => {
    return zod.def.innerType._zod.values ? /* @__PURE__ */ new Set([...zod.def.innerType._zod.values, null]) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "defaulted";
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleDefaultResult(result2, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === void 0) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "defaulted";
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === void 0) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "values", (zod) => {
    const v = zod.def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== void 0)) : void 0;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleNonOptionalResult(result2, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === void 0) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
function handleCatchResult(payload, result, def, ctx) {
  if (!result.issues.length) {
    payload.value = result.value;
    if (result.memo)
      payload.memo = true;
    return payload;
  }
  payload.value = def.catchValue({
    ...result,
    value: payload.value,
    error: {
      issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
    },
    input: payload.value
  });
  return payload;
}
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
    if (result instanceof Promise) {
      return result.then((result2) => handleCatchResult(payload, result2, def, ctx));
    }
    return handleCatchResult(payload, result, def, ctx);
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
  defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
  defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right2) => handlePipeResult(right2, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left2) => handlePipeResult(left2, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues }, ctx);
}
var $ZodPreprocess = /* @__PURE__ */ $constructor("$ZodPreprocess", (inst, def) => {
  $ZodPipe.init(inst, def);
});
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  if (!payload.memo)
    payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r2) => handleRefineResult(r2, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      // incorporates params.error into issue reporting
      path: [...inst._zod.def.path ?? []],
      // incorporates params.error into issue reporting
      continue: !inst._zod.def.abort
      // params: inst._zod.def.params,
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}

// node_modules/zod/v4/core/memoizer.js
var $ZodCyclicError = class extends Error {
  constructor() {
    super(`Cannot parse a reference cycle that closes through a transform`);
    this.name = "ZodCyclicError";
  }
};
var STATE = "~memo";
var NO_ISSUES = [];
function isRef(value) {
  return value !== null && typeof value === "object";
}
function cloneIssues(issues) {
  return issues.map((iss) => iss.path ? { ...iss, path: iss.path.slice() } : { ...iss });
}
var recursive = /* @__PURE__ */ new WeakMap();
var NONE = 0;
var ASSUMED = 1;
var PROVEN = 2;
function isRecursive(inst, stack, resolve) {
  const cached2 = recursive.get(inst);
  if (cached2 !== void 0)
    return cached2 ? PROVEN : NONE;
  if (stack.has(inst))
    return PROVEN;
  stack.add(inst);
  let result = NONE;
  const check = (child) => {
    if (result !== PROVEN && child?._zod) {
      const answer = isRecursive(child, stack, resolve);
      if (answer > result)
        result = answer;
    }
  };
  const shape = (sh, spread) => {
    let answer = NONE;
    for (const key2 of Reflect.ownKeys(sh)) {
      const desc = Object.getOwnPropertyDescriptor(sh, key2);
      if (spread && !desc.enumerable)
        continue;
      const child = desc.get ? ASSUMED : desc.value?._zod ? isRecursive(desc.value, stack, resolve) : NONE;
      if (child > answer)
        answer = child;
    }
    return answer;
  };
  const merge2 = (answer) => {
    if (answer > result)
      result = answer;
  };
  const def = inst._zod.def;
  const kind = def.type;
  switch (kind) {
    case "object": {
      const raw = rawShape(def);
      merge2(raw ? shape(raw, true) : ASSUMED);
      check(def.catchall);
      break;
    }
    case "array":
      check(def.element);
      break;
    case "tuple":
      for (const el of def.items)
        check(el);
      check(def.rest);
      break;
    case "record":
    case "map":
      check(def.keyType);
      check(def.valueType);
      break;
    case "set":
      check(def.valueType);
      break;
    case "union":
      for (const el of def.options)
        check(el);
      break;
    case "intersection":
      check(def.left);
      check(def.right);
      break;
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
    case "nonoptional":
    case "promise":
    case "success":
      check(def.innerType);
      break;
    case "pipe":
      check(def.in);
      check(def.out);
      break;
    case "function":
      check(def.input);
      check(def.output);
      break;
    // `$ZodLazy` caches its inner on the def, so a resolved edge is followed exactly
    case "lazy": {
      const inner = def._cachedInner ?? (resolve ? inst._zod.innerType : void 0);
      merge2(inner ? isRecursive(inner, stack, false) : ASSUMED);
      break;
    }
    // a leaf by choice: `parts` are regex fragments, not data positions
    case "template_literal":
    // leaves
    case "string":
    case "number":
    case "int":
    case "boolean":
    case "bigint":
    case "symbol":
    case "undefined":
    case "null":
    case "void":
    case "never":
    case "any":
    case "unknown":
    case "date":
    case "nan":
    case "enum":
    case "literal":
    case "file":
    case "transform":
    case "custom":
      break;
    default: {
      kind;
      for (const key2 in def) {
        const desc = Object.getOwnPropertyDescriptor(def, key2);
        if (!desc || desc.get)
          continue;
        const value = desc.value;
        if (!value || typeof value !== "object")
          continue;
        if (value._zod)
          check(value);
        else if (Array.isArray(value))
          for (const el of value)
            check(el);
      }
    }
  }
  stack.delete(inst);
  return settle(inst, result);
}
function settle(inst, answer) {
  if (answer !== ASSUMED)
    recursive.set(inst, answer === PROVEN);
  return answer;
}
function bucketFor(state, inst) {
  let bucket = state.buckets.get(inst);
  if (!bucket) {
    bucket = /* @__PURE__ */ new WeakMap();
    state.buckets.set(inst, bucket);
  }
  return bucket;
}
var handoff;
var open = [];
var memo = {
  alloc(_inst, payload, empty) {
    const bucket = handoff;
    if (!bucket)
      return empty;
    handoff = void 0;
    const entry = { value: empty, issues: null };
    bucket.set(payload.value, entry);
    open.push(entry);
    return empty;
  },
  guard(inst) {
    var _a3;
    (_a3 = inst._zod).deferred ?? (_a3.deferred = []);
    inst._zod.deferred.push(() => {
      const base = inst._zod.parse;
      const wrapped = (payload, ctx) => {
        if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value))
          throw new $ZodCyclicError();
        return base(payload, ctx);
      };
      inst._zod.parse = wrapped;
      if (inst._zod.run === base)
        inst._zod.run = wrapped;
    });
  },
  attach(inst) {
    var _a3;
    let isRecursiveInst;
    let rechecked = false;
    let lastCtx;
    let lastBucket;
    (_a3 = inst._zod).deferred ?? (_a3.deferred = []);
    inst._zod.deferred.push(() => {
      const base = inst._zod.parse;
      const wrapped = (payload, ctx) => {
        if (isRecursiveInst === void 0) {
          const walked = isRecursive(inst, /* @__PURE__ */ new Set(), false);
          if (walked === NONE) {
            inst._zod.parse = base;
            if (inst._zod.run === wrapped)
              inst._zod.run = base;
            return base(payload, ctx);
          }
          if (walked === PROVEN || rechecked)
            isRecursiveInst = true;
          else
            rechecked = true;
        }
        const input = payload.value;
        if (!isRef(input))
          return base(payload, ctx);
        let state = ctx[STATE];
        if (!state) {
          state = { buckets: /* @__PURE__ */ new WeakMap(), backEdges: void 0 };
          ctx[STATE] = state;
        }
        let bucket;
        if (lastCtx === ctx) {
          bucket = lastBucket;
        } else {
          bucket = bucketFor(state, inst);
          lastCtx = ctx;
          lastBucket = bucket;
        }
        const hit = bucket.get(input);
        if (hit) {
          payload.value = hit.value;
          if (hit.issues) {
            if (hit.issues.length)
              payload.issues.push(...cloneIssues(hit.issues));
          } else {
            payload.memo = true;
            state.backEdges ?? (state.backEdges = /* @__PURE__ */ new WeakSet());
            state.backEdges.add(hit.value);
          }
          return payload;
        }
        handoff = bucket;
        const depth = open.length;
        const result = base(payload, ctx);
        handoff = void 0;
        const entry = open.length > depth ? open.pop() : void 0;
        if (result instanceof Promise) {
          return result.then((r) => {
            if (entry)
              entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
            return r;
          });
        }
        if (entry)
          entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
        return result;
      };
      inst._zod.parse = wrapped;
      if (inst._zod.run === base)
        inst._zod.run = wrapped;
    });
  }
};
function memoizer() {
  return memo;
}
function isBackEdge(ctx, value) {
  const backEdges = ctx[STATE]?.backEdges;
  return backEdges !== void 0 && isRef(value) && backEdges.has(value);
}

// node_modules/zod/v4/locales/en.js
var error = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" },
    map: { unit: "entries", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    mac: "MAC address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    currency_code: "currency code",
    credit_card: "credit card number",
    iban: "IBAN",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    // Compatibility: "nan" -> "NaN" for display
    nan: "NaN"
    // All other type names omitted - they fall back to raw values via ?? operator
  };
  function getTypeName(type, input) {
    if (type === "number" && typeof input === "number" && !Number.isFinite(input)) {
      return String(input);
    }
    return TypeDictionary[type] ?? type;
  }
  return (issue2) => {
    switch (issue2.code) {
      case "invalid_type": {
        const expected = getTypeName(issue2.expected);
        const receivedType = parsedType(issue2.input);
        const received = getTypeName(receivedType, issue2.input);
        return `Invalid input: expected ${expected}, received ${received}`;
      }
      case "invalid_value":
        if (issue2.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue2.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue2.values, "|")}`;
      case "too_big": {
        const adj = issue2.exact ? "exactly " : issue2.inclusive ? "<=" : "<";
        const sizing = getSizing(issue2.origin);
        if (sizing)
          return `Too big: expected ${issue2.origin ?? "value"} to have ${adj}${issue2.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue2.origin ?? "value"} to be ${adj}${issue2.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue2.exact ? "exactly " : issue2.inclusive ? ">=" : ">";
        const sizing = getSizing(issue2.origin);
        if (sizing) {
          return `Too small: expected ${issue2.origin} to have ${adj}${issue2.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue2.origin} to be ${adj}${issue2.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue2;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${FormatDictionary[_issue.format] ?? issue2.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue2.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue2.keys.length > 1 ? "s" : ""}: ${joinValues(issue2.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue2.origin}`;
      case "invalid_union":
        if (issue2.options && Array.isArray(issue2.options) && issue2.options.length > 0) {
          const opts = issue2.options.map((o) => `'${o}'`).join(" | ");
          return `Invalid discriminator value. Expected ${opts}`;
        }
        if (issue2.inclusive === false) {
          return "Invalid input: more than one option matched";
        }
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue2.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
function en_default() {
  return {
    localeError: error()
  };
}

// node_modules/zod/v4/core/registries.js
var _a2;
var $ZodRegistry = class {
  constructor() {
    this._map = /* @__PURE__ */ new WeakMap();
    this._idmap = /* @__PURE__ */ new Map();
  }
  add(schema, ..._meta) {
    const meta2 = _meta[0];
    this._map.set(schema, meta2);
    if (meta2 && typeof meta2 === "object" && "id" in meta2) {
      this._idmap.set(meta2.id, schema);
    }
    return this;
  }
  clear() {
    this._map = /* @__PURE__ */ new WeakMap();
    this._idmap = /* @__PURE__ */ new Map();
    return this;
  }
  remove(schema) {
    const meta2 = this._map.get(schema);
    if (meta2 && typeof meta2 === "object" && "id" in meta2) {
      this._idmap.delete(meta2.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : void 0;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
};
function registry() {
  return new $ZodRegistry();
}
(_a2 = globalThis).__zod_globalRegistry ?? (_a2.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;

// node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
  if (def.checks)
    def.checks = [...def.checks];
  return def;
}
// @__NO_SIDE_EFFECTS__
function _string(Class2, params) {
  return new Class2(snapshotChecks({ type: "string", ...normalizeParams(params) }));
}
// @__NO_SIDE_EFFECTS__
function _email(Class2, params) {
  return new Class2({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _guid(Class2, params) {
  return new Class2({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uuidv7(Class2, params) {
  return new Class2({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _url(Class2, params) {
  return new Class2({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _emoji2(Class2, params) {
  return new Class2({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _nanoid(Class2, params) {
  return new Class2({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cuid2(Class2, params) {
  return new Class2({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ulid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _xid(Class2, params) {
  return new Class2({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ksuid(Class2, params) {
  return new Class2({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _ipv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv4(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _cidrv6(Class2, params) {
  return new Class2({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _base64(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _base64url(Class2, params) {
  return new Class2({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _e164(Class2, params) {
  return new Class2({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _jwt(Class2, params) {
  return new Class2({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDateTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDate(Class2, params) {
  return new Class2({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoTime(Class2, params) {
  return new Class2({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _isoDuration(Class2, params) {
  return new Class2({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _number(Class2, params) {
  return new Class2(snapshotChecks({ type: "number", checks: [], ...normalizeParams(params) }));
}
// @__NO_SIDE_EFFECTS__
function _int(Class2, params) {
  return new Class2({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _boolean(Class2, params) {
  return new Class2({
    type: "boolean",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _unknown(Class2) {
  return new Class2({
    type: "unknown"
  });
}
// @__NO_SIDE_EFFECTS__
function _never(Class2, params) {
  return new Class2({
    type: "never",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
// @__NO_SIDE_EFFECTS__
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
// @__NO_SIDE_EFFECTS__
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
// @__NO_SIDE_EFFECTS__
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
// @__NO_SIDE_EFFECTS__
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
// @__NO_SIDE_EFFECTS__
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
// @__NO_SIDE_EFFECTS__
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
// @__NO_SIDE_EFFECTS__
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
// @__NO_SIDE_EFFECTS__
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
// @__NO_SIDE_EFFECTS__
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
// @__NO_SIDE_EFFECTS__
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
// @__NO_SIDE_EFFECTS__
function _normalize(form) {
  return /* @__PURE__ */ _overwrite((input) => input.normalize(form));
}
// @__NO_SIDE_EFFECTS__
function _trim() {
  return /* @__PURE__ */ _overwrite((input) => input.trim());
}
// @__NO_SIDE_EFFECTS__
function _toLowerCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toLowerCase());
}
// @__NO_SIDE_EFFECTS__
function _toUpperCase() {
  return /* @__PURE__ */ _overwrite((input) => input.toUpperCase());
}
// @__NO_SIDE_EFFECTS__
function _slugify() {
  return /* @__PURE__ */ _overwrite((input) => slugify(input));
}
// @__NO_SIDE_EFFECTS__
function _array(Class2, element, params) {
  return new Class2({
    type: "array",
    element,
    // get element() {
    //   return element;
    // },
    ...normalizeParams(params)
  });
}
// @__NO_SIDE_EFFECTS__
function _refine(Class2, fn, _params) {
  const schema = new Class2({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
// @__NO_SIDE_EFFECTS__
function _superRefine(fn, params) {
  const ch = /* @__PURE__ */ _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        if (!("input" in _issue))
          _issue.input = payload.value;
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
// @__NO_SIDE_EFFECTS__
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}

// node_modules/zod/v4/core/to-json-schema.js
function assignProps(target, ...sources) {
  for (const source of sources) {
    for (const key2 of Reflect.ownKeys(source)) {
      if (Object.prototype.propertyIsEnumerable.call(source, key2)) {
        assignProp(target, key2, source[key2]);
      }
    }
  }
  return target;
}
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {
    }),
    io: params?.io ?? "output",
    counter: 0,
    seen: /* @__PURE__ */ new Map(),
    sharedDefsExtractedFor: void 0,
    sharedEmitDoneFor: void 0,
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    intersections: [],
    deferred: [],
    external: params?.external ?? void 0
  };
}
function handleUnrepresentable(schema, ctx, json, params, message) {
  const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({ zodSchema: schema, path: params.path, message }) : ctx.unrepresentable;
  if (result === "any")
    return false;
  if (result === void 0 || result === "throw")
    throw new Error(message);
  Object.assign(json, result);
  return true;
}
function processSchema(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a3;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: void 0, path: _params.path };
  ctx.seen.set(schema, result);
  ctx.sharedDefsExtractedFor = void 0;
  ctx.sharedEmitDoneFor = void 0;
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      processSchema(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta2 = ctx.metadataRegistry.get(schema);
  if (meta2)
    assignProps(result.schema, meta2);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a3 = result.schema).default ?? (_a3.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function encodeJSONPointerSegment(segment) {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external)
    return;
  const idToSchema = /* @__PURE__ */ new Map();
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id2) => id2);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}` };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    if (entry[1] === root && !entry[1].schema.id) {
      return { ref: uriPrefix };
    }
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + encodeJSONPointerSegment(defId) };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema2 = seen.schema;
    for (const key2 in schema2) {
      delete schema2[key2];
    }
    schema2.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error(`Cycle detected: #/${seen.cycle?.join("/")}/<root>

Set the \`cycles\` parameter to \`"ref"\` to resolve cyclical schemas with defs.`);
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
      }
    }
  }
  if (ctx.external)
    ctx.sharedDefsExtractedFor = ctx.external;
}
function compactTypeUnion(schema) {
  const options = schema.anyOf;
  if (!Array.isArray(options) || options.length === 0 || schema.type !== void 0)
    return;
  const types = [];
  for (const option of options) {
    if (!option || typeof option !== "object")
      return;
    compactTypeUnion(option);
    const keys = Object.keys(option);
    if (keys.length !== 1 || keys[0] !== "type")
      return;
    const type = option.type;
    for (const member of Array.isArray(type) ? type : [type]) {
      if (typeof member !== "string")
        return;
      if (!types.includes(member))
        types.push(member);
    }
  }
  delete schema.anyOf;
  schema.type = types.length === 1 ? types[0] : types;
}
var FOLDABLE_KEYS = /* @__PURE__ */ new Set(["type", "properties", "required", "additionalProperties"]);
var UNION_KEYS = ["oneOf", "anyOf"];
function undeclaredConstraint(member) {
  const extra = member.additionalProperties;
  if (extra === void 0 || extra === false || typeof extra !== "object" || extra === null)
    return null;
  return Object.keys(extra).length ? extra : null;
}
function foldObjects(members2) {
  const objects = [];
  for (const member of members2) {
    if (typeof member !== "object" || member.type !== "object")
      return null;
    for (const key2 in member) {
      if (!FOLDABLE_KEYS.has(key2))
        return null;
    }
    objects.push(member);
  }
  const properties = {};
  const required2 = /* @__PURE__ */ new Set();
  for (const object2 of objects) {
    for (const key2 in object2.properties) {
      if (Object.prototype.hasOwnProperty.call(properties, key2))
        continue;
      const parts = [];
      for (const other of objects) {
        const part = other.properties?.[key2] ?? undeclaredConstraint(other);
        if (part === null || part === void 0)
          continue;
        if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part)))
          parts.push(part);
      }
      const merged = parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts };
      assignProp(properties, key2, merged);
    }
    for (const key2 of object2.required ?? [])
      required2.add(key2);
  }
  const folded = { type: "object", properties };
  if (required2.size)
    folded.required = [...required2];
  if (objects.every((object2) => object2.additionalProperties === false)) {
    folded.additionalProperties = false;
  } else {
    const constraints = [];
    for (const object2 of objects) {
      const constraint = undeclaredConstraint(object2);
      if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint)))
        constraints.push(constraint);
    }
    if (constraints.length === 1)
      folded.additionalProperties = constraints[0];
    else if (constraints.length > 1)
      folded.additionalProperties = { allOf: constraints };
  }
  return folded;
}
function foldIntersection(json) {
  const allOf = json.allOf;
  if (!Array.isArray(allOf) || allOf.length < 2)
    return;
  for (const key2 of FOLDABLE_KEYS)
    if (key2 in json)
      return;
  const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
  let folded = null;
  if (!unions.length) {
    folded = foldObjects(allOf);
  } else {
    const union2 = unions[0];
    const keyword = UNION_KEYS.find((k) => Array.isArray(union2[k]));
    if (Object.keys(union2).length !== 1)
      return;
    const rest = allOf.filter((m) => m !== union2);
    const branches = union2[keyword].map((branch) => foldObjects([...rest, branch]));
    if (branches.some((b) => !b))
      return;
    folded = { [keyword]: branches };
  }
  if (!folded)
    return;
  delete json.allOf;
  assignProps(json, folded);
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema2 = seen.def ?? seen.schema;
    const _cached = { ...schema2 };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema2.allOf = schema2.allOf ?? [];
        schema2.allOf.push(refSchema);
      } else {
        assignProps(schema2, refSchema);
      }
      assignProps(schema2, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key2 in schema2) {
          if (key2 === "$ref" || key2 === "allOf")
            continue;
          if (!(key2 in _cached)) {
            delete schema2[key2];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key2 in schema2) {
          if (key2 === "$ref" || key2 === "allOf")
            continue;
          if (key2 in refSeen.def && JSON.stringify(schema2[key2]) === JSON.stringify(refSeen.def[key2])) {
            delete schema2[key2];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema2.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key2 in schema2) {
            if (key2 === "$ref" || key2 === "allOf")
              continue;
            if (key2 in parentSeen.def && JSON.stringify(schema2[key2]) === JSON.stringify(parentSeen.def[key2])) {
              delete schema2[key2];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema2,
      path: seen.path ?? []
    });
  };
  if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
    for (const entry of [...ctx.seen.entries()].reverse()) {
      flattenRef(entry[0]);
    }
    if (ctx.target !== "openapi-3.0") {
      for (const entry of ctx.seen.entries()) {
        compactTypeUnion(entry[1].def ?? entry[1].schema);
      }
    }
    for (const rewrite of ctx.deferred)
      rewrite();
    if (ctx.intersections.length) {
      const carriers = /* @__PURE__ */ new Map();
      for (const seen of ctx.seen.values()) {
        for (const json of [seen.schema, seen.def]) {
          const allOf = json?.allOf;
          if (!Array.isArray(allOf))
            continue;
          const existing = carriers.get(allOf);
          if (existing)
            existing.push(json);
          else
            carriers.set(allOf, [json]);
        }
      }
      for (const allOf of ctx.intersections) {
        for (const json of carriers.get(allOf) ?? [])
          foldIntersection(json);
      }
    }
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {
  } else {
  }
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== void 0 && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.def && seen.defId) {
        if (seen.def.id === seen.defId)
          delete seen.def.id;
        assignProp(defs, seen.defId, seen.def);
      }
    }
  }
  if (ctx.external)
    ctx.sharedEmitDoneFor = ctx.external;
  if (ctx.external) {
  } else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: /* @__PURE__ */ new Set() };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key2 in def.shape) {
      if (isTransforming(def.shape[key2], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  processSchema(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  processSchema(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};

// node_modules/zod/v4/core/json-schema-processors.js
var narrowMin = (agg, key2, value) => {
  if (agg[key2] === void 0 || value > agg[key2])
    agg[key2] = value;
};
var narrowMax = (agg, key2, value) => {
  if (agg[key2] === void 0 || value < agg[key2])
    agg[key2] = value;
};
var narrowBoth = (agg, value) => {
  narrowMin(agg, "minimum", value);
  narrowMax(agg, "maximum", value);
};
var addDivisor = (agg, value) => {
  agg.multipleOf ?? (agg.multipleOf = []);
  if (!agg.multipleOf.includes(value))
    agg.multipleOf.push(value);
};
var addPattern = (agg, pattern) => {
  agg.patterns ?? (agg.patterns = /* @__PURE__ */ new Set());
  agg.patterns.add(pattern);
};
var intersectMime = (agg, mime) => {
  agg.mime = agg.mime ? agg.mime.filter((m) => mime.includes(m)) : [...mime];
};
var setFormat = (agg, format) => {
  agg.format = format;
  if (format.includes("int"))
    agg.isInt = true;
};
var minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum);
var maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum);
var formatContributor = (ranges) => (agg, def) => {
  setFormat(agg, def.format);
  const [minimum, maximum] = ranges[def.format];
  narrowMin(agg, "minimum", minimum);
  narrowMax(agg, "maximum", maximum);
};
var contributors = {
  greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
  less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
  multiple_of: (agg, def) => addDivisor(agg, def.value),
  number_format: formatContributor(NUMBER_FORMAT_RANGES),
  bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
  min_length: minContributor,
  max_length: maxContributor,
  length_equals: (agg, def) => narrowBoth(agg, def.length),
  min_size: minContributor,
  max_size: maxContributor,
  size_equals: (agg, def) => narrowBoth(agg, def.size),
  string_format: (agg, def) => {
    setFormat(agg, def.format);
    if (def.pattern)
      addPattern(agg, def.pattern);
    if (def.format === "base64" || def.format === "base64url")
      agg.contentEncoding = def.format;
    if (def.local || def.precision === -1)
      agg.laxFormat = true;
  },
  mime_type: (agg, def) => intersectMime(agg, def.mime)
};
function aggregateChecks(schema) {
  const agg = {};
  const def = schema._zod.def;
  const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...def.checks ?? []] : def.checks ?? [];
  for (const ch of list)
    contributors[ch._zod.def.check]?.(agg, ch._zod.def);
  const bag = schema._zod.bag;
  if (bag.minimum !== void 0)
    narrowMin(agg, "minimum", bag.minimum);
  if (bag.exclusiveMinimum !== void 0)
    narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
  if (bag.maximum !== void 0)
    narrowMax(agg, "maximum", bag.maximum);
  if (bag.exclusiveMaximum !== void 0)
    narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
  if (bag.multipleOf !== void 0)
    addDivisor(agg, bag.multipleOf);
  if (bag.format !== void 0) {
    agg.format ?? (agg.format = bag.format);
    if (bag.format.includes("int"))
      agg.isInt = true;
  }
  if (bag.mime)
    intersectMime(agg, bag.mime);
  for (const pattern of bag.patterns ?? [])
    addPattern(agg, pattern);
  return agg;
}
var formatMap = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: ""
  // do not set
};
var exactPatterns = /* @__PURE__ */ new Map([
  [base64Charset, base64],
  [base64urlCharset, base64url]
]);
var exactPattern = (p) => exactPatterns.get(p) ?? p;
var stringProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  json.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
  if (typeof minimum === "number")
    json.minLength = minimum;
  if (typeof maximum === "number")
    json.maxLength = maximum;
  if (format) {
    json.format = formatMap[format] ?? format;
    if (json.format === "")
      delete json.format;
    if (format === "time" || laxFormat) {
      delete json.format;
    }
  }
  if (contentEncoding)
    json.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const patternList = [...patterns].map(exactPattern);
    if (patternList.length === 1)
      json.pattern = patternList[0].source;
    else if (patternList.length > 1) {
      json.allOf = [
        ...patternList.map((regex) => ({
          ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
          pattern: regex.source
        }))
      ];
    }
  }
};
var numberProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
  json.type = isInt ? "integer" : "number";
  const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json.minimum = exclusiveMinimum;
      json.exclusiveMinimum = true;
    } else {
      json.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json.maximum = exclusiveMaximum;
      json.exclusiveMaximum = true;
    } else {
      json.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json.maximum = maximum;
  }
  if (multipleOf) {
    const divisors = /* @__PURE__ */ new Set();
    for (const divisor of multipleOf) {
      if (Number.isFinite(divisor) && divisor !== 0)
        divisors.add(Math.abs(divisor));
      else
        handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
    }
    const [first, ...rest] = divisors;
    if (first !== void 0)
      json.multipleOf = first;
    if (rest.length)
      json.allOf = [...json.allOf ?? [], ...rest.map((m) => ({ multipleOf: m }))];
  }
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var bigintProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "BigInt cannot be represented in JSON Schema");
};
var symbolProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Symbols cannot be represented in JSON Schema");
};
var nullProcessor = (_schema, ctx, json, _params) => {
  if (ctx.target === "openapi-3.0") {
    json.type = "string";
    json.nullable = true;
    json.enum = [null];
  } else {
    json.type = "null";
  }
};
var undefinedProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Undefined cannot be represented in JSON Schema");
};
var voidProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Void cannot be represented in JSON Schema");
};
var neverProcessor = (_schema, _ctx, json, _params) => {
  json.not = {};
};
var anyProcessor = (_schema, _ctx, _json, _params) => {
};
var unknownProcessor = (_schema, _ctx, _json, _params) => {
};
var dateProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Date cannot be represented in JSON Schema");
};
var enumProcessor = (schema, _ctx, json, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.length === 0) {
    json.not = {};
    return;
  }
  if (values.every((v) => typeof v === "number"))
    json.type = "number";
  if (values.every((v) => typeof v === "string"))
    json.type = "string";
  json.enum = values;
};
var literalProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  if (def.values.length === 0) {
    json.not = {};
    return;
  }
  const vals = [];
  for (const val of def.values) {
    if (val === void 0) {
      if (handleUnrepresentable(schema, ctx, json, params, "Literal `undefined` cannot be represented in JSON Schema"))
        return;
    } else if (typeof val === "bigint") {
      if (handleUnrepresentable(schema, ctx, json, params, "BigInt literals cannot be represented in JSON Schema"))
        return;
      vals.push(Number(val));
    } else {
      vals.push(val);
    }
  }
  if (vals.length === 0) {
  } else if (vals.length === 1) {
    const val = vals[0];
    json.type = val === null ? "null" : typeof val;
    if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
      json.enum = [val];
    } else {
      json.const = val;
    }
  } else {
    if (vals.every((v) => typeof v === "number"))
      json.type = "number";
    if (vals.every((v) => typeof v === "string"))
      json.type = "string";
    if (vals.every((v) => typeof v === "boolean"))
      json.type = "boolean";
    if (vals.every((v) => v === null))
      json.type = "null";
    json.enum = vals;
  }
};
var nanProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "NaN cannot be represented in JSON Schema");
};
var templateLiteralProcessor = (schema, _ctx, json, _params) => {
  const _json = json;
  const pattern = schema._zod.pattern;
  if (!pattern)
    throw new Error("Pattern not found in template literal");
  _json.type = "string";
  _json.pattern = pattern.source;
};
var fileProcessor = (schema, _ctx, json, _params) => {
  const _json = json;
  _json.type = "string";
  _json.format = "binary";
  _json.contentEncoding = "binary";
  const { minimum, maximum, mime } = aggregateChecks(schema);
  if (minimum !== void 0)
    _json.minLength = minimum;
  if (maximum !== void 0)
    _json.maxLength = maximum;
  if (!mime)
    return;
  if (mime.length === 0)
    _json.not = {};
  else if (mime.length === 1)
    _json.contentMediaType = mime[0];
  else
    _json.anyOf = mime.map((m) => ({ contentMediaType: m }));
};
var successProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var customProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
};
var functionProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Function types cannot be represented in JSON Schema");
};
var transformProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
};
var mapProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Map cannot be represented in JSON Schema");
};
var setProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Set cannot be represented in JSON Schema");
};
var arrayProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = aggregateChecks(schema);
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
  json.type = "array";
  json.items = processSchema(def.element, ctx, {
    ...params,
    path: [...params.path, "items"]
  });
};
function inputOptin(schema) {
  const def = schema._zod.def;
  if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) {
    return inputOptin(def.out);
  }
  if (def.type === "catch") {
    return inputOptin(def.innerType);
  }
  return schema._zod.optin;
}
var objectProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const shape = def.shape;
  const symbolKeys = Object.getOwnPropertySymbols(shape);
  if (symbolKeys.length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) {
    return;
  }
  json.type = "object";
  json.properties = {};
  for (const key2 in shape) {
    assignProp(json.properties, key2, processSchema(shape[key2], ctx, {
      ...params,
      path: [...params.path, "properties", key2]
    }));
  }
  const requiredKeys = [];
  for (const key2 of Object.keys(shape)) {
    const field = def.shape[key2];
    if (ctx.io === "input" ? inputOptin(field) === void 0 : field._zod.optout === void 0) {
      requiredKeys.push(key2);
    }
  }
  if (requiredKeys.length > 0) {
    json.required = requiredKeys;
  }
  if (def.catchall?._zod.def.type === "never") {
    json.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output")
      json.additionalProperties = false;
  } else if (def.catchall) {
    json.additionalProperties = processSchema(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
};
var unionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x, i) => processSchema(x, ctx, {
    ...params,
    path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
  }));
  if (isExclusive) {
    json.oneOf = options;
  } else {
    json.anyOf = options;
  }
};
var intersectionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const a = processSchema(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0]
  });
  const b = processSchema(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1]
  });
  const isSimpleIntersection = (val) => "allOf" in val && Object.keys(val).length === 1;
  const allOf = [
    ...isSimpleIntersection(a) ? a.allOf : [a],
    ...isSimpleIntersection(b) ? b.allOf : [b]
  ];
  json.allOf = allOf;
  ctx.intersections.push(allOf);
};
var tupleProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "array";
  const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
  const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
  const prefixItems = def.items.map((x, i) => processSchema(x, ctx, {
    ...params,
    path: [...params.path, prefixPath, i]
  }));
  const rest = def.rest ? processSchema(def.rest, ctx, {
    ...params,
    path: [...params.path, restPath, ...ctx.target === "openapi-3.0" ? [def.items.length] : []]
  }) : null;
  let minItems = def.items.length;
  while (minItems > 0) {
    const item = def.items[minItems - 1];
    const optional2 = ctx.io === "input" ? inputOptin(item) !== void 0 : item._zod.optout === "optional";
    if (!optional2)
      break;
    minItems--;
  }
  const maxItems = def.items.length;
  const isClosed = !def.rest;
  if (ctx.target === "draft-2020-12") {
    json.prefixItems = prefixItems;
    if (isClosed) {
      json.items = false;
    } else if (rest) {
      json.items = rest;
    }
    if (minItems > 0)
      json.minItems = minItems;
    if (isClosed)
      json.maxItems = maxItems;
  } else if (ctx.target === "openapi-3.0") {
    json.items = {
      anyOf: prefixItems
    };
    if (rest) {
      json.items.anyOf.push(rest);
    }
    if (minItems > 0)
      json.minItems = minItems;
    if (isClosed)
      json.maxItems = maxItems;
  } else {
    json.items = prefixItems;
    if (isClosed) {
      json.additionalItems = false;
    } else if (rest) {
      json.additionalItems = rest;
    }
    if (minItems > 0)
      json.minItems = minItems;
    if (isClosed)
      json.maxItems = maxItems;
  }
  const { minimum, maximum } = aggregateChecks(schema);
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
};
function stringifyKeyNames(bySchema, json, visited) {
  if (json.$ref) {
    if (visited.has(json))
      return json;
    visited.add(json);
    const def = bySchema.get(json)?.def;
    if (!def)
      return json;
    const inlined = stringifyKeyNames(bySchema, def, visited);
    return inlined === def ? json : inlined;
  }
  for (const keyword of ["anyOf", "oneOf"]) {
    const branches = json[keyword];
    if (!Array.isArray(branches))
      continue;
    const mapped = branches.map((branch) => stringifyKeyNames(bySchema, branch, visited));
    if (mapped.some((branch, i) => branch !== branches[i]))
      json = { ...json, [keyword]: mapped };
  }
  const types = Array.isArray(json.type) ? json.type : [json.type];
  const numericType = !types.includes("string") && types.some((t) => t === "number" || t === "integer");
  const values = json.enum ?? (json.const !== void 0 ? [json.const] : void 0);
  if (!numericType && !values?.some((v) => typeof v === "number"))
    return json;
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, format, id, ...rest } = json;
  if (rest.enum)
    rest.enum = rest.enum.map((v) => typeof v === "number" ? String(v) : v);
  else if (typeof rest.const === "number")
    rest.const = String(rest.const);
  if (!numericType)
    return rest;
  rest.type = "string";
  if (!values)
    rest.pattern = (types.includes("number") ? number : integer).source;
  return rest;
}
var pendingRecords = /* @__PURE__ */ new WeakMap();
function rewriteKeyNames(ctx) {
  const bySchema = /* @__PURE__ */ new Map();
  for (const entry of ctx.seen.values()) {
    if (entry.def && !bySchema.has(entry.schema))
      bySchema.set(entry.schema, entry);
  }
  const rewrites = /* @__PURE__ */ new Map();
  for (const record of pendingRecords.get(ctx) ?? []) {
    const seen = ctx.seen.get(record);
    const names = (seen?.def ?? seen?.schema)?.propertyNames;
    if (!names || names === true || rewrites.has(names))
      continue;
    const rewritten = stringifyKeyNames(bySchema, names, /* @__PURE__ */ new Set());
    if (rewritten !== names)
      rewrites.set(names, rewritten);
  }
  if (!rewrites.size)
    return;
  for (const entry of ctx.seen.values()) {
    for (const carrier of [entry.schema, entry.def]) {
      const rewritten = carrier && rewrites.get(carrier.propertyNames);
      if (rewritten)
        carrier.propertyNames = rewritten;
    }
  }
}
var recordProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  const keyType = def.keyType;
  const patterns = aggregateChecks(keyType).patterns;
  if (def.mode === "loose" && patterns && patterns.size > 0) {
    const valueSchema = processSchema(def.valueType, ctx, {
      ...params,
      path: [...params.path, "patternProperties", "*"]
    });
    json.patternProperties = {};
    for (const pattern of patterns) {
      assignProp(json.patternProperties, exactPattern(pattern).source, valueSchema);
    }
  } else {
    if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
      json.propertyNames = processSchema(def.keyType, ctx, {
        ...params,
        path: [...params.path, "propertyNames"]
      });
      let pending = pendingRecords.get(ctx);
      if (!pending) {
        pending = [];
        pendingRecords.set(ctx, pending);
        ctx.deferred.push(() => rewriteKeyNames(ctx));
      }
      pending.push(schema);
    }
    json.additionalProperties = processSchema(def.valueType, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
  const keyValues = keyType._zod.values;
  const omittableOnInput = ctx.io === "input" && inputOptin(def.valueType) !== void 0;
  if (keyValues && !def.partial && !omittableOnInput) {
    const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
    if (validKeyValues.length > 0) {
      json.required = validKeyValues.map(String);
    }
  }
};
var nullableProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const inner = processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json.nullable = true;
  } else {
    json.anyOf = [inner, { type: "null" }];
  }
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var UNREPRESENTABLE_DEFAULT = Symbol();
function serializeDefaultValue(value, schema, ctx, json, params) {
  let unrepresentable = false;
  const serialized = JSON.stringify(value, (_, val) => {
    if (typeof val !== "bigint")
      return val;
    unrepresentable = true;
    return null;
  });
  if (!unrepresentable)
    return JSON.parse(serialized);
  handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
  return UNREPRESENTABLE_DEFAULT;
}
var defaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
  if (value !== UNREPRESENTABLE_DEFAULT)
    json.default = value;
};
var prefaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io !== "input")
    return;
  const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
  if (value !== UNREPRESENTABLE_DEFAULT)
    json._prefault = value;
};
var catchProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(void 0);
  } catch {
    handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
    return;
  }
  json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
  processSchema(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.readOnly = true;
};
var promiseProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var lazyProcessor = (schema, ctx, _json, params) => {
  const innerType = schema._zod.innerType;
  processSchema(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var allProcessors = {
  string: stringProcessor,
  number: numberProcessor,
  boolean: booleanProcessor,
  bigint: bigintProcessor,
  symbol: symbolProcessor,
  null: nullProcessor,
  undefined: undefinedProcessor,
  void: voidProcessor,
  never: neverProcessor,
  any: anyProcessor,
  unknown: unknownProcessor,
  date: dateProcessor,
  enum: enumProcessor,
  literal: literalProcessor,
  nan: nanProcessor,
  template_literal: templateLiteralProcessor,
  file: fileProcessor,
  success: successProcessor,
  custom: customProcessor,
  function: functionProcessor,
  transform: transformProcessor,
  map: mapProcessor,
  set: setProcessor,
  array: arrayProcessor,
  object: objectProcessor,
  union: unionProcessor,
  intersection: intersectionProcessor,
  tuple: tupleProcessor,
  record: recordProcessor,
  nullable: nullableProcessor,
  nonoptional: nonoptionalProcessor,
  default: defaultProcessor,
  prefault: prefaultProcessor,
  catch: catchProcessor,
  pipe: pipeProcessor,
  readonly: readonlyProcessor,
  promise: promiseProcessor,
  optional: optionalProcessor,
  lazy: lazyProcessor
};
function toJSONSchema(input, params) {
  if ("_idmap" in input) {
    const registry2 = input;
    const ctx2 = initializeContext({ ...params, processors: allProcessors });
    const defs = {};
    for (const entry of registry2._idmap.entries()) {
      const [_, schema] = entry;
      processSchema(schema, ctx2);
    }
    const schemas = {};
    const external = {
      registry: registry2,
      uri: params?.uri,
      defs
    };
    ctx2.external = external;
    for (const entry of registry2._idmap.entries()) {
      const [key2, schema] = entry;
      extractDefs(ctx2, schema);
      assignProp(schemas, key2, finalize(ctx2, schema));
    }
    if (Object.keys(defs).length > 0) {
      const defsSegment = ctx2.target === "draft-2020-12" ? "$defs" : "definitions";
      schemas.__shared = {
        [defsSegment]: defs
      };
    }
    return { schemas };
  }
  const ctx = initializeContext({ ...params, processors: allProcessors });
  processSchema(input, ctx);
  extractDefs(ctx, input);
  return finalize(ctx, input);
}

// node_modules/zod/v4/classic/errors.js
var _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
function _lazyMethod(proto, key2, make) {
  Object.defineProperty(proto, key2, {
    configurable: true,
    enumerable: false,
    get() {
      const value = make(this);
      Object.defineProperty(this, key2, { value, configurable: true, writable: true });
      return value;
    },
    set(value) {
      Object.defineProperty(this, key2, { value, configurable: true, writable: true });
    }
  });
}
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  const proto = Object.getPrototypeOf(inst);
  if (_installedErrorProtos.has(proto))
    return;
  _installedErrorProtos.add(proto);
  _lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
  _lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
  _lazyMethod(proto, "addIssue", (self) => (issue2) => {
    self.issues.push(issue2);
    self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
  });
  _lazyMethod(proto, "addIssues", (self) => (issues2) => {
    self.issues.push(...issues2);
    self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
  });
  Object.defineProperty(proto, "isEmpty", {
    configurable: true,
    enumerable: false,
    get() {
      return this.issues.length === 0;
    }
  });
};
var ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, void 0, {
  Parent: Error
});

// node_modules/zod/v4/classic/parse.js
var parse = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode = /* @__PURE__ */ _encode(ZodRealError);
var decode = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

// node_modules/zod/v4/classic/schemas.js
function _ensureDefaultLocale() {
  if (!globalConfig.localeError)
    config(en_default());
}
function _ensureDefaultMemoizer() {
  if (!globalConfig.memoizer)
    config({ memoizer: memoizer() });
}
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  _ensureDefaultLocale();
  $ZodType.init(inst, def);
  inst.def = def;
  inst.type = def.type;
  return inst;
}, {
  check(...chks) {
    const def = this.def;
    return this.clone(util_exports.mergeDefs(def, {
      checks: [
        ...def.checks ?? [],
        ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
      ]
    }), { parent: true });
  },
  with(...chks) {
    return this.check(...chks);
  },
  clone(def, params) {
    return clone(this, def, params);
  },
  brand() {
    return this;
  },
  register(reg, meta2) {
    reg.add(this, meta2);
    return this;
  },
  refine(check, params) {
    return this.check(refine(check, params));
  },
  superRefine(refinement, params) {
    return this.check(superRefine(refinement, params));
  },
  overwrite(fn) {
    return this.check(_overwrite(fn));
  },
  optional() {
    return optional(this);
  },
  exactOptional() {
    return exactOptional(this);
  },
  nullable() {
    return nullable(this);
  },
  nullish() {
    return optional(nullable(this));
  },
  nonoptional(params) {
    return nonoptional(this, params);
  },
  array() {
    return array(this);
  },
  or(arg) {
    return union([this, arg]);
  },
  and(arg) {
    return intersection(this, arg);
  },
  transform(tx) {
    return pipe(this, transform(tx));
  },
  default(d) {
    return _default(this, d);
  },
  prefault(d) {
    return prefault(this, d);
  },
  catch(params) {
    return _catch(this, params);
  },
  pipe(target) {
    return pipe(this, target);
  },
  readonly() {
    return readonly(this);
  },
  describe(description) {
    const cl = this.clone();
    globalRegistry.add(cl, { description });
    return cl;
  },
  meta(...args) {
    if (args.length === 0)
      return globalRegistry.get(this);
    const cl = this.clone();
    globalRegistry.add(cl, args[0]);
    return cl;
  },
  isOptional() {
    return this.safeParse(void 0).success;
  },
  isNullable() {
    return this.safeParse(null).success;
  },
  apply(fn, ...args) {
    return args.length === 0 ? fn(this) : fn(this, ...args);
  },
  // Overrides core's `~standard` to add `jsonSchema`. Must stay a prototype entry: redefining it per instance demotes instances to dictionary mode.
  get "~standard"() {
    return util_exports.hide(this, "~standard", {
      ...standardProps(this),
      jsonSchema: {
        input: createStandardJSONSchemaMethod(this, "input"),
        output: createStandardJSONSchemaMethod(this, "output")
      }
    });
  },
  set "~standard"(value) {
    util_exports.own(this, "~standard", value);
  },
  parse: function _parse2(data, params) {
    return parse(this, data, params, { callee: _parse2 });
  },
  parseAsync: async function _parseAsync2(data, params) {
    return await parseAsync(this, data, params, { callee: _parseAsync2 });
  },
  safeParse(data, params) {
    return safeParse(this, data, params);
  },
  async safeParseAsync(data, params) {
    return safeParseAsync(this, data, params);
  },
  // `spa` is an alias: same function object as `safeParseAsync`, as before.
  get spa() {
    return this?.safeParseAsync;
  },
  set spa(value) {
    util_exports.own(this, "spa", value);
  },
  validate(data, params) {
    return validate(this, data, params);
  },
  validateAsync(data, params) {
    return validateAsync(this, data, params);
  },
  encode: function _encode2(data, params) {
    return encode(this, data, params, { callee: _encode2 });
  },
  decode: function _decode2(data, params) {
    return decode(this, data, params, { callee: _decode2 });
  },
  encodeAsync: async function _encodeAsync2(data, params) {
    return await encodeAsync(this, data, params, { callee: _encodeAsync2 });
  },
  decodeAsync: async function _decodeAsync2(data, params) {
    return await decodeAsync(this, data, params, { callee: _decodeAsync2 });
  },
  safeEncode(data, params) {
    return safeEncode(this, data, params);
  },
  safeDecode(data, params) {
    return safeDecode(this, data, params);
  },
  async safeEncodeAsync(data, params) {
    return safeEncodeAsync(this, data, params);
  },
  async safeDecodeAsync(data, params) {
    return safeDecodeAsync(this, data, params);
  },
  toJSONSchema(params) {
    return createToJSONSchemaMethod(this, {})(params);
  },
  // Reads through to the registry on every access, so it must not cache.
  get description() {
    return globalRegistry.get(this)?.description;
  },
  // No setter: `schema._def = x` throws, as it did when `_def` was a non-writable own property.
  get _def() {
    return this._zod.def;
  }
});
var _ZodString = /* @__PURE__ */ $constructor(
  "_ZodString",
  (inst, def) => {
    $ZodString.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
  },
  /* @__PURE__ */ util_exports.derived({
    format: (inst) => aggregateChecks(inst).format ?? null,
    minLength: (inst) => aggregateChecks(inst).minimum ?? null,
    maxLength: (inst) => aggregateChecks(inst).maximum ?? null
  }, {
    regex(...args) {
      return this.check(_regex(...args));
    },
    includes(...args) {
      return this.check(_includes(...args));
    },
    startsWith(...args) {
      return this.check(_startsWith(...args));
    },
    endsWith(...args) {
      return this.check(_endsWith(...args));
    },
    min(...args) {
      return this.check(_minLength(...args));
    },
    max(...args) {
      return this.check(_maxLength(...args));
    },
    length(...args) {
      return this.check(_length(...args));
    },
    nonempty(...args) {
      return this.check(_minLength(1, ...args));
    },
    lowercase(params) {
      return this.check(_lowercase(params));
    },
    uppercase(params) {
      return this.check(_uppercase(params));
    },
    trim() {
      return this.check(_trim());
    },
    normalize(...args) {
      return this.check(_normalize(...args));
    },
    toLowerCase() {
      return this.check(_toLowerCase());
    },
    toUpperCase() {
      return this.check(_toUpperCase());
    },
    slugify() {
      return this.check(_slugify());
    }
  })
);
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
}, {
  email(params) {
    return this.check(_email(ZodEmail, params));
  },
  url(params) {
    return this.check(_url(ZodURL, params));
  },
  jwt(params) {
    return this.check(_jwt(ZodJWT, params));
  },
  emoji(params) {
    return this.check(_emoji2(ZodEmoji, params));
  },
  guid(params) {
    return this.check(_guid(ZodGUID, params));
  },
  uuid(params) {
    return this.check(_uuid(ZodUUID, params));
  },
  uuidv4(params) {
    return this.check(_uuidv4(ZodUUID, params));
  },
  uuidv6(params) {
    return this.check(_uuidv6(ZodUUID, params));
  },
  uuidv7(params) {
    return this.check(_uuidv7(ZodUUID, params));
  },
  nanoid(params) {
    return this.check(_nanoid(ZodNanoID, params));
  },
  cuid(params) {
    return this.check(_cuid(ZodCUID, params));
  },
  cuid2(params) {
    return this.check(_cuid2(ZodCUID2, params));
  },
  ulid(params) {
    return this.check(_ulid(ZodULID, params));
  },
  base64(params) {
    return this.check(_base64(ZodBase64, params));
  },
  base64url(params) {
    return this.check(_base64url(ZodBase64URL, params));
  },
  xid(params) {
    return this.check(_xid(ZodXID, params));
  },
  ksuid(params) {
    return this.check(_ksuid(ZodKSUID, params));
  },
  ipv4(params) {
    return this.check(_ipv4(ZodIPv4, params));
  },
  ipv6(params) {
    return this.check(_ipv6(ZodIPv6, params));
  },
  cidrv4(params) {
    return this.check(_cidrv4(ZodCIDRv4, params));
  },
  cidrv6(params) {
    return this.check(_cidrv6(ZodCIDRv6, params));
  },
  e164(params) {
    return this.check(_e164(ZodE164, params));
  },
  datetime(params) {
    return this.check(_isoDateTime(ZodISODateTime, params));
  },
  date(params) {
    return this.check(_isoDate(ZodISODate, params));
  },
  time(params) {
    return this.check(_isoTime(ZodISOTime, params));
  },
  duration(params) {
    return this.check(_isoDuration(ZodISODuration, params));
  }
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNumber = /* @__PURE__ */ $constructor(
  "ZodNumber",
  (inst, def) => {
    $ZodNumber.init(inst, def);
    ZodType.init(inst, def);
    inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
    inst.isFinite = true;
  },
  /* @__PURE__ */ util_exports.derived({
    minValue: (inst) => {
      const { minimum, exclusiveMinimum } = aggregateChecks(inst);
      return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
    },
    maxValue: (inst) => {
      const { maximum, exclusiveMaximum } = aggregateChecks(inst);
      return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
    },
    isInt: (inst) => {
      const { isInt, multipleOf } = aggregateChecks(inst);
      return !!isInt || !!multipleOf?.some(Number.isSafeInteger);
    },
    format: (inst) => aggregateChecks(inst).format ?? null
  }, {
    gt(value, params) {
      return this.check(_gt(value, params));
    },
    gte(value, params) {
      return this.check(_gte(value, params));
    },
    min(value, params) {
      return this.check(_gte(value, params));
    },
    lt(value, params) {
      return this.check(_lt(value, params));
    },
    lte(value, params) {
      return this.check(_lte(value, params));
    },
    max(value, params) {
      return this.check(_lte(value, params));
    },
    int(params) {
      return this.check(int(params));
    },
    safe(params) {
      return this.check(int(params));
    },
    positive(params) {
      return this.check(_gt(0, params));
    },
    nonnegative(params) {
      return this.check(_gte(0, params));
    },
    negative(params) {
      return this.check(_lt(0, params));
    },
    nonpositive(params) {
      return this.check(_lte(0, params));
    },
    multipleOf(value, params) {
      return this.check(_multipleOf(value, params));
    },
    step(value, params) {
      return this.check(_multipleOf(value, params));
    },
    finite() {
      return this;
    }
  })
);
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
var ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
  inst.element = def.element;
}, {
  min(n, params) {
    return this.check(_minLength(n, params));
  },
  nonempty(params) {
    return this.check(_minLength(1, params));
  },
  max(n, params) {
    return this.check(_maxLength(n, params));
  },
  length(n, params) {
    return this.check(_length(n, params));
  },
  unwrap() {
    return this.element;
  }
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
  util_exports.installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
}, {
  keyof() {
    return _enum(Object.keys(this._zod.def.shape));
  },
  catchall(catchall) {
    return this.clone(util_exports.mergeDefs(this._zod.def, { catchall }));
  },
  passthrough() {
    return this.clone(util_exports.mergeDefs(this._zod.def, { catchall: unknown() }));
  },
  loose() {
    return this.clone(util_exports.mergeDefs(this._zod.def, { catchall: unknown() }));
  },
  strict() {
    return this.clone(util_exports.mergeDefs(this._zod.def, { catchall: never() }));
  },
  strip() {
    return this.clone(util_exports.mergeDefs(this._zod.def, { catchall: void 0 }));
  },
  extend(incoming) {
    return util_exports.extend(this, incoming);
  },
  safeExtend(incoming) {
    return util_exports.safeExtend(this, incoming);
  },
  merge(other) {
    return util_exports.merge(this, other);
  },
  pick(mask) {
    return util_exports.pick(this, mask);
  },
  omit(mask) {
    return util_exports.omit(this, mask);
  },
  partial(...args) {
    return util_exports.partial(ZodOptional, this, args[0]);
  },
  exactPartial(...args) {
    return util_exports.partial(ZodExactOptional, this, args[0], "exactPartial");
  },
  required(...args) {
    return util_exports.required(ZodNonOptional, this, args[0]);
  }
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...util_exports.normalizeParams(params)
  };
  return new ZodObject(def);
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...util_exports.normalizeParams(params)
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
  inst.enum = def.entries;
  inst.options = [...inst._zod.values];
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...util_exports.normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...util_exports.normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...util_exports.normalizeParams(params)
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...util_exports.normalizeParams(params)
  });
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(util_exports.issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        if (!("input" in _issue))
          _issue.input = payload.value;
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(util_exports.issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output2) => {
        payload.value = output2;
        return payload;
      });
    }
    payload.value = output;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
var ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
  $ZodExactOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : util_exports.shallowClone(defaultValue);
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : util_exports.shallowClone(defaultValue);
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...util_exports.normalizeParams(params)
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : util_exports.constantCatch(catchValue)
  });
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
    // ...util.normalizeParams(params),
  });
}
var ZodPreprocess = /* @__PURE__ */ $constructor("ZodPreprocess", (inst, def) => {
  ZodPipe.init(inst, def);
  $ZodPreprocess.init(inst, def);
});
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}
function preprocess(fn, schema) {
  return new ZodPreprocess({
    type: "pipe",
    in: transform(fn),
    out: schema
  });
}

// src/shared/team.ts
var TEAMS_DIR = ".agents/teams";
var TEAM_SUFFIX = ".team.json";
var KNOWN_AGENTS = [
  "claude",
  "codex",
  "omp",
  "gemini",
  "opencode",
  "pi",
  "copilot",
  "cursor",
  "kimi",
  "qwen-code",
  "droid",
  "grok",
  "kiro",
  "hermes",
  "codebuddy"
];
var MODEL_SUGGESTIONS = {
  claude: ["opus", "sonnet", "haiku", "claude-opus-5-5", "claude-sonnet-5-5", "claude-haiku-5-5"],
  codex: ["gpt-5.5", "gpt-5.5-codex", "o4-mini"],
  gemini: ["gemini-2.5-pro", "gemini-2.5-flash"]
};
var name = string2().trim().min(1);
var optionalText = string2().trim().optional().transform((value) => value ? value : void 0);
var RuntimeSchema = object({
  agent: name,
  model: optionalText,
  effort: optionalText,
  surface: _enum(SURFACES).optional()
});
var RoleSchema = RuntimeSchema.extend({
  name,
  folders: array(string2().trim().min(1)).default([]),
  instructions: string2().default("")
});
var CandidateSchema = RuntimeSchema.extend({
  /** A short handle the lead picks it by; derived from the model or agent when left empty. */
  name,
  /** What it is good at and suited for, its cost or speed, and work it must not be given. */
  notes: string2().default("")
});
function candidateHandle(runtime) {
  const model = typeof runtime.model === "string" ? runtime.model.trim().split("/").pop() ?? "" : "";
  const base = (model || (typeof runtime.agent === "string" ? runtime.agent : "")).replace(/^claude-/, "");
  return base.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "") || "candidate";
}
function fillCandidateNames(value) {
  if (!Array.isArray(value)) return value;
  const named = (entry) => entry && typeof entry === "object" && typeof entry.name === "string" ? entry.name.trim() : "";
  const taken = new Set(value.map(named).filter(Boolean).map((entry) => entry.toLowerCase()));
  return value.map((entry) => {
    if (!entry || typeof entry !== "object" || named(entry)) return entry;
    const base = candidateHandle(entry);
    let handle = base;
    for (let index = 2; taken.has(handle.toLowerCase()); index += 1) handle = `${base}-${index}`;
    taken.add(handle.toLowerCase());
    return { ...entry, name: handle };
  });
}
var CandidatesSchema = preprocess(fillCandidateNames, array(CandidateSchema));
var TeamSchema = object({
  version: literal(1),
  /** Shown in pickers; the file name when empty. */
  name: string2().default(""),
  goal: string2().default(""),
  /** How the lead runs a request: a fixed collaboration mode, "auto" to pick one per request, or "none". */
  mode: _enum(TEAM_MODES).default("auto"),
  lead: RuntimeSchema,
  /** Fixed roles. May be empty when the team has candidate members. */
  roles: array(RoleSchema).default([]),
  /** The pool of models the lead gives work to by their descriptions. */
  candidates: CandidatesSchema.default([]),
  /** The language of the agents' instructions and replies; the app's when unset. */
  language: _enum(PROMPT_LANGUAGES).optional(),
  /** The preset the team was made from; a copy, so later edits of the preset don't change it. */
  preset: object({ id: string2(), name: string2() }).optional()
}).superRefine((team, ctx) => {
  const roleNames = /* @__PURE__ */ new Set();
  team.roles.forEach((role, index) => {
    const key2 = role.name.toLowerCase();
    if (roleNames.has(key2)) ctx.addIssue({ code: "custom", path: ["roles", index, "name"], message: `duplicate role name "${role.name}"` });
    roleNames.add(key2);
  });
  const candidateNames = /* @__PURE__ */ new Set();
  team.candidates.forEach((candidate, index) => {
    const key2 = candidate.name.toLowerCase();
    if (candidateNames.has(key2)) ctx.addIssue({ code: "custom", path: ["candidates", index, "name"], message: `duplicate candidate name "${candidate.name}"` });
    if (roleNames.has(key2)) ctx.addIssue({ code: "custom", path: ["candidates", index, "name"], message: `candidate "${candidate.name}" has the name of a role` });
    candidateNames.add(key2);
  });
  if (!team.roles.length && !team.candidates.length) ctx.addIssue({ code: "custom", path: ["roles"], message: "a team needs at least one role or one candidate member" });
});
function checkTeam(value) {
  const result = TeamSchema.safeParse(value);
  if (result.success) return { ok: true, team: result.data };
  return { ok: false, errors: result.error.issues.map((issue2) => `${issue2.path.join(".") || "team"}: ${issue2.message}`) };
}
function parseTeam(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch (error2) {
    return { ok: false, errors: [`team file is not valid JSON: ${error2.message}`] };
  }
  return checkTeam(value);
}
function serializeTeam(team) {
  return JSON.stringify(team, null, 2) + "\n";
}
function runtimeLabel(runtime) {
  return `${runtime.agent}${runtime.model ? `/${runtime.model}` : ""}${runtime.effort ? ` \xB7 ${runtime.effort}` : ""}`;
}
function teamTitle(team, file) {
  if (team.name.trim()) return team.name.trim();
  const base = (file ?? "").split("/").pop() ?? "";
  return base.endsWith(TEAM_SUFFIX) ? base.slice(0, -TEAM_SUFFIX.length) : base || "team";
}
function teamFileName(title) {
  const slug = title.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") || "team";
  return `${slug}${TEAM_SUFFIX}`;
}
function blankTeam(name2 = "") {
  return { version: 1, name: name2, goal: "", mode: "auto", lead: { agent: "claude", model: void 0, effort: void 0 }, roles: [], candidates: [{ name: "claude", agent: "claude", model: void 0, effort: void 0, notes: "" }] };
}
var PresetSchema = object({
  id: name,
  team: TeamSchema,
  updatedAt: string2().default("")
});
function newPresetId(random = Math.random) {
  return `p-${Math.floor(random() * 4294967296).toString(16).padStart(8, "0")}`;
}

// src/shared/prompt.ts
var T = LEAD_TOOLS;
var M = MEMBER_TOOLS;
function teamTable(team) {
  if (!team.roles.length) return ["No fixed roles: assign work to the candidate members below, by their descriptions."];
  return [
    "| Role | Agent/model | Folders |",
    "| --- | --- | --- |",
    ...team.roles.map((role) => `| ${role.name} | ${runtimeLabel(role)} | ${role.folders.length ? role.folders.join(", ") : "(any)"} |`)
  ];
}
function candidateList(team) {
  return team.candidates.flatMap((candidate) => [
    `- ${candidate.name} (${runtimeLabel(candidate)})`,
    ...candidate.notes.trim() ? candidate.notes.trim().split("\n").map((line) => `  ${line.trim()}`).filter((line) => line.trim()) : ["  (no description: a general member; give it work its model suits)"]
  ]);
}
var MODE_LINE = {
  auto: "auto: pick team or delegation mode for each request.",
  team: "team: every request goes through intake and a team run.",
  delegation: "delegation: split each request and delegate the parts.",
  none: "none: no collaboration. Do the work yourself and start no members."
};
function commandUsage() {
  return [
    `## The ${TEAM_BIN} command`,
    `You reach the team only through the \`${TEAM_BIN}\` command, which the plugin put on your PATH. Run it with your shell tool: \`${TEAM_BIN} <command> '<json>'\`, or pass the JSON on stdin for long text:`,
    "```sh",
    `${TEAM_BIN} delegate <<'JSON'`,
    `{"tasks":[{"role":"api","task":"..."}]}`,
    "JSON",
    "```",
    `\`${TEAM_BIN} help\` lists the commands and \`${TEAM_BIN} help <command>\` shows the fields of one. Messages for you (and plans waiting for you) are added to the output of any ${TEAM_BIN} command you run, so read the whole output.`
  ];
}
function modeRules() {
  return [
    "## Choosing the mode",
    `Before you act on a request, run \`${T.status}\`. It reports the session's current mode (the user can switch it), the team, the roles you formed and any run in progress. Follow the mode it reports:`,
    "- team or delegation: use that mode.",
    `- none: do the work yourself, like a single agent; never start members (\`${T.delegate}\` and \`${T.kickoff}\` are refused).`,
    `- auto: pick team or delegation for the request. Team mode fits when ${MODE_SPECS.team.fit}. Delegation mode fits when ${MODE_SPECS.delegation.fit}. Say in one line which mode you picked and why. When the user names a mode, use it. The first run you start fixes the session to that mode for good, so choose deliberately; until then you may answer yourself.`,
    "Answer yourself, without starting members, when the request is a question about the team or its results, or too small to split."
  ];
}
function formingRules() {
  return [
    "## Assigning work to candidates",
    "- A candidate is a model, not a job: nothing about it is fixed except what its description says. Give each piece of work to the candidate whose description says it is good at or suited for that kind of work, and weigh cost and speed when the description gives them. A candidate without a description is a general member: give it work its model is suited for.",
    "- Treat what a description says a candidate must not do as a hard rule: never give it that work, also not as part of a larger task. When no candidate fits a piece of work, do it yourself or tell the user.",
    `- Give work to a candidate under a job name: in \`${T.delegate}\` or a team task, set role to a short lowercase name for the job (such as api, tester or docs) and candidate to the candidate that does it. The role is formed for this session on that candidate, with its description as notes, and its member is named after the role. Use the same role name for later work on the same job. A candidate's own name is not a role.`,
    `- To give a role its own instructions or folders, or move it to another candidate, use \`${T.role}\`: a short lowercase name, the candidate, instructions and folders. A role can only run on a candidate's agent and model.`,
    "- Fixed roles stay available next to the candidates. When you split work, say in one line which candidate gets what and why, citing its description."
  ];
}
function delegationRules(team) {
  const noFit = team.candidates.length ? "Otherwise give it to the candidate whose description fits it." : "Use the role `helper` only when no role fits; it runs on your own agent and model.";
  return [
    `## Delegation mode (${MODE_SPECS.delegation.pattern})`,
    "You split the request, members work alone and report only to you, you sum up.",
    `1. Split the request into parts and give each part to the role that owns it, by its folders and notes. ${noFit}`,
    `2. Run \`${T.delegate}\` once with all the parts. A member sees only its own task, not the user's request or the other members, so make each task self-contained: context, files, acceptance criteria and what to report back.`,
    "3. Give parts that touch the same files to one role, or delegate the second after the first has finished.",
    `4. Run \`${T.wait}\` to collect the results; run it again while members still work. When a result is incomplete or wrong, follow up with \`${T.send}\` and wait again.`,
    "5. Report what each role did, what was checked and what is left. Your reply after collecting the results is recorded as the batch's summary."
  ];
}
function teamRules() {
  return [
    `## Team mode (${MODE_SPECS.team.pattern})`,
    "You are the team's liaison and lead. You work out the requirement with the user, plan the work as tasks on a shared task board, approve and check the members' work, and integrate the result. Never pass the user's message on as it is.",
    "1. Intake: restate the request in your own words and ask what you need to know: scope, acceptance criteria, constraints, priorities, which roles should take part. Ask at most five questions at a time. During intake, do not start members and do not change files; reading the repository is fine.",
    `2. Brief and plan: write the brief (title, goal, requirements, acceptance criteria, constraints, out of scope) and break the work into tasks: a title, details saying what done means, the role that should do it (or none for anyone), the earlier tasks it waits for, and the files it will change. Set planApproval when the user wants to approve how members go about their tasks. Record it all with \`${T.brief}\`, show the brief and the tasks to the user, ask them to confirm or correct, and end your turn.`,
    `3. Only after the user replies to confirm it, run \`${T.kickoff}\` with \`userConfirmation\` set to their confirming words, quoted exactly. The plugin checks that the user sent them after the brief was recorded (the user may also press Confirm in the Ensemble panel). After a correction, record it again with \`${T.brief}\`.`,
    "4. The run: the plugin posts the brief, puts the tasks on the board and starts a member for each role. Members claim ready tasks, mark them done with what they changed, and take the next one. The plugin hands open tasks to idle members and starts members for roles with work. Members message each other and you through the board. After the work the plugin runs a review round: members check each other's done tasks and send back what doesn't meet the brief.",
    `5. Lead the run: run \`${T.wait}\` (again while members work). Approve plans or send them back with feedback (\`${T.tasks}\`); answer questions (\`${T.broadcast}\` to several members, \`${T.send}\` to one); add, reassign, reopen with feedback, or drop tasks (\`${T.tasks}\`).`,
    `6. Integrate: when the run has finished, read the board (\`${T.board}\`), check every acceptance criterion against the done tasks, send back tasks that miss one and wait again. Then report to the user what was done, how it was checked and what is left.`,
    `7. When the user accepts the result, run \`${T.close}\`. A follow-up that changes the requirement goes through intake again.`
  ];
}
function orchestratorPrompt(team, source) {
  const notes = team.roles.filter((role) => role.instructions.trim()).map((role) => `- ${role.name}: ${role.instructions.trim()}`);
  return [
    "You are the lead of an agent team in Orca. The user talks to you; the team's members work for you, each in its own agent in your workspace: a chat (Orca's graphical client) or a terminal, as the team says.",
    team.goal.trim() ? `Team goal: ${team.goal.trim()}` : "",
    `The team comes from ${source}.`,
    "",
    ...commandUsage(),
    "",
    "## Team",
    ...teamTable(team),
    "The plugin starts members for you, on their role's agent and model, in your workspace.",
    ...notes.length ? ["", "## Role notes", ...notes] : [],
    ...team.candidates.length ? ["", "## Candidate members (the pool)", ...candidateList(team), "", ...formingRules()] : [],
    "",
    "## Collaboration mode",
    `Configured mode: ${MODE_LINE[team.mode]}`,
    "",
    ...modeRules(),
    "",
    ...delegationRules(team),
    "",
    ...teamRules(),
    "",
    "## Rules",
    `- Start and message members only with \`${TEAM_BIN}\`. Never start them yourself with \`orca agent launch\`, \`orca orchestration\`, sub-agents or other tools: \`${TEAM_BIN}\` gives each role its own agent, model and place on the team's dashboard.`,
    `- If \`${TEAM_BIN}\` is not found or says the plugin is not running, tell the user that the Ensemble plugin is not available and stop. Do not work around it.`,
    "- Keep members inside their folders. When a member is blocked (a permission prompt or an error), tell the user which role and why."
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
}
function leadStartPrompt(team, source, request) {
  const head = `${PLUGIN_MESSAGE_PREFIX} You are the lead of the agent team "${team.name || source}". Run \`${T.status}\` now: it prints your standing instructions, the team and the collaboration mode. Follow them for the whole session; start and message members only through \`${TEAM_BIN}\`.`;
  return request.trim() ? `${head}

The user's request:
${request.trim()}` : `${head}

Then reply with a short summary of the team (roles and candidates with agent/model) and the mode, and say you are ready for a request. Do not start members yet.`;
}
function teamChangedMessage(team, source) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} The team (${source}) changed. Run \`${T.status}\` to read it again and use it from now on.`,
    `Configured collaboration mode: ${MODE_LINE[team.mode]}`
  ].join("\n");
}
function memberSystemPrompt(team, role) {
  return [
    `You are the "${role.name}" member of an agent team in Orca. Your work comes from the team's lead, not from the user directly.`,
    team.goal.trim() ? `Team goal: ${team.goal.trim()}` : "",
    role.folders.length ? `Your folders: ${role.folders.join(", ")}. Stay inside them unless a task says otherwise.` : "You have no folder limit, but keep to what your task asks.",
    role.instructions.trim() ? `Role notes: ${role.instructions.trim()}` : "",
    `You reach the team only through the \`${TEAM_BIN}\` command on your PATH (\`${TEAM_BIN} <command> '<json>'\`, or the JSON on stdin; \`${TEAM_BIN} help\` lists the commands). Messages for you are added to the output of any ${TEAM_BIN} command you run.`,
    `Each message from the lead says what kind of run it is: a delegation task, which you do alone and finish with \`${M.report}\`, or a team run with a shared task board and message board, which you use through \`${M.read}\`, \`${M.task}\`, \`${M.post}\` and \`${M.claim}\`.`
  ].filter(Boolean).join("\n");
}
function roleHeader(role) {
  return [
    `Your role in this session: ${role.name}.`,
    role.instructions.trim() ? `Role notes: ${role.instructions.trim()}` : "",
    role.folders.length ? `Your folders: ${role.folders.join(", ")}.` : ""
  ].filter(Boolean).join(" ");
}
function delegationTaskPrompt(run, task) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} Delegation task from the lead (run ${run.id}).`,
    "You work on this task alone. You don't see the other members' tasks and they don't see yours; only the lead reads your result.",
    "",
    "## Task",
    task.trim(),
    "",
    "## When you finish",
    `Report with \`${M.report}\` (JSON field \`result\`: what you changed (files), how you checked it, and anything left or blocked, at most 300 words), then end your turn. If you can't run it, end with that report as your reply.`
  ].join("\n");
}
function rosterLines(roster) {
  return roster.map((role) => `- ${role.name}: folders ${role.folders.length ? role.folders.join(", ") : "(any)"}${role.instructions.trim() ? ` \xB7 ${role.instructions.trim()}` : ""}`);
}
var sameRole2 = (a, b) => (a ?? "").toLowerCase() === b.toLowerCase();
function taskBrief(task) {
  return [task.id + ": " + task.title, task.detail, task.files.length ? `Files: ${task.files.join(", ")}` : "", task.feedback ? `Sent back before: ${task.feedback}` : ""].filter(Boolean).join("\n");
}
function boardProtocol(run) {
  return [
    `- Run \`${M.read}\` first: it shows the brief, the task board and the posts.`,
    `- Claim a task with \`${M.task} '{"action":"claim"}'\` (add "id" for a given one) before you start it. A task that waits for others can't be claimed until they are done. Claiming a task claims its files too.`,
    ...run.planApproval ? [`- This run needs plan approval: after claiming a task, submit your plan (action "plan", id, text: what you will change and how you will check it) and end your turn. You are woken when the lead approves it or sends it back; only do the work once it is approved.`] : [],
    `- When a task is finished, mark it done (action "done", id, result: what you changed and how you checked it). Then take the next ready task: tasks for your role first, then tasks for anyone.`,
    `- Work you find that someone else should do: add a task (action "add", with its role). A task you can't finish: put it back (action "release") and say why on the board.`,
    `- Before editing files outside your tasks' files, claim them with \`${M.claim}\`. A path another member holds is refused: ask them on the board.`,
    `- Messages: post with \`${M.post}\` and set \`to\` to roles, a member's title (such as api 2), "lead" or "${TO_ALL}". Messages for you arrive in the output of any ${TEAM_BIN} command you run, and wake you when you are idle. Answer questions addressed to you.`,
    `- When no ready task is left for you, post "done" with a short summary and end your turn. The plugin wakes you when a task opens up for you.`
  ];
}
function teamKickoffPrompt(run, brief, roster, role, header = "") {
  const mine = run.tasks.filter((task) => taskReady(run, task) && (task.role === null || sameRole2(task.role, role.name)));
  return [
    `${PLUGIN_MESSAGE_PREFIX} Team run ${run.id} started (round ${run.round} of ${run.rounds}). The user and the lead agreed this brief:`,
    "",
    briefText(brief),
    "",
    "## Members in this run",
    ...rosterLines(roster),
    `You are "${role.name}".${header ? ` ${header}` : ""}`,
    "",
    "## The task board",
    taskBoardText(run),
    mine.length ? `Ready for you now: ${mine.map((task) => task.id).join(", ")}.` : "No task is ready for you yet; read the board, help where asked, and you are woken when one opens up.",
    "",
    "## How the team works",
    ...boardProtocol(run)
  ].join("\n");
}
function assignmentPrompt(run, task, header = "") {
  return [
    `${PLUGIN_MESSAGE_PREFIX} Task ${task.id} on team run ${run.id} is yours now (claimed for you).${header ? ` ${header}` : ""}`,
    "",
    taskBrief(task),
    "",
    run.planApproval ? `Submit your plan for it (\`${M.task}\`, action "plan") and end your turn; do the work once the lead approves it.` : `Do it, then mark it done (\`${M.task}\`, action "done", with what you changed and how you checked it). Then take the next ready task, or post "done" and end your turn when none is left.`,
    `Read the board first (\`${M.read}\`) if you need the brief or what others did.`
  ].join("\n");
}
function verdictLine(task) {
  return task.plan?.status === "approved" ? `The lead approved your plan for ${task.id} "${task.title}"${task.plan.feedback ? `: ${task.plan.feedback}` : "."} Do the task now, then mark it done (\`${M.task}\`, action "done").` : `The lead sent back your plan for ${task.id} "${task.title}": ${task.plan?.feedback ?? ""} Revise it and submit it again (\`${M.task}\`, action "plan").`;
}
function planReviewedPrompt(run, tasks) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} Team run ${run.id}: the lead decided on your plan${tasks.length === 1 ? "" : "s"}.`,
    ...tasks.map((task) => `- ${verdictLine(task)}`),
    "",
    `When that is done, take the next ready task, or post "done" and end your turn.`
  ].join("\n");
}
function teamRoundPrompt(run, since) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} Team run ${run.id}, round ${run.round} of ${run.rounds}: review.`,
    `Read the board (\`${M.read} '{"since":${since}}'\`) and the task board. Check the done tasks of the others that touch your area against the brief and each task's details: interfaces, names, data formats and files you both rely on.`,
    `Send back a task that misses them (\`${M.task}\`, action "reject", id, reason): it goes back to its role with your reason. Answer messages addressed to you, and fix your own tasks if they come back.`,
    `Then post "done" with what you checked and what you sent back, or "no findings", and end your turn.`
  ].join("\n");
}
function mentionPrompt(run, posts) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} Team run ${run.id}:`,
    inboxText(posts),
    "",
    `Act on what concerns your part. Answer questions with \`${M.post}\` (kind "answer", to the author). Take a ready task if one is yours (\`${M.task}\`), otherwise post "done" with what changed and end your turn.`
  ].join("\n");
}
function broadcastPrompt(run, message, author = "lead") {
  return [
    `${PLUGIN_MESSAGE_PREFIX} Message from the ${author} on the board of team run ${run.id} (round ${run.round} of ${run.rounds}):`,
    message.trim(),
    "",
    `Read the board (\`${M.read}\`), act on it, post "done" with what changed, and end your turn.`
  ].join("\n");
}
function leadNoticePrompt(run) {
  if (run.mode === "team") {
    const open2 = run.tasks.filter((task) => task.state === "todo" || task.state === "doing").length;
    return `${PLUGIN_MESSAGE_PREFIX} Team run ${run.id} "${run.title}" finished round ${run.round} of ${run.rounds}${open2 ? ` with ${open2} task${open2 === 1 ? "" : "s"} still open` : ""}. Run \`${T.wait}\` (it returns at once) and \`${T.board}\` to read the board, check the done tasks against the brief's acceptance criteria, send back what misses them (\`${T.tasks}\`), and report to the user.`;
  }
  return `${PLUGIN_MESSAGE_PREFIX} Delegation run ${run.id} "${run.title}": every member has finished. Run \`${T.wait}\` (it returns at once) to collect their results, then report to the user.`;
}
function planWaitingPrompt(run, task) {
  return `${PLUGIN_MESSAGE_PREFIX} ${task.ownerTitle ?? "A member"} submitted a plan for ${task.id} "${task.title}" in team run ${run.id}:
${task.plan?.text ?? ""}

Approve it or send it back with feedback (\`${T.tasks}\`, review), then run \`${T.wait}\`.`;
}
function modeChangedPrompt(mode, configured) {
  const now2 = mode ?? configured;
  return `${PLUGIN_MESSAGE_PREFIX} The user set this session's collaboration mode to ${now2}${mode === null ? " (the team's mode)" : ""}. ${MODE_LINE[now2]} Follow it from the next request; a run already in progress keeps its mode.`;
}
function chatNote(bin) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} You run as an Orca chat, so \`${TEAM_BIN}\` is not on your PATH. Run it by its full path:`,
    `  '${bin}' status`,
    `Team messages from the lead or other members arrive as Orca mail (a message from "Ensemble"). Answer with \`${TEAM_BIN}\` tools, such as ${M.report}, not with \`orca orchestration reply\`.`
  ].join("\n");
}
function memberStartPrompt(team, role, work) {
  return `${memberSystemPrompt(team, role)}

${work}`;
}

// src/shared/prompt-zh.ts
var prompt_zh_exports = {};
__export(prompt_zh_exports, {
  assignmentPrompt: () => assignmentPrompt2,
  broadcastPrompt: () => broadcastPrompt2,
  chatNote: () => chatNote2,
  delegationTaskPrompt: () => delegationTaskPrompt2,
  leadNoticePrompt: () => leadNoticePrompt2,
  leadStartPrompt: () => leadStartPrompt2,
  memberStartPrompt: () => memberStartPrompt2,
  memberSystemPrompt: () => memberSystemPrompt2,
  mentionPrompt: () => mentionPrompt2,
  modeChangedPrompt: () => modeChangedPrompt2,
  orchestratorPrompt: () => orchestratorPrompt2,
  planReviewedPrompt: () => planReviewedPrompt2,
  planWaitingPrompt: () => planWaitingPrompt2,
  roleHeader: () => roleHeader2,
  teamChangedMessage: () => teamChangedMessage2,
  teamKickoffPrompt: () => teamKickoffPrompt2,
  teamRoundPrompt: () => teamRoundPrompt2,
  verdictLine: () => verdictLine2
});
var T2 = LEAD_TOOLS;
var M2 = MEMBER_TOOLS;
var LANGUAGE_RULE = "\u8BED\u8A00\uFF1A\u59CB\u7EC8\u7528\u7B80\u4F53\u4E2D\u6587\u56DE\u590D\uFF1B\u9700\u6C42\u7B80\u62A5\u3001\u4EFB\u52A1\u6807\u9898\u548C\u8BF4\u660E\u3001\u8BA1\u5212\u3001\u4EFB\u52A1\u7ED3\u679C\u548C\u9ED1\u677F\u5E16\u5B50\u4E5F\u90FD\u7528\u7B80\u4F53\u4E2D\u6587\u5199\u3002\u4EE3\u7801\u3001\u6587\u4EF6\u540D\u3001\u547D\u4EE4\u53CA\u5176\u53C2\u6570\uFF08\u5305\u62EC JSON \u5B57\u6BB5\u540D\u548C\u53D6\u503C\uFF09\u4FDD\u6301\u539F\u6837\u3002";
var sentence = (text) => !text.trim() || /[。！？.!?]$/.test(text.trim()) ? text.trim() : `${text.trim()}\u3002`;
function teamTable2(team) {
  if (!team.roles.length) return ["\u6CA1\u6709\u56FA\u5B9A\u89D2\u8272\uFF1A\u6309\u4E0B\u9762\u5019\u9009\u6210\u5458\u7684\u63CF\u8FF0\u7ED9\u4ED6\u4EEC\u5206\u914D\u5DE5\u4F5C\u3002"];
  return [
    "| \u89D2\u8272 | \u667A\u80FD\u4F53/\u6A21\u578B | \u6587\u4EF6\u5939 |",
    "| --- | --- | --- |",
    ...team.roles.map((role) => `| ${role.name} | ${runtimeLabel(role)} | ${role.folders.length ? role.folders.join(", ") : "\uFF08\u4E0D\u9650\uFF09"} |`)
  ];
}
function candidateList2(team) {
  return team.candidates.flatMap((candidate) => [
    `- ${candidate.name} (${runtimeLabel(candidate)})`,
    ...candidate.notes.trim() ? candidate.notes.trim().split("\n").map((line) => `  ${line.trim()}`).filter((line) => line.trim()) : ["  \uFF08\u65E0\u63CF\u8FF0\uFF1A\u901A\u7528\u6210\u5458\uFF0C\u6309\u5B83\u6240\u7528\u6A21\u578B\u7684\u80FD\u529B\u5206\u914D\u5DE5\u4F5C\uFF09"]
  ]);
}
var MODE_LINE2 = {
  auto: "auto\uFF08\u81EA\u52A8\uFF09\uFF1A\u4E3A\u6BCF\u4E2A\u8BF7\u6C42\u9009\u62E9\u56E2\u961F\u6A21\u5F0F\u6216\u59D4\u6D3E\u6A21\u5F0F\u3002",
  team: "team\uFF08\u56E2\u961F\u6A21\u5F0F\uFF09\uFF1A\u6BCF\u4E2A\u8BF7\u6C42\u90FD\u5148\u505A\u9700\u6C42\u5BF9\u63A5\uFF0C\u518D\u8FDB\u884C\u4E00\u6B21\u56E2\u961F\u8FD0\u884C\u3002",
  delegation: "delegation\uFF08\u59D4\u6D3E\u6A21\u5F0F\uFF09\uFF1A\u62C6\u5206\u6BCF\u4E2A\u8BF7\u6C42\uFF0C\u628A\u5404\u90E8\u5206\u59D4\u6D3E\u51FA\u53BB\u3002",
  none: "none\uFF08\u65E0\uFF09\uFF1A\u4E0D\u534F\u4F5C\u3002\u4F60\u81EA\u5DF1\u5B8C\u6210\u5DE5\u4F5C\uFF0C\u4E0D\u542F\u52A8\u4EFB\u4F55\u6210\u5458\u3002"
};
var TEAM_FIT = "\u5404\u90E8\u5206\u76F8\u4E92\u4F9D\u8D56\u3001\u9700\u8981\u4F5C\u4E3A\u4E00\u4E2A\u6574\u4F53\u5546\u5B9A\uFF08\u591A\u4E2A\u89D2\u8272\u90FD\u8981\u5BF9\u63A5\u7684\u63A5\u53E3\u3001\u8DE8\u6A21\u5757\u7684\u6539\u52A8\u3001\u9700\u8981\u591A\u4E2A\u89D2\u8272\u8BC4\u5BA1\u7684\u8BBE\u8BA1\uFF09\uFF0C\u9700\u6C42\u8FD8\u4E0D\u660E\u786E\uFF0C\u6216\u8005\u9700\u8981\u9A8C\u8BC1\u591A\u4E2A\u5047\u8BBE\u3001\u7531\u6210\u5458\u4E92\u76F8\u7EA0\u6B63";
var DELEGATION_FIT = "\u8BF7\u6C42\u53EF\u4EE5\u62C6\u6210\u5F52\u5C5E\u660E\u786E\u3001\u5F7C\u6B64\u65E0\u9700\u6C9F\u901A\u5C31\u80FD\u5B8C\u6210\u7684\u90E8\u5206\uFF08\u76F8\u4E92\u72EC\u7ACB\u7684\u529F\u80FD\u3001\u6309\u9886\u57DF\u5206\u522B\u8C03\u7814\u3001\u53EA\u8BFB\u7684\u63A2\u7D22\uFF09";
function commandUsage2() {
  return [
    `## ${TEAM_BIN} \u547D\u4EE4`,
    `\u4F60\u53EA\u80FD\u901A\u8FC7 \`${TEAM_BIN}\` \u547D\u4EE4\u8054\u7CFB\u56E2\u961F\uFF0C\u63D2\u4EF6\u5DF2\u628A\u5B83\u653E\u8FDB\u4F60\u7684 PATH\u3002\u7528\u4F60\u7684 shell \u5DE5\u5177\u8FD0\u884C\u5B83\uFF1A\`${TEAM_BIN} <command> '<json>'\`\uFF1B\u6587\u672C\u8F83\u957F\u65F6\uFF0C\u4E5F\u53EF\u4EE5\u901A\u8FC7 stdin \u4F20\u5165 JSON\uFF1A`,
    "```sh",
    `${TEAM_BIN} delegate <<'JSON'`,
    `{"tasks":[{"role":"api","task":"..."}]}`,
    "JSON",
    "```",
    `\`${TEAM_BIN} help\` \u5217\u51FA\u6240\u6709\u547D\u4EE4\uFF0C\`${TEAM_BIN} help <command>\` \u663E\u793A\u67D0\u4E2A\u547D\u4EE4\u7684\u5B57\u6BB5\u3002\u53D1\u7ED9\u4F60\u7684\u6D88\u606F\uFF08\u4EE5\u53CA\u7B49\u4F60\u5BA1\u6279\u7684\u8BA1\u5212\uFF09\u4F1A\u9644\u5728\u4F60\u8FD0\u884C\u7684\u4EFB\u4F55 ${TEAM_BIN} \u547D\u4EE4\u7684\u8F93\u51FA\u91CC\uFF0C\u6240\u4EE5\u8981\u8BFB\u5B8C\u6574\u4E2A\u8F93\u51FA\u3002`
  ];
}
function modeRules2() {
  return [
    "## \u9009\u62E9\u6A21\u5F0F",
    `\u5904\u7406\u8BF7\u6C42\u4E4B\u524D\uFF0C\u5148\u8FD0\u884C \`${T2.status}\`\u3002\u5B83\u4F1A\u62A5\u544A\u672C\u4F1A\u8BDD\u5F53\u524D\u7684\u6A21\u5F0F\uFF08\u7528\u6237\u53EF\u4EE5\u5207\u6362\uFF09\u3001\u56E2\u961F\u3001\u4F60\u7EC4\u5EFA\u7684\u89D2\u8272\u4EE5\u53CA\u6B63\u5728\u8FDB\u884C\u7684\u8FD0\u884C\u3002\u6309\u5B83\u62A5\u544A\u7684\u6A21\u5F0F\u6267\u884C\uFF1A`,
    "- team\uFF08\u56E2\u961F\u6A21\u5F0F\uFF09\u6216 delegation\uFF08\u59D4\u6D3E\u6A21\u5F0F\uFF09\uFF1A\u4F7F\u7528\u8BE5\u6A21\u5F0F\u3002",
    `- none\uFF08\u65E0\uFF09\uFF1A\u50CF\u5355\u4E2A\u667A\u80FD\u4F53\u4E00\u6837\u81EA\u5DF1\u5B8C\u6210\u5DE5\u4F5C\uFF1B\u7EDD\u4E0D\u542F\u52A8\u6210\u5458\uFF08\`${T2.delegate}\` \u548C \`${T2.kickoff}\` \u4F1A\u88AB\u62D2\u7EDD\uFF09\u3002`,
    `- auto\uFF08\u81EA\u52A8\uFF09\uFF1A\u4E3A\u8FD9\u4E2A\u8BF7\u6C42\u9009\u62E9\u56E2\u961F\u6A21\u5F0F\u6216\u59D4\u6D3E\u6A21\u5F0F\u3002\u56E2\u961F\u6A21\u5F0F\u9002\u7528\u4E8E\uFF1A${TEAM_FIT}\u3002\u59D4\u6D3E\u6A21\u5F0F\u9002\u7528\u4E8E\uFF1A${DELEGATION_FIT}\u3002\u7528\u4E00\u53E5\u8BDD\u8BF4\u660E\u4F60\u9009\u4E86\u54EA\u79CD\u6A21\u5F0F\u4EE5\u53CA\u539F\u56E0\u3002\u7528\u6237\u6307\u5B9A\u4E86\u6A21\u5F0F\u65F6\uFF0C\u5C31\u7528\u8BE5\u6A21\u5F0F\u3002\u4F60\u542F\u52A8\u7684\u7B2C\u4E00\u6B21\u8FD0\u884C\u4F1A\u628A\u672C\u4F1A\u8BDD\u6C38\u4E45\u56FA\u5B9A\u4E3A\u8BE5\u6A21\u5F0F\uFF0C\u6240\u4EE5\u8981\u614E\u91CD\u9009\u62E9\uFF1B\u5728\u6B64\u4E4B\u524D\u4F60\u53EF\u4EE5\u81EA\u5DF1\u56DE\u7B54\u3002`,
    "\u5982\u679C\u8BF7\u6C42\u662F\u5173\u4E8E\u56E2\u961F\u6216\u5176\u7ED3\u679C\u7684\u95EE\u9898\uFF0C\u6216\u8005\u5C0F\u5230\u4E0D\u503C\u5F97\u62C6\u5206\uFF0C\u5C31\u81EA\u5DF1\u56DE\u7B54\uFF0C\u4E0D\u542F\u52A8\u6210\u5458\u3002"
  ];
}
function formingRules2() {
  return [
    "## \u7ED9\u5019\u9009\u6210\u5458\u5206\u914D\u5DE5\u4F5C",
    "- \u5019\u9009\u6210\u5458\u662F\u4E00\u4E2A\u6A21\u578B\uFF0C\u4E0D\u662F\u4E00\u4E2A\u5C97\u4F4D\uFF1A\u9664\u4E86\u63CF\u8FF0\u91CC\u5199\u7684\u5185\u5BB9\uFF0C\u5B83\u6CA1\u6709\u4EFB\u4F55\u56FA\u5B9A\u8BBE\u5B9A\u3002\u628A\u6BCF\u9879\u5DE5\u4F5C\u4EA4\u7ED9\u63CF\u8FF0\u4E2D\u8868\u660E\u64C5\u957F\u6216\u9002\u5408\u8FD9\u7C7B\u5DE5\u4F5C\u7684\u5019\u9009\u6210\u5458\uFF1B\u63CF\u8FF0\u91CC\u7ED9\u51FA\u6210\u672C\u548C\u901F\u5EA6\u65F6\uFF0C\u4E5F\u8981\u4E00\u5E76\u6743\u8861\u3002\u6CA1\u6709\u63CF\u8FF0\u7684\u5019\u9009\u6210\u5458\u662F\u901A\u7528\u6210\u5458\uFF1A\u628A\u9002\u5408\u5B83\u6240\u7528\u6A21\u578B\u7684\u5DE5\u4F5C\u4EA4\u7ED9\u5B83\u3002",
    "- \u63CF\u8FF0\u4E2D\u8BF4\u67D0\u4E2A\u5019\u9009\u6210\u5458\u4E0D\u80FD\u505A\u7684\u4E8B\u662F\u786C\u6027\u89C4\u5219\uFF1A\u7EDD\u4E0D\u628A\u8FD9\u7C7B\u5DE5\u4F5C\u4EA4\u7ED9\u5B83\uFF0C\u4F5C\u4E3A\u66F4\u5927\u4EFB\u52A1\u7684\u4E00\u90E8\u5206\u4E5F\u4E0D\u884C\u3002\u6CA1\u6709\u4EFB\u4F55\u5019\u9009\u6210\u5458\u9002\u5408\u67D0\u9879\u5DE5\u4F5C\u65F6\uFF0C\u4F60\u81EA\u5DF1\u505A\uFF0C\u6216\u8005\u544A\u8BC9\u7528\u6237\u3002",
    `- \u4EA4\u7ED9\u5019\u9009\u6210\u5458\u7684\u5DE5\u4F5C\u8981\u8D77\u4E00\u4E2A\u5C97\u4F4D\u540D\uFF1A\u5728 \`${T2.delegate}\` \u6216\u56E2\u961F\u4EFB\u52A1\u4E2D\uFF0Crole \u586B\u8FD9\u4EFD\u5DE5\u4F5C\u7684\u7B80\u77ED\u5C0F\u5199\u5C97\u4F4D\u540D\uFF08\u4F8B\u5982 api\u3001tester \u6216 docs\uFF09\uFF0Ccandidate \u586B\u7531\u54EA\u4E2A\u5019\u9009\u6210\u5458\u6765\u505A\u3002\u63D2\u4EF6\u4F1A\u5728\u8BE5\u5019\u9009\u6210\u5458\u4E0A\u4E3A\u672C\u4F1A\u8BDD\u5EFA\u597D\u8FD9\u4E2A\u89D2\u8272\uFF0C\u4EE5\u5B83\u7684\u63CF\u8FF0\u4F5C\u4E3A\u8BF4\u660E\uFF0C\u6210\u5458\u4E5F\u4EE5\u89D2\u8272\u540D\u547D\u540D\u3002\u4E4B\u540E\u540C\u4E00\u5C97\u4F4D\u7684\u5DE5\u4F5C\u7EE7\u7EED\u7528\u8FD9\u4E2A\u89D2\u8272\u540D\u3002\u5019\u9009\u6210\u5458\u81EA\u5DF1\u7684\u540D\u5B57\u4E0D\u80FD\u5F53\u4F5C\u89D2\u8272\u3002`,
    `- \u8981\u7ED9\u89D2\u8272\u8BBE\u7F6E\u81EA\u5DF1\u7684\u6307\u4EE4\u6216\u6587\u4EF6\u5939\uFF0C\u6216\u628A\u5B83\u6362\u5230\u53E6\u4E00\u4E2A\u5019\u9009\u6210\u5458\u4E0A\uFF0C\u7528 \`${T2.role}\`\uFF1A\u4E00\u4E2A\u7B80\u77ED\u7684\u5C0F\u5199\u540D\u79F0\u3001\u5019\u9009\u6210\u5458\u3001\u6307\u4EE4\u548C\u6587\u4EF6\u5939\u3002\u89D2\u8272\u53EA\u80FD\u8FD0\u884C\u5728\u67D0\u4E2A\u5019\u9009\u6210\u5458\u7684\u667A\u80FD\u4F53\u548C\u6A21\u578B\u4E0A\u3002`,
    "- \u56FA\u5B9A\u89D2\u8272\u4E0E\u5019\u9009\u6210\u5458\u540C\u65F6\u53EF\u7528\u3002\u62C6\u5206\u5DE5\u4F5C\u65F6\uFF0C\u7528\u4E00\u53E5\u8BDD\u8BF4\u660E\u54EA\u4E2A\u5019\u9009\u6210\u5458\u8D1F\u8D23\u4EC0\u4E48\u4EE5\u53CA\u539F\u56E0\uFF0C\u5E76\u5F15\u7528\u5B83\u7684\u63CF\u8FF0\u3002"
  ];
}
function delegationRules2(team) {
  const noFit = team.candidates.length ? "\u6CA1\u6709\u8D1F\u8D23\u5B83\u7684\u89D2\u8272\u65F6\uFF0C\u4EA4\u7ED9\u63CF\u8FF0\u4E0E\u4E4B\u76F8\u7B26\u7684\u5019\u9009\u6210\u5458\u3002" : "\u53EA\u6709\u5728\u6CA1\u6709\u5408\u9002\u7684\u89D2\u8272\u65F6\u624D\u4F7F\u7528\u89D2\u8272 `helper`\uFF1B\u5B83\u8FD0\u884C\u5728\u4F60\u81EA\u5DF1\u7684\u667A\u80FD\u4F53\u548C\u6A21\u578B\u4E0A\u3002";
  return [
    `## \u59D4\u6D3E\u6A21\u5F0F\uFF08${MODE_SPECS.delegation.pattern}\uFF09`,
    "\u4F60\u62C6\u5206\u8BF7\u6C42\uFF0C\u6210\u5458\u5404\u81EA\u72EC\u7ACB\u5DE5\u4F5C\u3001\u53EA\u5411\u4F60\u6C47\u62A5\uFF0C\u6700\u540E\u7531\u4F60\u6C47\u603B\u3002",
    `1. \u628A\u8BF7\u6C42\u62C6\u6210\u82E5\u5E72\u90E8\u5206\uFF0C\u6309\u89D2\u8272\u7684\u6587\u4EF6\u5939\u548C\u8BF4\u660E\uFF0C\u628A\u6BCF\u4E00\u90E8\u5206\u4EA4\u7ED9\u8D1F\u8D23\u5B83\u7684\u89D2\u8272\u3002${noFit}`,
    `2. \u5E26\u4E0A\u6240\u6709\u90E8\u5206\uFF0C\u53EA\u8FD0\u884C\u4E00\u6B21 \`${T2.delegate}\`\u3002\u6210\u5458\u53EA\u80FD\u770B\u5230\u81EA\u5DF1\u7684\u4EFB\u52A1\uFF0C\u770B\u4E0D\u5230\u7528\u6237\u7684\u8BF7\u6C42\u548C\u5176\u4ED6\u6210\u5458\uFF0C\u6240\u4EE5\u6BCF\u4E2A\u4EFB\u52A1\u90FD\u8981\u81EA\u6210\u4E00\u4F53\uFF1A\u5199\u6E05\u80CC\u666F\u3001\u6587\u4EF6\u3001\u9A8C\u6536\u6807\u51C6\uFF0C\u4EE5\u53CA\u9700\u8981\u6C47\u62A5\u4EC0\u4E48\u3002`,
    "3. \u6D89\u53CA\u76F8\u540C\u6587\u4EF6\u7684\u90E8\u5206\u4EA4\u7ED9\u540C\u4E00\u4E2A\u89D2\u8272\uFF0C\u6216\u8005\u7B49\u7B2C\u4E00\u4E2A\u5B8C\u6210\u540E\u518D\u59D4\u6D3E\u7B2C\u4E8C\u4E2A\u3002",
    `4. \u8FD0\u884C \`${T2.wait}\` \u6536\u96C6\u7ED3\u679C\uFF1B\u6210\u5458\u8FD8\u5728\u5DE5\u4F5C\u65F6\uFF0C\u518D\u8FD0\u884C\u4E00\u6B21\u3002\u7ED3\u679C\u4E0D\u5B8C\u6574\u6216\u6709\u9519\u65F6\uFF0C\u7528 \`${T2.send}\` \u8FFD\u95EE\uFF0C\u7136\u540E\u518D\u6B21\u7B49\u5F85\u3002`,
    "5. \u6C47\u62A5\u6BCF\u4E2A\u89D2\u8272\u505A\u4E86\u4EC0\u4E48\u3001\u68C0\u67E5\u4E86\u4EC0\u4E48\u3001\u8FD8\u5269\u4EC0\u4E48\u3002\u4F60\u6536\u96C6\u5B8C\u7ED3\u679C\u540E\u7684\u56DE\u590D\u4F1A\u8BB0\u5F55\u4E3A\u8FD9\u4E00\u6279\u7684\u603B\u7ED3\u3002"
  ];
}
function teamRules2() {
  return [
    `## \u56E2\u961F\u6A21\u5F0F\uFF08${MODE_SPECS.team.pattern}\uFF09`,
    "\u4F60\u662F\u56E2\u961F\u7684\u9700\u6C42\u5BF9\u63A5\u4EBA\u548C\u8D1F\u8D23\u4EBA\u3002\u4F60\u548C\u7528\u6237\u4E00\u8D77\u7406\u6E05\u9700\u6C42\uFF0C\u628A\u5DE5\u4F5C\u89C4\u5212\u6210\u5171\u4EAB\u4EFB\u52A1\u677F\u4E0A\u7684\u4EFB\u52A1\uFF0C\u5BA1\u6279\u5E76\u68C0\u67E5\u6210\u5458\u7684\u5DE5\u4F5C\uFF0C\u6700\u540E\u6574\u5408\u7ED3\u679C\u3002\u7EDD\u4E0D\u628A\u7528\u6237\u7684\u6D88\u606F\u539F\u6837\u8F6C\u7ED9\u6210\u5458\u3002",
    "1. \u9700\u6C42\u5BF9\u63A5\uFF1A\u7528\u4F60\u81EA\u5DF1\u7684\u8BDD\u590D\u8FF0\u8BF7\u6C42\uFF0C\u5E76\u8BE2\u95EE\u4F60\u9700\u8981\u77E5\u9053\u7684\u5185\u5BB9\uFF1A\u8303\u56F4\u3001\u9A8C\u6536\u6807\u51C6\u3001\u7EA6\u675F\u3001\u4F18\u5148\u7EA7\u3001\u54EA\u4E9B\u89D2\u8272\u5E94\u53C2\u4E0E\u3002\u6BCF\u6B21\u6700\u591A\u95EE\u4E94\u4E2A\u95EE\u9898\u3002\u9700\u6C42\u5BF9\u63A5\u671F\u95F4\uFF0C\u4E0D\u8981\u542F\u52A8\u6210\u5458\uFF0C\u4E5F\u4E0D\u8981\u4FEE\u6539\u6587\u4EF6\uFF1B\u53EF\u4EE5\u9605\u8BFB\u4EE3\u7801\u5E93\u3002",
    `2. \u9700\u6C42\u7B80\u62A5\u548C\u8BA1\u5212\uFF1A\u5199\u51FA\u9700\u6C42\u7B80\u62A5\uFF08\u6807\u9898\u3001\u76EE\u6807\u3001\u9700\u6C42\u3001\u9A8C\u6536\u6807\u51C6\u3001\u7EA6\u675F\u3001\u4E0D\u5728\u8303\u56F4\u5185\u7684\u5185\u5BB9\uFF09\uFF0C\u5E76\u628A\u5DE5\u4F5C\u62C6\u6210\u4EFB\u52A1\uFF1A\u6807\u9898\u3001\u8BF4\u660E\uFF08\u5199\u6E05\u600E\u6837\u7B97\u5B8C\u6210\uFF09\u3001\u5E94\u7531\u54EA\u4E2A\u89D2\u8272\u6765\u505A\uFF08\u6216\u4E0D\u6307\u5B9A\uFF0C\u4EFB\u4F55\u4EBA\u90FD\u53EF\u4EE5\u505A\uFF09\u3001\u5B83\u8981\u7B49\u5F85\u7684\u524D\u7F6E\u4EFB\u52A1\uFF0C\u4EE5\u53CA\u5B83\u4F1A\u4FEE\u6539\u7684\u6587\u4EF6\u3002\u7528\u6237\u5E0C\u671B\u5BA1\u6279\u6210\u5458\u7684\u505A\u6CD5\u65F6\uFF0C\u8BBE\u7F6E planApproval\uFF08\u8BA1\u5212\u5BA1\u6279\uFF09\u3002\u7528 \`${T2.brief}\` \u8BB0\u5F55\u8FD9\u4E00\u5207\uFF0C\u628A\u9700\u6C42\u7B80\u62A5\u548C\u4EFB\u52A1\u5C55\u793A\u7ED9\u7528\u6237\uFF0C\u8BF7\u7528\u6237\u786E\u8BA4\u6216\u4FEE\u6B63\uFF0C\u7136\u540E\u7ED3\u675F\u4F60\u7684\u56DE\u5408\u3002`,
    `3. \u53EA\u6709\u5728\u7528\u6237\u56DE\u590D\u786E\u8BA4\u4E4B\u540E\uFF0C\u624D\u8FD0\u884C \`${T2.kickoff}\`\uFF0C\u5E76\u628A \`userConfirmation\` \u8BBE\u4E3A\u7528\u6237\u786E\u8BA4\u7684\u539F\u8BDD\uFF0C\u9010\u5B57\u5F15\u7528\u3002\u63D2\u4EF6\u4F1A\u68C0\u67E5\u8FD9\u53E5\u8BDD\u662F\u7528\u6237\u5728\u9700\u6C42\u7B80\u62A5\u8BB0\u5F55\u4E4B\u540E\u53D1\u51FA\u7684\uFF08\u7528\u6237\u4E5F\u53EF\u4EE5\u5728\u300C\u667A\u80FD\u4F53\u56E2\u961F\u300D\u9762\u677F\u4E2D\u70B9\u300C\u786E\u8BA4\u300D\uFF09\u3002\u7528\u6237\u63D0\u51FA\u4FEE\u6B63\u540E\uFF0C\u7528 \`${T2.brief}\` \u91CD\u65B0\u8BB0\u5F55\u3002`,
    "4. \u8FD0\u884C\u8FC7\u7A0B\uFF1A\u63D2\u4EF6\u4F1A\u53D1\u5E03\u9700\u6C42\u7B80\u62A5\uFF0C\u628A\u4EFB\u52A1\u653E\u4E0A\u4EFB\u52A1\u677F\uFF0C\u5E76\u4E3A\u6BCF\u4E2A\u89D2\u8272\u542F\u52A8\u4E00\u4E2A\u6210\u5458\u3002\u6210\u5458\u8BA4\u9886\u5C31\u7EEA\u7684\u4EFB\u52A1\uFF0C\u5B8C\u6210\u540E\u6807\u8BB0\u4E3A\u5B8C\u6210\u5E76\u5199\u660E\u6539\u4E86\u4EC0\u4E48\uFF0C\u7136\u540E\u63A5\u4E0B\u4E00\u4E2A\u3002\u63D2\u4EF6\u4F1A\u628A\u672A\u9886\u53D6\u7684\u4EFB\u52A1\u4EA4\u7ED9\u7A7A\u95F2\u7684\u6210\u5458\uFF0C\u5E76\u4E3A\u6709\u5DE5\u4F5C\u7684\u89D2\u8272\u542F\u52A8\u6210\u5458\u3002\u6210\u5458\u4E4B\u95F4\u4EE5\u53CA\u6210\u5458\u548C\u4F60\u4E4B\u95F4\u901A\u8FC7\u9ED1\u677F\u53D1\u6D88\u606F\u3002\u5DE5\u4F5C\u5B8C\u6210\u540E\uFF0C\u63D2\u4EF6\u4F1A\u8FDB\u884C\u4E00\u8F6E\u8BC4\u5BA1\uFF1A\u6210\u5458\u4E92\u76F8\u68C0\u67E5\u5BF9\u65B9\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\uFF0C\u628A\u4E0D\u7B26\u5408\u9700\u6C42\u7B80\u62A5\u7684\u6253\u56DE\u3002",
    `5. \u4E3B\u6301\u8FD0\u884C\uFF1A\u8FD0\u884C \`${T2.wait}\`\uFF08\u6210\u5458\u8FD8\u5728\u5DE5\u4F5C\u65F6\u518D\u8FD0\u884C\u4E00\u6B21\uFF09\u3002\u6279\u51C6\u8BA1\u5212\uFF0C\u6216\u9644\u4E0A\u53CD\u9988\u6253\u56DE\uFF08\`${T2.tasks}\`\uFF09\uFF1B\u56DE\u7B54\u95EE\u9898\uFF08\`${T2.broadcast}\` \u53D1\u7ED9\u591A\u4E2A\u6210\u5458\uFF0C\`${T2.send}\` \u53D1\u7ED9\u4E00\u4E2A\u6210\u5458\uFF09\uFF1B\u65B0\u589E\u3001\u91CD\u65B0\u5206\u914D\u3001\u9644\u4E0A\u53CD\u9988\u91CD\u5F00\u6216\u53D6\u6D88\u4EFB\u52A1\uFF08\`${T2.tasks}\`\uFF09\u3002`,
    `6. \u6574\u5408\uFF1A\u8FD0\u884C\u7ED3\u675F\u540E\uFF0C\u9605\u8BFB\u9ED1\u677F\uFF08\`${T2.board}\`\uFF09\uFF0C\u5BF9\u7167\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\u9010\u6761\u68C0\u67E5\u6BCF\u4E2A\u9A8C\u6536\u6807\u51C6\uFF0C\u628A\u672A\u8FBE\u6807\u7684\u4EFB\u52A1\u6253\u56DE\uFF0C\u7136\u540E\u518D\u6B21\u7B49\u5F85\u3002\u4E4B\u540E\u5411\u7528\u6237\u6C47\u62A5\u5B8C\u6210\u4E86\u4EC0\u4E48\u3001\u5982\u4F55\u68C0\u67E5\u7684\u3001\u8FD8\u5269\u4EC0\u4E48\u3002`,
    `7. \u7528\u6237\u63A5\u53D7\u7ED3\u679C\u540E\uFF0C\u8FD0\u884C \`${T2.close}\`\u3002\u4FEE\u6539\u4E86\u9700\u6C42\u7684\u540E\u7EED\u8BF7\u6C42\u8981\u91CD\u65B0\u8D70\u9700\u6C42\u5BF9\u63A5\u3002`
  ];
}
function orchestratorPrompt2(team, source) {
  const notes = team.roles.filter((role) => role.instructions.trim()).map((role) => `- ${role.name}: ${role.instructions.trim()}`);
  return [
    "\u4F60\u662F Orca \u4E2D\u4E00\u4E2A\u667A\u80FD\u4F53\u56E2\u961F\u7684\u534F\u8C03\u8005\uFF08lead\uFF09\u3002\u7528\u6237\u548C\u4F60\u5BF9\u8BDD\uFF1B\u56E2\u961F\u6210\u5458\u4E3A\u4F60\u5DE5\u4F5C\uFF0C\u6BCF\u4E2A\u6210\u5458\u662F\u4F60\u5DE5\u4F5C\u533A\u91CC\u72EC\u7ACB\u8FD0\u884C\u7684\u667A\u80FD\u4F53\uFF1A\u6309\u56E2\u961F\u8BBE\u7F6E\u4EE5\u804A\u5929\uFF08Orca \u7684\u56FE\u5F62\u754C\u9762\uFF09\u6216\u7EC8\u7AEF\u65B9\u5F0F\u8FD0\u884C\u3002",
    LANGUAGE_RULE,
    team.goal.trim() ? `\u56E2\u961F\u76EE\u6807\uFF1A${team.goal.trim()}` : "",
    `\u56E2\u961F\u6765\u81EA ${source}\u3002`,
    "",
    ...commandUsage2(),
    "",
    "## \u56E2\u961F",
    ...teamTable2(team),
    "\u63D2\u4EF6\u4F1A\u5728\u4F60\u7684\u5DE5\u4F5C\u533A\u4E2D\u66FF\u4F60\u542F\u52A8\u6210\u5458\uFF0C\u4F7F\u7528\u5176\u89D2\u8272\u7684\u667A\u80FD\u4F53\u548C\u6A21\u578B\u3002",
    ...notes.length ? ["", "## \u89D2\u8272\u8BF4\u660E", ...notes] : [],
    ...team.candidates.length ? ["", "## \u5019\u9009\u6210\u5458\uFF08\u6A21\u578B\u6C60\uFF09", ...candidateList2(team), "", ...formingRules2()] : [],
    "",
    "## \u534F\u4F5C\u6A21\u5F0F",
    `\u914D\u7F6E\u7684\u6A21\u5F0F\uFF1A${MODE_LINE2[team.mode]}`,
    "",
    ...modeRules2(),
    "",
    ...delegationRules2(team),
    "",
    ...teamRules2(),
    "",
    "## \u89C4\u5219",
    `- \u53EA\u80FD\u7528 \`${TEAM_BIN}\` \u542F\u52A8\u6210\u5458\u548C\u7ED9\u6210\u5458\u53D1\u6D88\u606F\u3002\u7EDD\u4E0D\u81EA\u5DF1\u7528 \`orca agent launch\`\u3001\`orca orchestration\`\u3001\u5B50\u667A\u80FD\u4F53\u6216\u5176\u4ED6\u5DE5\u5177\u542F\u52A8\u6210\u5458\uFF1A\`${TEAM_BIN}\` \u4F1A\u4E3A\u6BCF\u4E2A\u89D2\u8272\u8BBE\u7F6E\u5B83\u81EA\u5DF1\u7684\u667A\u80FD\u4F53\u3001\u6A21\u578B\uFF0C\u4EE5\u53CA\u5728\u56E2\u961F\u4EEA\u8868\u76D8\u4E0A\u7684\u4F4D\u7F6E\u3002`,
    `- \u5982\u679C\u627E\u4E0D\u5230 \`${TEAM_BIN}\`\uFF0C\u6216\u8005\u5B83\u8BF4\u63D2\u4EF6\u6CA1\u6709\u8FD0\u884C\uFF0C\u5C31\u544A\u8BC9\u7528\u6237\u667A\u80FD\u4F53\u56E2\u961F\u63D2\u4EF6\u4E0D\u53EF\u7528\uFF0C\u7136\u540E\u505C\u6B62\u3002\u4E0D\u8981\u8BBE\u6CD5\u7ED5\u8FC7\u3002`,
    "- \u8BA9\u6210\u5458\u5F85\u5728\u5404\u81EA\u7684\u6587\u4EF6\u5939\u5185\u3002\u5F53\u67D0\u4E2A\u6210\u5458\u53D7\u963B\uFF08\u6743\u9650\u8BF7\u6C42\u6216\u9519\u8BEF\uFF09\u65F6\uFF0C\u544A\u8BC9\u7528\u6237\u662F\u54EA\u4E2A\u89D2\u8272\u4EE5\u53CA\u539F\u56E0\u3002"
  ].filter((line, index, lines) => line !== "" || lines[index - 1] !== "").join("\n");
}
function leadStartPrompt2(team, source, request) {
  const head = `${PLUGIN_MESSAGE_PREFIX} \u4F60\u662F\u667A\u80FD\u4F53\u56E2\u961F\u300C${team.name || source}\u300D\u7684\u534F\u8C03\u5668\u3002\u73B0\u5728\u8FD0\u884C \`${T2.status}\`\uFF1A\u5B83\u4F1A\u8F93\u51FA\u4F60\u7684\u5E38\u9A7B\u6307\u4EE4\u3001\u56E2\u961F\u548C\u534F\u4F5C\u6A21\u5F0F\u3002\u6574\u4E2A\u4F1A\u8BDD\u90FD\u6309\u5B83\u4EEC\u6267\u884C\uFF1B\u53EA\u901A\u8FC7 \`${TEAM_BIN}\` \u542F\u52A8\u6210\u5458\u548C\u7ED9\u6210\u5458\u53D1\u6D88\u606F\u3002\u8BF7\u7528\u7B80\u4F53\u4E2D\u6587\u56DE\u590D\u3002`;
  return request.trim() ? `${head}

\u7528\u6237\u7684\u8BF7\u6C42\uFF1A
${request.trim()}` : `${head}

\u7136\u540E\u7B80\u8981\u603B\u7ED3\u56E2\u961F\uFF08\u89D2\u8272\u548C\u5019\u9009\u6210\u5458\uFF0C\u4EE5\u53CA\u5404\u81EA\u7684\u667A\u80FD\u4F53/\u6A21\u578B\uFF09\u548C\u534F\u4F5C\u6A21\u5F0F\uFF0C\u5E76\u8BF4\u660E\u4F60\u5DF2\u51C6\u5907\u597D\u63A5\u6536\u8BF7\u6C42\u3002\u6682\u65F6\u4E0D\u8981\u542F\u52A8\u6210\u5458\u3002`;
}
function teamChangedMessage2(team, source) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} \u56E2\u961F\uFF08${source}\uFF09\u5DF2\u66F4\u6539\u3002\u8FD0\u884C \`${T2.status}\` \u91CD\u65B0\u8BFB\u53D6\uFF0C\u5E76\u4ECE\u73B0\u5728\u8D77\u6309\u65B0\u7684\u56E2\u961F\u6267\u884C\u3002`,
    `\u914D\u7F6E\u7684\u534F\u4F5C\u6A21\u5F0F\uFF1A${MODE_LINE2[team.mode]}`
  ].join("\n");
}
function memberSystemPrompt2(team, role) {
  return [
    `\u4F60\u662F Orca \u4E2D\u4E00\u4E2A\u667A\u80FD\u4F53\u56E2\u961F\u7684\u6210\u5458\u300C${role.name}\u300D\u3002\u4F60\u7684\u5DE5\u4F5C\u6765\u81EA\u56E2\u961F\u7684\u534F\u8C03\u5668\uFF0C\u800C\u4E0D\u662F\u76F4\u63A5\u6765\u81EA\u7528\u6237\u3002`,
    LANGUAGE_RULE,
    team.goal.trim() ? `\u56E2\u961F\u76EE\u6807\uFF1A${team.goal.trim()}` : "",
    role.folders.length ? `\u4F60\u7684\u6587\u4EF6\u5939\uFF1A${role.folders.join(", ")}\u3002\u9664\u975E\u4EFB\u52A1\u53E6\u6709\u8BF4\u660E\uFF0C\u4E0D\u8981\u8D85\u51FA\u8FD9\u4E9B\u6587\u4EF6\u5939\u3002` : "\u4F60\u6CA1\u6709\u6587\u4EF6\u5939\u9650\u5236\uFF0C\u4F46\u53EA\u505A\u4EFB\u52A1\u8981\u6C42\u7684\u4E8B\u3002",
    role.instructions.trim() ? `\u89D2\u8272\u8BF4\u660E\uFF1A${role.instructions.trim()}` : "",
    `\u4F60\u53EA\u80FD\u901A\u8FC7 PATH \u4E2D\u7684 \`${TEAM_BIN}\` \u547D\u4EE4\u8054\u7CFB\u56E2\u961F\uFF08\`${TEAM_BIN} <command> '<json>'\`\uFF0C\u6216\u901A\u8FC7 stdin \u4F20\u5165 JSON\uFF1B\`${TEAM_BIN} help\` \u5217\u51FA\u6240\u6709\u547D\u4EE4\uFF09\u3002\u53D1\u7ED9\u4F60\u7684\u6D88\u606F\u4F1A\u9644\u5728\u4F60\u8FD0\u884C\u7684\u4EFB\u4F55 ${TEAM_BIN} \u547D\u4EE4\u7684\u8F93\u51FA\u91CC\u3002`,
    `\u534F\u8C03\u5668\u7684\u6BCF\u6761\u6D88\u606F\u90FD\u4F1A\u8BF4\u660E\u8FD9\u662F\u54EA\u79CD\u8FD0\u884C\uFF1A\u59D4\u6D3E\u4EFB\u52A1\uFF0C\u7531\u4F60\u72EC\u81EA\u5B8C\u6210\uFF0C\u6700\u540E\u7528 \`${M2.report}\` \u6C47\u62A5\uFF1B\u6216\u8005\u56E2\u961F\u8FD0\u884C\uFF0C\u6709\u5171\u4EAB\u7684\u4EFB\u52A1\u677F\u548C\u9ED1\u677F\uFF0C\u4F60\u901A\u8FC7 \`${M2.read}\`\u3001\`${M2.task}\`\u3001\`${M2.post}\` \u548C \`${M2.claim}\` \u4F7F\u7528\u5B83\u4EEC\u3002`
  ].filter(Boolean).join("\n");
}
function roleHeader2(role) {
  return [
    `\u4F60\u5728\u672C\u4F1A\u8BDD\u4E2D\u7684\u89D2\u8272\uFF1A${role.name}\u3002`,
    role.instructions.trim() ? `\u89D2\u8272\u8BF4\u660E\uFF1A${sentence(role.instructions)}` : "",
    role.folders.length ? `\u4F60\u7684\u6587\u4EF6\u5939\uFF1A${role.folders.join(", ")}\u3002` : ""
  ].filter(Boolean).join("");
}
function delegationTaskPrompt2(run, task) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} \u6765\u81EA\u534F\u8C03\u5668\u7684\u59D4\u6D3E\u4EFB\u52A1\uFF08\u8FD0\u884C ${run.id}\uFF09\u3002`,
    "\u4F60\u72EC\u81EA\u5B8C\u6210\u8FD9\u9879\u4EFB\u52A1\u3002\u4F60\u770B\u4E0D\u5230\u5176\u4ED6\u6210\u5458\u7684\u4EFB\u52A1\uFF0C\u4ED6\u4EEC\u4E5F\u770B\u4E0D\u5230\u4F60\u7684\uFF1B\u53EA\u6709\u534F\u8C03\u5668\u4F1A\u8BFB\u4F60\u7684\u7ED3\u679C\u3002",
    "",
    "## \u4EFB\u52A1",
    task.trim(),
    "",
    "## \u5B8C\u6210\u65F6",
    `\u7528 \`${M2.report}\` \u6C47\u62A5\uFF08JSON \u5B57\u6BB5 \`result\`\uFF1A\u4F60\u6539\u4E86\u4EC0\u4E48\uFF08\u6587\u4EF6\uFF09\u3001\u5982\u4F55\u68C0\u67E5\u7684\u3001\u8FD8\u6709\u4EC0\u4E48\u9057\u7559\u6216\u53D7\u963B\uFF0C\u4E0D\u8D85\u8FC7 500 \u5B57\uFF09\uFF0C\u7136\u540E\u7ED3\u675F\u4F60\u7684\u56DE\u5408\u3002\u5982\u679C\u65E0\u6CD5\u8FD0\u884C\u5B83\uFF0C\u5C31\u628A\u8FD9\u4EFD\u6C47\u62A5\u4F5C\u4E3A\u4F60\u7684\u6700\u7EC8\u56DE\u590D\u3002\u8BF7\u7528\u7B80\u4F53\u4E2D\u6587\u56DE\u590D\u548C\u6C47\u62A5\u3002`
  ].join("\n");
}
function rosterLines2(roster) {
  return roster.map((role) => `- ${role.name}\uFF1A${role.folders.length ? `\u6587\u4EF6\u5939 ${role.folders.join(", ")}` : "\u6587\u4EF6\u5939\u4E0D\u9650"}${role.instructions.trim() ? ` \xB7 ${role.instructions.trim()}` : ""}`);
}
var sameRole3 = (a, b) => (a ?? "").toLowerCase() === b.toLowerCase();
function taskBrief2(task) {
  return [`${task.id}\uFF1A${task.title}`, task.detail, task.files.length ? `\u6587\u4EF6\uFF1A${task.files.join(", ")}` : "", task.feedback ? `\u4E4B\u524D\u88AB\u6253\u56DE\u7684\u539F\u56E0\uFF1A${task.feedback}` : ""].filter(Boolean).join("\n");
}
function boardProtocol2(run) {
  return [
    `- \u5148\u8FD0\u884C \`${M2.read}\`\uFF1A\u5B83\u4F1A\u663E\u793A\u9700\u6C42\u7B80\u62A5\u3001\u4EFB\u52A1\u677F\u548C\u5E16\u5B50\u3002`,
    `- \u5F00\u59CB\u4E00\u9879\u4EFB\u52A1\u4E4B\u524D\uFF0C\u5148\u7528 \`${M2.task} '{"action":"claim"}'\` \u8BA4\u9886\u5B83\uFF08\u8981\u8BA4\u9886\u6307\u5B9A\u7684\u4EFB\u52A1\u5C31\u52A0\u4E0A "id"\uFF09\u3002\u7B49\u5F85\u5176\u4ED6\u4EFB\u52A1\u7684\u4EFB\u52A1\uFF0C\u8981\u7B49\u90A3\u4E9B\u4EFB\u52A1\u5B8C\u6210\u540E\u624D\u80FD\u8BA4\u9886\u3002\u8BA4\u9886\u4EFB\u52A1\u65F6\u4E5F\u4F1A\u4E00\u5E76\u8BA4\u9886\u5B83\u7684\u6587\u4EF6\u3002`,
    ...run.planApproval ? [`- \u8FD9\u6B21\u8FD0\u884C\u9700\u8981\u8BA1\u5212\u5BA1\u6279\uFF1A\u8BA4\u9886\u4EFB\u52A1\u540E\uFF0C\u63D0\u4EA4\u4F60\u7684\u8BA1\u5212\uFF08action "plan"\u3001id\u3001text\uFF1A\u4F60\u8981\u6539\u4EC0\u4E48\u3001\u5982\u4F55\u68C0\u67E5\uFF09\uFF0C\u7136\u540E\u7ED3\u675F\u4F60\u7684\u56DE\u5408\u3002\u534F\u8C03\u5668\u6279\u51C6\u6216\u6253\u56DE\u8BA1\u5212\u65F6\u4F60\u4F1A\u88AB\u5524\u9192\uFF1B\u8BA1\u5212\u83B7\u6279\u540E\u624D\u5F00\u59CB\u505A\u3002`] : [],
    `- \u4EFB\u52A1\u5B8C\u6210\u540E\uFF0C\u628A\u5B83\u6807\u8BB0\u4E3A\u5B8C\u6210\uFF08action "done"\u3001id\u3001result\uFF1A\u4F60\u6539\u4E86\u4EC0\u4E48\u3001\u5982\u4F55\u68C0\u67E5\u7684\uFF09\u3002\u7136\u540E\u63A5\u4E0B\u4E00\u4E2A\u5C31\u7EEA\u4EFB\u52A1\uFF1A\u5148\u63A5\u7ED9\u4F60\u89D2\u8272\u7684\u4EFB\u52A1\uFF0C\u518D\u63A5\u4EFB\u4F55\u4EBA\u90FD\u53EF\u4EE5\u505A\u7684\u4EFB\u52A1\u3002`,
    `- \u53D1\u73B0\u5E94\u8BE5\u7531\u522B\u4EBA\u505A\u7684\u5DE5\u4F5C\uFF1A\u6DFB\u52A0\u4E00\u4E2A\u4EFB\u52A1\uFF08action "add"\uFF0C\u5E76\u586B\u5199\u5B83\u7684 role\uFF09\u3002\u65E0\u6CD5\u5B8C\u6210\u7684\u4EFB\u52A1\uFF1A\u628A\u5B83\u653E\u56DE\u53BB\uFF08action "release"\uFF09\uFF0C\u5E76\u5728\u9ED1\u677F\u4E0A\u8BF4\u660E\u539F\u56E0\u3002`,
    `- \u7F16\u8F91\u4F60\u4EFB\u52A1\u6587\u4EF6\u4EE5\u5916\u7684\u6587\u4EF6\u4E4B\u524D\uFF0C\u5148\u7528 \`${M2.claim}\` \u8BA4\u9886\u5B83\u4EEC\u3002\u5176\u4ED6\u6210\u5458\u6301\u6709\u7684\u8DEF\u5F84\u4F1A\u88AB\u62D2\u7EDD\uFF1A\u5728\u9ED1\u677F\u4E0A\u8BE2\u95EE\u5BF9\u65B9\u3002`,
    `- \u6D88\u606F\uFF1A\u7528 \`${M2.post}\` \u53D1\u5E16\uFF0C\u5E76\u628A \`to\` \u8BBE\u4E3A\u89D2\u8272\u540D\u3001\u6210\u5458\u6807\u9898\uFF08\u5982 api 2\uFF09\u3001"lead" \u6216 "${TO_ALL}"\u3002\u53D1\u7ED9\u4F60\u7684\u6D88\u606F\u4F1A\u9644\u5728\u4F60\u8FD0\u884C\u7684\u4EFB\u4F55 ${TEAM_BIN} \u547D\u4EE4\u7684\u8F93\u51FA\u91CC\uFF1B\u4F60\u7A7A\u95F2\u65F6\uFF0C\u5B83\u4EEC\u4E5F\u4F1A\u5524\u9192\u4F60\u3002\u56DE\u7B54\u53D1\u7ED9\u4F60\u7684\u95EE\u9898\u3002`,
    `- \u6CA1\u6709\u5269\u4E0B\u7ED9\u4F60\u7684\u5C31\u7EEA\u4EFB\u52A1\u65F6\uFF0C\u53D1\u4E00\u6761 "done" \u5E16\u5B50\u5E76\u9644\u4E0A\u7B80\u77ED\u603B\u7ED3\uFF0C\u7136\u540E\u7ED3\u675F\u4F60\u7684\u56DE\u5408\u3002\u6709\u4EFB\u52A1\u5F00\u653E\u7ED9\u4F60\u65F6\uFF0C\u63D2\u4EF6\u4F1A\u5524\u9192\u4F60\u3002`
  ];
}
function teamKickoffPrompt2(run, brief, roster, role, header = "") {
  const mine = run.tasks.filter((task) => taskReady(run, task) && (task.role === null || sameRole3(task.role, role.name)));
  return [
    `${PLUGIN_MESSAGE_PREFIX} \u56E2\u961F\u8FD0\u884C ${run.id} \u5DF2\u5F00\u59CB\uFF08\u7B2C ${run.round}/${run.rounds} \u8F6E\uFF09\u3002\u7528\u6237\u548C\u534F\u8C03\u5668\u5DF2\u5546\u5B9A\u8FD9\u4EFD\u9700\u6C42\u7B80\u62A5\uFF1A`,
    "",
    briefText(brief, "zh"),
    "",
    "## \u672C\u6B21\u8FD0\u884C\u7684\u6210\u5458",
    ...rosterLines2(roster),
    `\u4F60\u662F\u300C${role.name}\u300D\u3002${header}`,
    "",
    "## \u4EFB\u52A1\u677F",
    taskBoardText(run, "zh"),
    mine.length ? `\u73B0\u5728\u53EF\u4EE5\u7531\u4F60\u505A\u7684\u5C31\u7EEA\u4EFB\u52A1\uFF1A${mine.map((task) => task.id).join(", ")}\u3002` : "\u76EE\u524D\u8FD8\u6CA1\u6709\u7ED9\u4F60\u7684\u5C31\u7EEA\u4EFB\u52A1\uFF1B\u9605\u8BFB\u9ED1\u677F\uFF0C\u5728\u522B\u4EBA\u9700\u8981\u65F6\u63D0\u4F9B\u5E2E\u52A9\uFF0C\u6709\u4EFB\u52A1\u5F00\u653E\u7ED9\u4F60\u65F6\u4F60\u4F1A\u88AB\u5524\u9192\u3002",
    "",
    "## \u56E2\u961F\u5982\u4F55\u534F\u4F5C",
    ...boardProtocol2(run),
    "- \u7528\u7B80\u4F53\u4E2D\u6587\u56DE\u590D\uFF0C\u5E16\u5B50\u3001\u8BA1\u5212\u548C\u4EFB\u52A1\u7ED3\u679C\u4E5F\u7528\u7B80\u4F53\u4E2D\u6587\u5199\uFF1B\u4EE3\u7801\u3001\u6587\u4EF6\u540D\u548C\u547D\u4EE4\u53C2\u6570\u4FDD\u6301\u539F\u6837\u3002"
  ].join("\n");
}
function assignmentPrompt2(run, task, header = "") {
  return [
    `${PLUGIN_MESSAGE_PREFIX} \u56E2\u961F\u8FD0\u884C ${run.id} \u4E2D\u7684\u4EFB\u52A1 ${task.id} \u73B0\u5728\u5F52\u4F60\u4E86\uFF08\u5DF2\u66FF\u4F60\u8BA4\u9886\uFF09\u3002${header}`,
    "",
    taskBrief2(task),
    "",
    run.planApproval ? `\u4E3A\u5B83\u63D0\u4EA4\u4F60\u7684\u8BA1\u5212\uFF08\`${M2.task}\`\uFF0Caction "plan"\uFF09\uFF0C\u7136\u540E\u7ED3\u675F\u4F60\u7684\u56DE\u5408\uFF1B\u534F\u8C03\u5668\u6279\u51C6\u540E\u518D\u52A8\u624B\u3002` : `\u5B8C\u6210\u5B83\uFF0C\u7136\u540E\u6807\u8BB0\u4E3A\u5B8C\u6210\uFF08\`${M2.task}\`\uFF0Caction "done"\uFF0C\u5199\u660E\u4F60\u6539\u4E86\u4EC0\u4E48\u3001\u5982\u4F55\u68C0\u67E5\u7684\uFF09\u3002\u7136\u540E\u63A5\u4E0B\u4E00\u4E2A\u5C31\u7EEA\u4EFB\u52A1\uFF1B\u5982\u679C\u6CA1\u6709\u4E86\uFF0C\u5C31\u53D1\u4E00\u6761 "done" \u5E16\u5B50\u5E76\u7ED3\u675F\u4F60\u7684\u56DE\u5408\u3002`,
    `\u5982\u679C\u9700\u8981\u9700\u6C42\u7B80\u62A5\u6216\u60F3\u4E86\u89E3\u522B\u4EBA\u505A\u4E86\u4EC0\u4E48\uFF0C\u5148\u9605\u8BFB\u9ED1\u677F\uFF08\`${M2.read}\`\uFF09\u3002`
  ].join("\n");
}
function verdictLine2(task) {
  return task.plan?.status === "approved" ? `\u534F\u8C03\u5668\u6279\u51C6\u4E86\u4F60\u5BF9 ${task.id}\u300C${task.title}\u300D\u7684\u8BA1\u5212${task.plan.feedback ? `\uFF1A${sentence(task.plan.feedback)}` : "\u3002"}\u73B0\u5728\u5C31\u505A\u8FD9\u4E2A\u4EFB\u52A1\uFF0C\u5B8C\u6210\u540E\u6807\u8BB0\u4E3A\u5B8C\u6210\uFF08\`${M2.task}\`\uFF0Caction "done"\uFF09\u3002` : `\u534F\u8C03\u5668\u6253\u56DE\u4E86\u4F60\u5BF9 ${task.id}\u300C${task.title}\u300D\u7684\u8BA1\u5212\uFF1A${sentence(task.plan?.feedback ?? "")}\u4FEE\u6539\u540E\u91CD\u65B0\u63D0\u4EA4\uFF08\`${M2.task}\`\uFF0Caction "plan"\uFF09\u3002`;
}
function planReviewedPrompt2(run, tasks) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} \u56E2\u961F\u8FD0\u884C ${run.id}\uFF1A\u534F\u8C03\u5668\u5DF2\u5BA1\u6279\u4F60\u7684\u8BA1\u5212\u3002`,
    ...tasks.map((task) => `- ${verdictLine2(task)}`),
    "",
    `\u505A\u5B8C\u8FD9\u4E9B\u540E\uFF0C\u63A5\u4E0B\u4E00\u4E2A\u5C31\u7EEA\u4EFB\u52A1\uFF1B\u5982\u679C\u6CA1\u6709\u4E86\uFF0C\u5C31\u53D1\u4E00\u6761 "done" \u5E16\u5B50\u5E76\u7ED3\u675F\u4F60\u7684\u56DE\u5408\u3002`
  ].join("\n");
}
function teamRoundPrompt2(run, since) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} \u56E2\u961F\u8FD0\u884C ${run.id}\uFF0C\u7B2C ${run.round}/${run.rounds} \u8F6E\uFF1A\u8BC4\u5BA1\u3002`,
    `\u9605\u8BFB\u9ED1\u677F\uFF08\`${M2.read} '{"since":${since}}'\`\uFF09\u548C\u4EFB\u52A1\u677F\u3002\u5BF9\u7167\u9700\u6C42\u7B80\u62A5\u548C\u6BCF\u4E2A\u4EFB\u52A1\u7684\u8BF4\u660E\uFF0C\u68C0\u67E5\u5176\u4ED6\u6210\u5458\u5DF2\u5B8C\u6210\u7684\u3001\u6D89\u53CA\u4F60\u8D1F\u8D23\u8303\u56F4\u7684\u4EFB\u52A1\uFF1A\u63A5\u53E3\u3001\u547D\u540D\u3001\u6570\u636E\u683C\u5F0F\uFF0C\u4EE5\u53CA\u4F60\u4EEC\u5171\u540C\u4F9D\u8D56\u7684\u6587\u4EF6\u3002`,
    `\u5BF9\u4E0D\u7B26\u5408\u8981\u6C42\u7684\u4EFB\u52A1\uFF0C\u7528 \`${M2.task}\` \u6253\u56DE\uFF08action "reject"\u3001id\u3001reason\uFF09\uFF1A\u5B83\u4F1A\u5E26\u7740\u4F60\u7684\u7406\u7531\u56DE\u5230\u5BF9\u5E94\u7684\u89D2\u8272\u3002\u56DE\u590D\u53D1\u7ED9\u4F60\u7684\u6D88\u606F\uFF1B\u5982\u679C\u4F60\u81EA\u5DF1\u7684\u4EFB\u52A1\u88AB\u6253\u56DE\uFF0C\u5C31\u4FEE\u590D\u5B83\u4EEC\u3002`,
    `\u7136\u540E\u53D1\u4E00\u6761 "done" \u5E16\u5B50\uFF0C\u8BF4\u660E\u4F60\u68C0\u67E5\u4E86\u4EC0\u4E48\u3001\u6253\u56DE\u4E86\u4EC0\u4E48\uFF0C\u6216\u8005\u5199\u300C\u6CA1\u6709\u53D1\u73B0\u95EE\u9898\u300D\uFF0C\u7136\u540E\u7ED3\u675F\u4F60\u7684\u56DE\u5408\u3002`
  ].join("\n");
}
function mentionPrompt2(run, posts) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} \u56E2\u961F\u8FD0\u884C ${run.id}\uFF1A`,
    inboxText(posts, "zh"),
    "",
    `\u5904\u7406\u4E0E\u4F60\u8D1F\u8D23\u90E8\u5206\u76F8\u5173\u7684\u5185\u5BB9\u3002\u7528 \`${M2.post}\` \u56DE\u7B54\u95EE\u9898\uFF08kind "answer"\uFF0Cto \u8BBE\u4E3A\u63D0\u95EE\u8005\uFF09\u3002\u5982\u679C\u6709\u7ED9\u4F60\u7684\u5C31\u7EEA\u4EFB\u52A1\u5C31\u63A5\u4E0B\uFF08\`${M2.task}\`\uFF09\uFF0C\u5426\u5219\u53D1\u4E00\u6761 "done" \u5E16\u5B50\u8BF4\u660E\u6709\u4EC0\u4E48\u53D8\u5316\uFF0C\u7136\u540E\u7ED3\u675F\u4F60\u7684\u56DE\u5408\u3002`
  ].join("\n");
}
function broadcastPrompt2(run, message, author = "lead") {
  const who = sameRole3(author, "lead") ? "\u534F\u8C03\u5668" : ` ${author} `;
  return [
    `${PLUGIN_MESSAGE_PREFIX} \u56E2\u961F\u8FD0\u884C ${run.id}\uFF08\u7B2C ${run.round}/${run.rounds} \u8F6E\uFF09\u7684\u9ED1\u677F\u4E0A\u6709\u4E00\u6761\u6765\u81EA${who}\u7684\u6D88\u606F\uFF1A`,
    message.trim(),
    "",
    `\u9605\u8BFB\u9ED1\u677F\uFF08\`${M2.read}\`\uFF09\uFF0C\u636E\u6B64\u884C\u52A8\uFF0C\u53D1\u4E00\u6761 "done" \u5E16\u5B50\u8BF4\u660E\u6709\u4EC0\u4E48\u53D8\u5316\uFF0C\u7136\u540E\u7ED3\u675F\u4F60\u7684\u56DE\u5408\u3002`
  ].join("\n");
}
function leadNoticePrompt2(run) {
  if (run.mode === "team") {
    const open2 = run.tasks.filter((task) => task.state === "todo" || task.state === "doing").length;
    return `${PLUGIN_MESSAGE_PREFIX} \u56E2\u961F\u8FD0\u884C ${run.id}\u300C${run.title}\u300D\u7684\u7B2C ${run.round}/${run.rounds} \u8F6E\u5DF2\u7ED3\u675F${open2 ? `\uFF0C\u8FD8\u6709 ${open2} \u4E2A\u4EFB\u52A1\u672A\u5B8C\u6210` : ""}\u3002\u8FD0\u884C \`${T2.wait}\`\uFF08\u4F1A\u7ACB\u5373\u8FD4\u56DE\uFF09\u548C \`${T2.board}\` \u9605\u8BFB\u9ED1\u677F\uFF0C\u5BF9\u7167\u9700\u6C42\u7B80\u62A5\u7684\u9A8C\u6536\u6807\u51C6\u68C0\u67E5\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\uFF0C\u628A\u672A\u8FBE\u6807\u7684\u6253\u56DE\uFF08\`${T2.tasks}\`\uFF09\uFF0C\u7136\u540E\u7528\u7B80\u4F53\u4E2D\u6587\u5411\u7528\u6237\u6C47\u62A5\u3002`;
  }
  return `${PLUGIN_MESSAGE_PREFIX} \u59D4\u6D3E\u8FD0\u884C ${run.id}\u300C${run.title}\u300D\uFF1A\u6240\u6709\u6210\u5458\u90FD\u5DF2\u5B8C\u6210\u3002\u8FD0\u884C \`${T2.wait}\`\uFF08\u4F1A\u7ACB\u5373\u8FD4\u56DE\uFF09\u6536\u96C6\u4ED6\u4EEC\u7684\u7ED3\u679C\uFF0C\u7136\u540E\u7528\u7B80\u4F53\u4E2D\u6587\u5411\u7528\u6237\u6C47\u62A5\u3002`;
}
function planWaitingPrompt2(run, task) {
  const who = task.ownerTitle ? `${task.ownerTitle} ` : "\u4E00\u540D\u6210\u5458";
  return `${PLUGIN_MESSAGE_PREFIX} ${who}\u4E3A\u56E2\u961F\u8FD0\u884C ${run.id} \u4E2D\u7684 ${task.id}\u300C${task.title}\u300D\u63D0\u4EA4\u4E86\u8BA1\u5212\uFF1A
${task.plan?.text ?? ""}

\u6279\u51C6\u5B83\uFF0C\u6216\u9644\u4E0A\u53CD\u9988\u6253\u56DE\uFF08\`${T2.tasks}\`\uFF0Creview\uFF09\uFF0C\u7136\u540E\u8FD0\u884C \`${T2.wait}\`\u3002`;
}
function modeChangedPrompt2(mode, configured) {
  const now2 = mode ?? configured;
  return `${PLUGIN_MESSAGE_PREFIX} \u7528\u6237\u628A\u672C\u4F1A\u8BDD\u7684\u534F\u4F5C\u6A21\u5F0F\u8BBE\u4E3A ${now2}${mode === null ? "\uFF08\u56E2\u961F\u914D\u7F6E\u7684\u6A21\u5F0F\uFF09" : ""}\u3002${MODE_LINE2[now2]}\u4ECE\u4E0B\u4E00\u4E2A\u8BF7\u6C42\u5F00\u59CB\u6309\u6B64\u6267\u884C\uFF1B\u5DF2\u5728\u8FDB\u884C\u7684\u8FD0\u884C\u4FDD\u6301\u539F\u6765\u7684\u6A21\u5F0F\u3002`;
}
function chatNote2(bin) {
  return [
    `${PLUGIN_MESSAGE_PREFIX} \u4F60\u4EE5 Orca \u804A\u5929\uFF08\u56FE\u5F62\u754C\u9762\uFF09\u65B9\u5F0F\u8FD0\u884C\uFF0C\`${TEAM_BIN}\` \u4E0D\u5728\u4F60\u7684 PATH \u91CC\uFF0C\u8BF7\u7528\u5B8C\u6574\u8DEF\u5F84\u8C03\u7528\uFF1A`,
    `  '${bin}' status`,
    `\u534F\u8C03\u5668\u548C\u5176\u4ED6\u6210\u5458\u7684\u6D88\u606F\u4F1A\u4EE5 Orca \u90AE\u4EF6\u7684\u5F62\u5F0F\u9001\u8FBE\uFF08\u53D1\u4EF6\u4EBA\u662F\u300CEnsemble\u300D\uFF09\u3002\u8BF7\u7528 \`${TEAM_BIN}\` \u7684\u5DE5\u5177\u56DE\u590D\uFF0C\u4F8B\u5982 ${M2.report}\uFF0C\u4E0D\u8981\u7528 \`orca orchestration reply\`\u3002`
  ].join("\n");
}
function memberStartPrompt2(team, role, work) {
  return `${memberSystemPrompt2(team, role)}

${work}`;
}

// src/shared/prompts.ts
var SETS = { en: prompt_exports, zh: prompt_zh_exports };
function promptsFor(language) {
  return SETS[language ?? "en"];
}

// src/shared/planner.ts
var EXAMPLE = {
  version: 1,
  name: "<short team name>",
  goal: "<the goal>",
  mode: "auto",
  lead: { agent: "claude", model: "<optional model id>" },
  roles: [{ name: "<lowercase role>", agent: "<agent cli>", model: "<optional model id>", folders: ["<relative/path>"], instructions: "<what this role does>" }],
  candidates: [{ name: "<short handle, may be empty>", agent: "<agent cli>", model: "<optional model id>", notes: "Good at / suited for: \u2026\nCost or speed: \u2026\nDo not give it: \u2026" }]
};
var EXAMPLE_ZH = {
  ...EXAMPLE,
  name: "<\u7B80\u77ED\u56E2\u961F\u540D>",
  goal: "<\u56E2\u961F\u76EE\u6807>",
  roles: [{ name: "<\u89D2\u8272\u540D\uFF0C\u5C0F\u5199\u82F1\u6587>", agent: "<agent cli>", model: "<\u53EF\u9009\u7684\u6A21\u578B id>", folders: ["<\u76F8\u5BF9\u8DEF\u5F84>"], instructions: "<\u8FD9\u4E2A\u89D2\u8272\u505A\u4EC0\u4E48>" }],
  candidates: [{ name: "<\u7B80\u77ED\u6807\u8BC6\uFF0C\u53EF\u7559\u7A7A>", agent: "<agent cli>", model: "<\u53EF\u9009\u7684\u6A21\u578B id>", notes: "\u64C5\u957F / \u9002\u5408\uFF1A\u2026\n\u6210\u672C\u6216\u901F\u5EA6\uFF1A\u2026\n\u4E0D\u8981\u4EA4\u7ED9\u5B83\uFF1A\u2026" }]
};
function plannerPrompt(goal, file, language) {
  const given = goal.trim();
  const agents = KNOWN_AGENTS.join(" ");
  if (language === "zh") {
    return [
      "[ensemble] \u8BF7\u4E3A\u8FD9\u4E2A\u9879\u76EE\u8BBE\u8BA1\u4E00\u4E2A\u667A\u80FD\u4F53\u56E2\u961F\uFF0C\u5E76\u628A\u5B83\u5199\u6210\u56E2\u961F\u6587\u4EF6\u3002\u56E2\u961F\u7531\u4E00\u4E2A\u534F\u8C03\u5668\u5E26\u9886\uFF0C\u6210\u5458\u5728\u534F\u8C03\u5668\u7684\u5DE5\u4F5C\u533A\u91CC\u5404\u81EA\u8FD0\u884C\u5728\u81EA\u5DF1\u7684 agent CLI \u548C\u6A21\u578B\u4E0A\u3002",
      given ? `\u76EE\u6807\uFF1A${given}` : "\u6CA1\u6709\u7ED9\u51FA\u76EE\u6807\uFF1A\u8BF7\u5148\u9605\u8BFB\u9879\u76EE\uFF08README\u3001\u76EE\u5F55\u7ED3\u6784\u3001\u4E3B\u8981\u6E90\u7801\uFF09\uFF0C\u5F04\u6E05\u5B83\u662F\u4EC0\u4E48\u3001\u9700\u8981\u54EA\u4E9B\u5DE5\u4F5C\uFF0C\u518D\u5199\u51FA\u76EE\u6807\u3002",
      "",
      "## \u6B65\u9AA4",
      `1. \u7528 shell \u67E5\u770B\u672C\u673A\u88C5\u4E86\u54EA\u4E9B agent CLI\uFF1A\`for a in ${agents}; do command -v $a >/dev/null && echo $a; done\`\u3002\u53EA\u80FD\u7528\u88C5\u4E86\u7684\u3002`,
      `2. \u628A\u56E2\u961F\u5199\u6210 JSON \u6587\u4EF6\uFF1A${file}\uFF08\u76F8\u5BF9\u5F53\u524D\u76EE\u5F55\uFF1B\u6CA1\u6709\u76EE\u5F55\u5C31\u521B\u5EFA\uFF09\u3002\u683C\u5F0F\u4E0E\u4E0B\u9762\u5B8C\u5168\u4E00\u81F4\uFF0C\u952E\u540D\u4FDD\u6301\u82F1\u6587\uFF1A`,
      "```json",
      JSON.stringify(EXAMPLE_ZH, null, 2),
      "```",
      `3. \u8FD0\u884C \`agent-team check-team ${file}\` \u68C0\u67E5\uFF1B\u6709\u9519\u8BEF\u5C31\u6539\u5230\u901A\u8FC7\u4E3A\u6B62\u3002`,
      "4. \u6700\u540E\u7528\u4E00\u4E24\u53E5\u8BDD\u8BF4\u660E\u56E2\u961F\u7684\u7EC4\u6210\u548C\u6A21\u5F0F\uFF0C\u7136\u540E\u7ED3\u675F\u3002\u4E0D\u8981\u6539\u52A8\u9879\u76EE\u91CC\u7684\u5176\u4ED6\u6587\u4EF6\u3002",
      "",
      "## \u89C4\u5219",
      `- mode\uFF1A"delegation"\uFF08\u59D4\u6D3E\uFF0C${MODE_SPECS.delegation.pattern}\uFF1A\u62C6\u5206\u9700\u6C42\uFF0C\u6210\u5458\u5404\u81EA\u72EC\u7ACB\u5B8C\u6210\uFF09\u9002\u5408\u80FD\u62C6\u6210\u804C\u8D23\u6E05\u6670\u3001\u4E92\u4E0D\u4F9D\u8D56\u7684\u5DE5\u4F5C\uFF1B"team"\uFF08\u56E2\u961F\uFF0C${MODE_SPECS.team.pattern}\uFF1A\u5148\u4E0E\u7528\u6237\u786E\u8BA4\u9700\u6C42\u7B80\u62A5\uFF0C\u6210\u5458\u5171\u7528\u4EFB\u52A1\u677F\u5E76\u4E92\u76F8\u8BC4\u5BA1\uFF09\u9002\u5408\u76F8\u4E92\u4F9D\u8D56\u3001\u9700\u8981\u7EDF\u4E00\u7EA6\u5B9A\u6216\u9700\u6C42\u5C1A\u4E0D\u6E05\u695A\u7684\u5DE5\u4F5C\uFF1B"auto" \u7531\u534F\u8C03\u5668\u6309\u9700\u6C42\u9009\u62E9\uFF1B"none" \u4E0D\u542F\u52A8\u6210\u5458\u3002\u9664\u975E\u76EE\u6807\u660E\u663E\u9700\u8981\u67D0\u4E00\u79CD\uFF0C\u5426\u5219\u7528 "auto"\u3002`,
      "- \u56FA\u5B9A\u89D2\u8272\u8D1F\u8D23\u9879\u76EE\u4E2D\u7A33\u5B9A\u7684\u533A\u57DF\uFF08\u6587\u4EF6\u5939\uFF09\uFF0C2 \u5230 6 \u4E2A\uFF0C\u804C\u8D23\u4E0D\u91CD\u53E0\uFF1B\u5019\u9009\u6210\u5458\u662F\u6A21\u578B\u6C60\uFF0C\u534F\u8C03\u5668\u6309\u63CF\u8FF0\u5206\u5DE5\uFF0C2 \u5230 4 \u4E2A\uFF0C\u80FD\u529B\u6709\u5DEE\u5F02\u3002\u4E24\u8005\u90FD\u53EF\u4EE5\u6709\uFF0C\u4F46\u4E0D\u80FD\u90FD\u4E3A\u7A7A\u3002",
      "- model \u53EF\u4EE5\u7559\u7A7A\uFF08\u7528\u8BE5 CLI \u7684\u9ED8\u8BA4\u6A21\u578B\uFF09\uFF1B\u8981\u5199\u5C31\u5199\u8BE5 CLI \u8BA4\u5F97\u7684\u6A21\u578B id\uFF0C\u4F8B\u5982 claude \u7684 opus / sonnet / haiku\u3002",
      "- \u6587\u5B57\u5185\u5BB9\uFF08goal\u3001instructions\u3001notes\uFF09\u7528\u7B80\u4F53\u4E2D\u6587\uFF1Bname\u3001\u89D2\u8272\u540D\u7528\u5C0F\u5199\u82F1\u6587\u3002"
    ].join("\n");
  }
  return [
    "[ensemble] Design an agent team for this project and write it as a team file. A lead runs the team; each member runs in the lead's workspace on its own agent CLI and model.",
    given ? `Goal: ${given}` : "No goal was given: first read the project (README, layout, main sources) to work out what it is and what work it needs, then write the goal yourself.",
    "",
    "## Steps",
    `1. Check which agent CLIs are installed: \`for a in ${agents}; do command -v $a >/dev/null && echo $a; done\`. Use only installed ones.`,
    `2. Write the team as JSON to ${file} (relative to the current directory; create the folder if needed), in exactly this shape:`,
    "```json",
    JSON.stringify(EXAMPLE, null, 2),
    "```",
    `3. Run \`agent-team check-team ${file}\` and fix the file until it passes.`,
    "4. End with one or two sentences on the team and its mode. Change no other file of the project.",
    "",
    "## Rules",
    `- mode: "delegation" (${MODE_SPECS.delegation.pattern}: the lead splits each request and members work alone) when ${MODE_SPECS.delegation.fit}; "team" (${MODE_SPECS.team.pattern}: intake with the user, then a shared task board and review) when ${MODE_SPECS.team.fit}; "auto" to let the lead pick per request; "none" for no members. Prefer "auto" unless the goal clearly calls for one.`,
    "- Fixed roles own stable areas of the project (folders): 2 to 6, with separate work. Candidates are a pool of models the lead assigns work to by their notes: 2 to 4 that differ in strengths. Use either or both, never neither.",
    "- model may be empty (the CLI's default); otherwise use a model id that CLI accepts, such as opus / sonnet / haiku for claude."
  ].join("\n");
}

// src/shared/flow.ts
var MAX_EVENTS = 400;
var FOLD_MS = 9e4;
var FOLDED = /* @__PURE__ */ new Set(["read", "deliver"]);
var clip = (text, max) => {
  const value = (text ?? "").replace(/\s+/g, " ").trim();
  return value.length <= max ? value : `${value.slice(0, max - 1).trimEnd()}\u2026`;
};
var range = (from, to) => to > from + 1 ? `#${from + 1}\u2013#${to}` : `#${to}`;
function logEvents(run, events, now2) {
  if (!events.length) return run;
  const log = [...run.events ?? []];
  let seq = run.eventSeq ?? log.at(-1)?.seq ?? 0;
  for (const event of events) {
    if (FOLDED.has(event.action)) {
      const index = log.findLastIndex((entry) => entry.component === event.component && entry.action === event.action && entry.to.join() === event.to.join());
      const last = index >= 0 ? log[index] : void 0;
      if (last && index >= log.length - 6 && Date.parse(now2) - Date.parse(last.at) < FOLD_MS) {
        const start = last.subject.match(/^#(\d+)/)?.[1];
        const end = event.subject.match(/(\d+)$/)?.[1];
        log[index] = { ...last, at: now2, count: last.count + 1, subject: start && end && Number(end) > Number(start) ? `#${start}\u2013#${end}` : event.subject };
        continue;
      }
    }
    seq += 1;
    log.push({ ...event, seq, at: now2, count: 1 });
  }
  return { ...run, events: log.slice(-MAX_EVENTS), eventSeq: seq };
}
function traceRun(before, after, actor = "plugin") {
  const events = [];
  const add = (component, action, direction, from, to = [], subject = "", note = "") => events.push({ component, action, direction, from, to, subject, note });
  const prior = before ?? { ...after, brief: null, members: [], posts: [], claims: [], tasks: [], batches: [], leadReadSeq: 0, leadInboxSeq: 0, notifiedRound: 0, round: after.round };
  const delegation = after.mode === "delegation";
  for (const batch of after.batches ?? []) {
    const was = (prior.batches ?? []).find((entry) => entry.round === batch.round && entry.at === batch.at);
    if (!was) {
      if (batch.followUp) add("split", "followup", "in", "lead", [], String(batch.round), clip(batch.title, 120));
      else add("split", "split", "in", "lead", [], String(batch.round), clip(batch.title, 120));
      if (batch.warnings.length) add("split", "warn", "in", "plugin", [], String(batch.round), clip(batch.warnings.join("; "), 200));
    }
    if (batch.summaryAt && !was?.summaryAt) {
      add("summary", "summarize", "in", "lead", [], String(batch.round), clip(batch.summary, 160));
      add("summary", "deliver", "out", "lead", ["user"], String(batch.round), "");
    }
  }
  if (!prior.brief && after.brief) {
    if (after.brief.userConfirmation) add("brief", "confirm", "in", "user", [], "", clip(after.brief.userConfirmation, 160));
    add("brief", "publish", "in", "lead", [], "", clip(after.brief.title, 120));
  }
  for (const member of after.members) {
    const was = prior.members.find((entry) => entry.agentId === member.agentId);
    if (!was && after.mode === "team" && after.brief) add("brief", "deliver", "out", actor, [member.agentId], "", member.role);
    if (delegation && was?.state === "working" && member.state === "attention") add("contexts", "attention", "in", member.agentId, [], member.role);
    if (delegation && was?.state === "attention" && member.state === "working") add("contexts", "resume", "in", member.agentId, [], member.role);
    if (after.mode === "delegation" && was && (was.state === "working" || was.state === "attention") && (member.state === "done" || member.state === "failed")) {
      add("reports", "report", "in", member.agentId, ["lead"], "", clip(member.result, 160));
    }
    if (after.mode === "delegation" && was && !was.collected && member.collected && member.state !== "working") add("reports", "collect", "out", "lead", ["lead"], "", member.title);
    const read = was !== void 0 && member.readSeq > was.readSeq;
    if (read) add("board", "read", "out", member.agentId, [member.agentId], range(was.readSeq, member.readSeq));
    else if (was && member.inboxSeq > was.inboxSeq) add("board", "deliver", "out", "plugin", [member.agentId], range(was.inboxSeq, member.inboxSeq));
  }
  const leadRead = before !== null && after.leadReadSeq > prior.leadReadSeq;
  if (leadRead) add("board", "read", "out", "lead", ["lead"], range(prior.leadReadSeq, after.leadReadSeq));
  else if (before && after.leadInboxSeq > prior.leadInboxSeq) add("board", "deliver", "out", "plugin", ["lead"], range(prior.leadInboxSeq, after.leadInboxSeq));
  const lastSeq = prior.posts.at(-1)?.seq ?? 0;
  for (const post of after.posts.filter((entry) => entry.seq > lastSeq)) {
    add("board", "post", "in", post.author === "lead" ? "lead" : post.agentId, post.to, `#${post.seq}`, `${post.kind}: ${clip(post.text, 140)}`);
  }
  for (const task of after.tasks) traceTask(prior.tasks.find((entry) => entry.id === task.id), task, actor, add, delegation);
  const key2 = (claim2) => `${claim2.agentId}\0${claim2.path}`;
  const had = new Set(prior.claims.map(key2));
  const has = new Set(after.claims.map(key2));
  const byAgent = (claims) => {
    const grouped = /* @__PURE__ */ new Map();
    for (const claim2 of claims) grouped.set(claim2.agentId, [...grouped.get(claim2.agentId) ?? [], claim2.path || "."]);
    return grouped;
  };
  for (const [agentId, paths] of byAgent(after.claims.filter((claim2) => !had.has(key2(claim2))))) add("claims", "claim", "in", agentId, [], paths.join(", "));
  for (const [agentId, paths] of byAgent(prior.claims.filter((claim2) => !has.has(key2(claim2))))) add("claims", "release", "in", agentId, [], paths.join(", "));
  if (before && after.round > prior.round && !delegation) {
    add("board", "round", "out", actor, after.members.filter((member) => member.state === "working").map((member) => member.agentId), String(after.round));
  }
  if (before && prior.status === "active" && after.status === "closed") add(delegation ? "summary" : "tasks", "close", "in", actor);
  return events;
}
function traceTask(was, task, actor, emit, delegation = false) {
  const id = task.id;
  const add = (component, action, ...rest) => {
    if (!delegation || component !== "tasks") return emit(component, action, ...rest);
    if (action !== "done") emit("split", action, ...rest);
  };
  if (!was) {
    add("tasks", "add", "in", actor === "plugin" && task.createdBy === "lead" ? "lead" : actor, [], id, clip(task.title, 100));
    if (task.state === "doing" && task.owner) add("tasks", "assign", "out", actor, [task.owner], id, clip(task.title, 100));
    return;
  }
  if (was.state !== task.state) {
    if (was.state === "todo" && task.state === "doing" && task.owner) {
      if (task.owner === actor && actor !== "plugin" && actor !== "lead") add("tasks", "claim", "out", task.owner, [task.owner], id, clip(task.title, 100));
      else if (task.owner === "lead" || actor === "lead") add("tasks", "selfClaim", "out", task.owner === "lead" ? "lead" : actor, [task.owner], id, clip(task.title, 100));
      else add("tasks", "assign", "out", actor, [task.owner], id, clip(task.title, 100));
    } else if (task.state === "done") {
      add("tasks", "done", "in", was.owner ?? actor, [], id, clip(task.result, 140));
    } else if (was.state === "doing" && task.state === "todo") {
      if (was.owner && (actor === was.owner || task.returnedBy === was.owner)) add("tasks", "release", "in", was.owner, [], id, clip(task.feedback, 120));
      else add("tasks", "reassign", "in", actor, was.owner ? [was.owner] : [], id, clip(task.feedback, 120));
    } else if (was.state === "done" && task.state === "todo") {
      add("tasks", "reject", "in", actor, [], id, clip(task.feedback, 140));
    } else if (task.state === "dropped") {
      add("tasks", "drop", "in", actor, [], id, clip(task.result || task.title, 100));
    } else if (was.state === "dropped") {
      add("tasks", "reopen", "in", actor, [], id, clip(task.title, 100));
    }
  } else if (was.title !== task.title || was.detail !== task.detail || was.role !== task.role || was.deps.join() !== task.deps.join() || was.files.join() !== task.files.join()) {
    add("tasks", "update", "in", actor, [], id, clip(task.title, 100));
  }
  const plan = task.plan;
  const old = was.plan;
  if (plan) {
    if (plan.status === "pending" && (!old || old.status !== "pending" || old.text !== plan.text)) add("plans", "submit", "in", task.owner ?? actor, [], id, clip(plan.text, 140));
    if (old?.status === "pending" && plan.status === "approved") add("plans", "approve", "in", actor === "plugin" ? "lead" : actor, [], id, clip(plan.feedback, 120));
    if (old?.status === "pending" && plan.status === "rejected") add("plans", "return", "in", actor === "plugin" ? "lead" : actor, [], id, clip(plan.feedback, 140));
  }
}

// src/worker/collab.ts
import { readFile as readFile3 } from "node:fs/promises";
import { isAbsolute, join as join5 } from "node:path";

// src/worker/orchestra.ts
var supported = null;
var probedFor = null;
var generation = 0;
var lastSent = /* @__PURE__ */ new Map();
function orchestrationSupported(adapter) {
  return adapter ? probedFor === adapter ? supported ?? false : false : supported ?? false;
}
async function detectOrchestration(adapter) {
  if (probedFor === adapter && supported !== null) return supported;
  const asked = generation;
  const answer = await adapter.rawCli(["orchestration", "worker-start", "--help"], 2e4).then(() => true, () => false);
  if (asked !== generation) return false;
  supported = answer;
  probedFor = adapter;
  return answer;
}
function resetOrchestrationSupport() {
  supported = null;
  probedFor = null;
  generation += 1;
}
var Orchestra = class {
  constructor(adapter, lead) {
    this.adapter = adapter;
    this.lead = lead;
  }
  runs = /* @__PURE__ */ new Map();
  /**
   * Runs an orchestration call "from" the lead. When the lead's own command is being handled it runs in the lead's
   * shell, where Orca knows the lead by its environment: no \`--from\` (which a chat can't be named in). Otherwise the
   * plugin runs it naming the lead's terminal.
   */
  as(from, args, timeoutMs) {
    const caller = callerIs(from);
    if (!caller) return this.adapter.runCli(args, timeoutMs);
    const at = args.indexOf("--from");
    const own2 = at >= 0 ? [...args.slice(0, at), ...args.slice(at + 2)] : args;
    return caller.exec(own2, timeoutMs);
  }
  enabled() {
    return orchestrationSupported(this.adapter);
  }
  /** Whether Orca's orchestration holds a dispatch for this member, so it can be asked about and stopped through. */
  holds(member) {
    return this.enabled() && !!member?.dispatchId;
  }
  /**
   * Whether that dispatch is what tells the member's turn: no. A dispatch describes one turn, and Orca leaves it settled
   * for good; when the plugin has since sent the member the work it is on itself (see sendMember), the dispatch speaks
   * of an earlier turn and must not end this one.
   */
  governs(member) {
    if (!this.holds(member)) return false;
    const last = lastSent.get(member.dispatchId);
    return !last || !!member.dispatchedAt && Date.parse(member.dispatchedAt) >= last;
  }
  /** Records that the plugin sent a dispatch the work itself; from then on that dispatch describes an earlier turn. */
  static sent(dispatchId) {
    lastSent.set(dispatchId, Date.now());
  }
  /** The Orca Run of a team run, created on the lead's behalf when there is none. */
  async runFor(teamRunId, leadId, objective) {
    if (!this.enabled()) return null;
    const known = this.runs.get(teamRunId);
    if (known) return known;
    const from = this.lead(leadId);
    if (!from) return null;
    try {
      const made = await this.as(from, ["orchestration", "run-create", "--objective", objective.slice(0, 2e3), "--from", from], 6e4);
      if (!made?.runId) return null;
      this.runs.set(teamRunId, made.runId);
      return made.runId;
    } catch {
      return null;
    }
  }
  /** Remembers a Run for a team run that already has one (after a restart, from the store). */
  bind(teamRunId, runId) {
    this.runs.set(teamRunId, runId);
  }
  /**
   * Registers a member's task in the run and assigns it to the agent the plugin already started (its own surface and
   * model): `task-create`, then `dispatch` without `--inject`, so Orca records who works on what without typing another
   * turn into the agent (`worker-start` would queue the spec as a second task). The member reports through its own team
   * tool, which also sends Orca's `worker_done` from its shell (see `workerDone`).
   */
  async startWorker(input) {
    if (!this.enabled()) return null;
    const from = this.lead(input.leadId);
    if (!from) return null;
    try {
      const task = await this.as(from, ["orchestration", "task-create", "--spec", input.spec, "--task-title", input.title.slice(0, 200), "--run", input.runId, "--from", from], 6e4);
      const taskId = task?.taskId ?? task?.task?.id;
      if (!taskId) return null;
      const to = isChatHandle(input.handle) ? `orca_session_id:${chatSessionId(input.handle)}` : input.handle;
      const made = await this.as(from, ["orchestration", "dispatch", "--task", taskId, "--to", to, "--run", input.runId, "--from", from], 6e4);
      const dispatchId = made?.dispatch?.id ?? made?.dispatchId;
      if (!dispatchId) return null;
      return { dispatchId, taskId, runId: input.runId, state: "unsupervised" };
    } catch {
      return null;
    }
  }
  /**
   * The member's own `worker_done`: sent from the member's shell (only there does Orca take it from the dispatched
   * agent), when its `agent-team report` call is being handled. Orca settles the dispatch and shows the result in the
   * lead's chat as an update from the worker. False when the member isn't the caller, or Orca refused it.
   */
  async workerDone(member, dispatchId, taskId, outcome, subject, body) {
    if (!this.enabled()) return false;
    const caller = callerIs(member);
    if (!caller) return false;
    try {
      await caller.exec(["orchestration", "send", "--type", "worker_done", "--task-id", taskId, "--dispatch-id", dispatchId, "--outcome", outcome, "--subject", subject.slice(0, 200), "--body", body], 6e4);
      return true;
    } catch {
      return false;
    }
  }
  /** A dispatch Orca only records (assigned without `--inject`) says nothing about the member's turn until it reports. */
  static informative(dispatch2) {
    return dispatch2 && /unsupervised|dispatched/i.test(dispatch2.state) ? null : dispatch2;
  }
  /** What Orca says about a dispatch; null when the CLI can't answer (a plugin restart, an older Orca). */
  async show(dispatchId) {
    if (!this.enabled()) return null;
    try {
      const result = await this.adapter.runCli(["orchestration", "worker-show", "--dispatch", dispatchId], 3e4);
      return result?.dispatchId ? result : null;
    } catch {
      return null;
    }
  }
  /**
   * Sends text to a worker through Orca: a busy worker gets it as mail when its turn ends, a finished one as a
   * follow-up dispatch. Returns what Orca did, or null when the CLI can't send (an older Orca, no lead to send from).
   */
  async send(dispatchId, leadId, subject, body) {
    if (!this.enabled()) return null;
    const from = this.lead(leadId);
    if (!from) return null;
    try {
      const result = await this.as(
        from,
        ["orchestration", "send", "--from", from, "--to", `dispatch:${dispatchId}`, "--subject", subject.slice(0, 200), "--body", body],
        6e4
      );
      return {
        delivery: result?.delivery === "follow_up" || !!result?.dispatchId && result.dispatchId !== dispatchId ? "follow_up" : "mail",
        dispatchId: result?.dispatchId ?? dispatchId,
        followUpOf: result?.followUpOf ?? dispatchId,
        state: result?.state ?? "ready"
      };
    } catch {
      return null;
    }
  }
  /**
   * Stops a worker's agent through Orca; the dispatch is fenced so nothing else is delivered to it. Only a terminal
   * Orca started itself is closed: on one the plugin launched and attached, Orca refuses (`stop_unknown`, "the worker
   * terminal is external") and the process keeps running, so the caller still closes the terminal itself.
   */
  async stop(dispatchId) {
    if (!this.enabled()) return { ok: false, state: "unknown", error: "orchestration not available" };
    try {
      const result = await this.adapter.runCli(["orchestration", "worker-stop", "--dispatch", dispatchId], 6e4);
      return { ok: true, state: result?.state ?? "stopped", error: null };
    } catch (error2) {
      return { ok: false, state: "unknown", error: error2 instanceof Error ? error2.message : String(error2) };
    }
  }
  /**
   * Settles a dispatch whose worker the plugin has finished itself: the member reported through its own team tool, not
   * through `worker_done`, so Orca still holds the dispatch open and would escalate "stopped without reporting" to the
   * lead. Abandoning fences it without touching the agent's process (the plugin keeps the agent for the next task).
   */
  async abandon(dispatchId) {
    if (!this.enabled()) return false;
    try {
      await this.adapter.runCli(["orchestration", "worker-abandon", "--dispatch", dispatchId], 6e4);
      return true;
    } catch {
      return false;
    }
  }
  /** Whether a dispatch has stopped working: a settled state, or Orca says the agent's pane is idle after work. */
  static settled(dispatch2) {
    const state = dispatch2.state.toLowerCase();
    if (/stop|cancel|abandon|kill/.test(state)) return { settled: true, outcome: "canceled" };
    if (/succeed|complete|done/.test(state)) return { settled: true, outcome: "completed" };
    if (/fail|error/.test(state)) return { settled: true, outcome: "failed" };
    return { settled: false, outcome: "completed" };
  }
};

// src/worker/store.ts
import { AsyncLocalStorage as AsyncLocalStorage2 } from "node:async_hooks";
import { mkdirSync } from "node:fs";
import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { join as join3 } from "node:path";
var actors = new AsyncLocalStorage2();
var asActor = (actor, work) => actors.run(actor, work);
async function writeAtomic(file, text) {
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, text);
  await rename(temp, file);
}
var Store = class {
  constructor(dir) {
    this.dir = dir;
    mkdirSync(join3(dir, "runs"), { recursive: true });
  }
  runs = /* @__PURE__ */ new Map();
  queues = /* @__PURE__ */ new Map();
  index = { leads: {}, members: {}, launches: {}, planners: {} };
  indexQueue = Promise.resolve();
  loaded = null;
  /** Called after any change, so panels and the status bar refresh. */
  onChange = () => void 0;
  load() {
    this.loaded ??= (async () => {
      try {
        this.index = { leads: {}, members: {}, launches: {}, planners: {}, ...JSON.parse(await readFile(join3(this.dir, "index.json"), "utf8")) };
      } catch {
      }
      for (const name2 of await readdir(join3(this.dir, "runs")).catch(() => [])) {
        if (!name2.endsWith(".json")) continue;
        try {
          const run = normalizeRun(JSON.parse(await readFile(join3(this.dir, "runs", name2), "utf8")));
          this.runs.set(run.id, run);
        } catch {
        }
      }
    })();
    return this.loaded;
  }
  // ----- Runs
  get(id) {
    return this.runs.get(id);
  }
  allRuns() {
    return [...this.runs.values()];
  }
  newId() {
    for (; ; ) {
      const id = newRunId();
      if (!this.runs.has(id)) return id;
    }
  }
  /** The lead's newest run, or its newest active one. */
  leadRun(leadTerminalId, activeOnly) {
    return [...this.runs.values()].filter((run) => run.leadAgentId === leadTerminalId && (!activeOnly || run.status === "active")).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }
  activeRuns() {
    return [...this.runs.values()].filter((run) => run.status === "active");
  }
  /** The newest active run the terminal is a member of. */
  memberRun(terminalId) {
    return [...this.runs.values()].filter((run) => run.status === "active" && memberOf(run, terminalId) !== void 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }
  async create(created) {
    if (this.runs.has(created.id)) throw new Error(`Run ${created.id} already exists.`);
    const run = logEvents(created, traceRun(null, created, actors.getStore() ?? "plugin"), created.createdAt);
    this.runs.set(run.id, run);
    await this.save(run.id);
    return run;
  }
  /** Changes a run, one change at a time per run, saves it and traces the change; `trace: false` skips the trace. */
  mutate(id, change, options = {}) {
    const actor = actors.getStore() ?? "plugin";
    const previous = this.queues.get(id) ?? Promise.resolve();
    const next = previous.catch(() => void 0).then(async () => {
      const before = this.runs.get(id);
      if (!before) throw new Error(`Run ${id} was not found.`);
      const after = change(before);
      if (after === before) return before;
      const run = options.trace === false ? after : logEvents(after, traceRun(before, after, actor), (/* @__PURE__ */ new Date()).toISOString());
      this.runs.set(id, run);
      await this.save(id);
      return run;
    });
    this.queues.set(id, next);
    return next;
  }
  /** Records events no state change shows, such as a refused file claim or a notice that went out. */
  log(id, events) {
    return this.mutate(id, (run) => logEvents({ ...run }, events, (/* @__PURE__ */ new Date()).toISOString()));
  }
  async save(id) {
    const run = this.runs.get(id);
    if (!run) return;
    await writeAtomic(join3(this.dir, "runs", `${id}.json`), JSON.stringify(run, null, 2) + "\n");
    this.onChange(id);
  }
  /** Forgets closed runs past the newest `keep`. */
  async prune(keep = 80) {
    const closed = [...this.runs.values()].filter((run) => run.status === "closed").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    for (const run of closed.slice(keep)) {
      this.runs.delete(run.id);
      await unlink(join3(this.dir, "runs", `${run.id}.json`)).catch(() => void 0);
    }
  }
  // ----- Sessions
  lead(terminalId) {
    return terminalId ? this.index.leads[terminalId] : void 0;
  }
  member(terminalId) {
    return terminalId ? this.index.members[terminalId] : void 0;
  }
  leads() {
    return Object.values(this.index.leads);
  }
  members() {
    return Object.values(this.index.members);
  }
  launch(id) {
    return this.index.launches[id];
  }
  /** Changes the index, one change at a time, and saves it. */
  updateIndex(change) {
    const next = this.indexQueue.catch(() => void 0).then(async () => {
      change(this.index);
      await writeAtomic(join3(this.dir, "index.json"), JSON.stringify(this.index, null, 2) + "\n");
      this.onChange(null);
    });
    this.indexQueue = next;
    return next;
  }
  setLead(session) {
    return this.updateIndex((index) => {
      index.leads[session.terminalId] = session;
    });
  }
  patchLead(terminalId, patch) {
    return this.updateIndex((index) => {
      const lead = index.leads[terminalId];
      if (lead) index.leads[terminalId] = { ...lead, ...patch };
    });
  }
  planner(terminalId) {
    return terminalId ? this.index.planners[terminalId] : void 0;
  }
  planners() {
    return Object.values(this.index.planners);
  }
  setPlanner(job) {
    return this.updateIndex((index) => {
      index.planners[job.terminalId] = job;
    });
  }
  setMember(member) {
    return this.updateIndex((index) => {
      index.members[member.terminalId] = member;
    });
  }
  addLaunch(launch) {
    return this.updateIndex((index) => {
      index.launches[launch.id] = launch;
      const old = Date.now() - 24 * 36e5;
      for (const [id, entry] of Object.entries(index.launches)) if (Date.parse(entry.createdAt) < old) delete index.launches[id];
    });
  }
  takeLaunch(id) {
    const launch = this.index.launches[id];
    if (launch) void this.updateIndex((index) => void delete index.launches[id]);
    return launch;
  }
  // ----- Session state, as the tools read it
  sessionMode(leadTerminalId) {
    return this.lead(leadTerminalId)?.mode ?? null;
  }
  sessionLock(leadTerminalId) {
    return this.lead(leadTerminalId)?.locked ?? null;
  }
  setSessionMode(leadTerminalId, mode) {
    return this.patchLead(leadTerminalId, { mode });
  }
  lockSession(leadTerminalId, locked) {
    return this.updateIndex((index) => {
      const lead = index.leads[leadTerminalId];
      if (lead && !lead.locked) lead.locked = locked;
    });
  }
  sessionRoles(leadTerminalId) {
    return this.lead(leadTerminalId)?.roles ?? [];
  }
  setSessionRoles(leadTerminalId, roles) {
    return this.patchLead(leadTerminalId, { roles: [...roles] });
  }
  pendingBrief(leadTerminalId) {
    return this.lead(leadTerminalId)?.brief ?? null;
  }
  setPendingBrief(leadTerminalId, brief) {
    return this.patchLead(leadTerminalId, { brief });
  }
};
var newLaunchId = () => `L${Math.floor(Math.random() * 4294967296).toString(16).padStart(8, "0").toUpperCase()}`;

// src/worker/transcripts.ts
import { readFile as readFile2 } from "node:fs/promises";
import { homedir as homedir3 } from "node:os";
import { join as join4 } from "node:path";
function claudeProjectDirs(cwd) {
  const base = process.env.CLAUDE_CONFIG_DIR || join4(homedir3(), ".claude");
  const variants = /* @__PURE__ */ new Set([cwd, cwd.replace(/^\/private\//, "/"), cwd.startsWith("/tmp/") ? `/private${cwd}` : cwd]);
  return [...variants].map((dir) => join4(base, "projects", dir.replace(/[^A-Za-z0-9]/g, "-")));
}
function textOf(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map((part) => part && typeof part === "object" && part.type === "text" ? String(part.text ?? "") : "").join("\n").trim();
}
async function claudeTranscript(cwd, sessionId) {
  if (!sessionId) return null;
  for (const dir of claudeProjectDirs(cwd)) {
    let raw;
    try {
      raw = await readFile2(join4(dir, `${sessionId}.jsonl`), "utf8");
    } catch {
      continue;
    }
    const messages = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type !== "user" && entry.type !== "assistant" || entry.isMeta) continue;
        const text = textOf(entry.message?.content);
        if (!text) continue;
        messages.push({ role: entry.type, text, at: entry.timestamp ? Date.parse(entry.timestamp) : 0 });
      } catch {
      }
    }
    return messages;
  }
  return null;
}
async function claudeTurn(cwd, sessionId) {
  if (!sessionId) return { found: false, ended: false, endedAt: 0, text: "" };
  for (const dir of claudeProjectDirs(cwd)) {
    let raw;
    try {
      raw = await readFile2(join4(dir, `${sessionId}.jsonl`), "utf8");
    } catch {
      continue;
    }
    let last = null;
    let text = "";
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.type === "user" && !entry.isMeta && textOf(entry.message?.content)) text = "";
        if (entry.type !== "assistant") continue;
        last = { at: entry.timestamp ? Date.parse(entry.timestamp) : 0, stop: entry.message?.stop_reason ?? null };
        const said = textOf(entry.message?.content);
        if (said) text = said;
      } catch {
      }
    }
    return { found: true, ended: last?.stop === "end_turn", endedAt: last?.at ?? 0, text };
  }
  return { found: false, ended: false, endedAt: 0, text: "" };
}
var CHROME = /^[\s─━│┃╭╮╰╯┌┐└┘├┤┬┴┼═║]*$/;
function lastReplyFromScreen(lines) {
  const cleaned = lines.filter((line) => !CHROME.test(line));
  let start = -1;
  for (let index = cleaned.length - 1; index >= 0; index -= 1) {
    if (/^\s*[⏺●•]\s/.test(cleaned[index])) {
      start = index;
      while (start > 0 && /^\s*[⏺●•]\s/.test(cleaned[start - 1])) start -= 1;
      break;
    }
  }
  const tail = start >= 0 ? cleaned.slice(start) : cleaned.slice(-40);
  const end = tail.findIndex((line, index) => index > 0 && /^\s*(❯|›|>)\s/.test(line));
  return (end > 0 ? tail.slice(0, end) : tail).filter((line) => !/^\s*(✻|⏵⏵|\? for shortcuts|esc to interrupt)/.test(line)).map((line) => line.replace(/^\s*[⏺●•]\s?/, "")).join("\n").trim();
}
function typedAfter(lines, before) {
  const anchor2 = before.filter((line) => line.trim() && !CHROME.test(line)).slice(-3);
  let from = 0;
  if (anchor2.length) {
    for (let index = lines.length - anchor2.length; index >= 0; index -= 1) {
      if (anchor2.every((line, offset) => lines[index + offset] === line)) {
        from = index + anchor2.length;
        break;
      }
    }
  }
  const messages = [];
  let current = null;
  for (const line of lines.slice(from)) {
    const prompt = line.match(/^\s*(?:❯|›)\s+(.*)$/);
    if (prompt) {
      if (current?.join(" ").trim()) messages.push({ role: "user", text: current.join(" "), seq: messages.length + 1 });
      current = [prompt[1]];
    } else if (current && /^\s{2,}\S/.test(line) && !/^\s*[⏺●•✻]/.test(line)) {
      current.push(line.trim());
    } else if (current) {
      if (current.join(" ").trim()) messages.push({ role: "user", text: current.join(" "), seq: messages.length + 1 });
      current = null;
    }
  }
  if (current?.join(" ").trim()) messages.push({ role: "user", text: current.join(" "), seq: messages.length + 1 });
  return messages;
}

// src/worker/collab.ts
var MAX_WAIT_SECONDS = 540;
var BOARD_LIMIT = 24e3;
var now = () => (/* @__PURE__ */ new Date()).toISOString();
var ok = (text, structuredContent) => ({ text, ...structuredContent === void 0 ? {} : { structuredContent } });
var fail = (text) => ({ isError: true, text });
var key = (value) => value.trim().toLowerCase();
var sleep = (ms, signal) => new Promise((resolve) => {
  const timer = setTimeout(resolve, ms);
  signal?.addEventListener("abort", () => {
    clearTimeout(timer);
    resolve();
  }, { once: true });
});
function defineTool(tool) {
  return tool;
}
var adapterRef = null;
var orca = () => adapterRef;
var store = null;
var readTeamRef = async (lead) => ({ team: lead.team, source: "the session's copy" });
var orchestra = null;
function initCollaboration(adapter, runs, readTeam, teamBin = "agent-team") {
  adapterRef = adapter;
  store = runs;
  readTeamRef = readTeam;
  orchestra = new Orchestra(adapter, (leadId) => store.lead(leadId)?.terminalId ?? null);
  resetOrchestrationSupport();
  void detectOrchestration(adapter).then((on) => adapter.orca.log(`[ensemble] Orca orchestration ${on ? "on: members ride Orca's Runs" : "not available: members are dispatched by the plugin"}`)).catch(() => void 0);
  adapter.teamBin = teamBin;
  adapter.chatLead = (handle) => store.lead(handle) ? handle : store.member(handle)?.leadTerminalId ?? null;
  adapter.chatHome = (handle) => {
    const member = store.member(handle);
    return store.lead(handle)?.path ?? (member ? store.lead(member.leadTerminalId)?.path : null) ?? null;
  };
}
async function leadContext(caller) {
  await store.load();
  const lead = store.lead(caller.id);
  if (!lead) throw new Error(`This terminal is not an agent team's lead. Start a team session from the Ensemble panel, or begin the first prompt of a new agent with "@team".`);
  const { team, source } = await readTeamRef(lead);
  const override = lead.mode;
  const locked = lead.locked;
  return { lead, workspaceId: lead.workspaceId ?? caller.workspaceId ?? "", team, file: source, override, locked, effective: effectiveMode(team.mode, override, locked), sessionRoles: team.candidates.length ? lead.roles : [] };
}
async function userConfirmed(leadId, pending, quote) {
  if (pending.confirmedBy === "panel") return true;
  const lead = store.lead(leadId);
  const after = Date.parse(pending.at);
  const transcript = lead ? await claudeTranscript(lead.path, lead.agentSessionId) : null;
  if (transcript) {
    const messages = transcript.filter((message) => message.role === "user").map((message) => ({ role: "user", text: message.text, seq: message.at }));
    if (confirmsBrief(messages, after, quote)) return true;
  }
  const screen = await orca().readTerminal(leadId, 400);
  return confirmsBrief(typedAfter(screen, pending.transcript ?? []), 0, quote);
}
var HELPER = "helper";
var RESERVED = /* @__PURE__ */ new Set([HELPER, "lead", TO_ALL, "anyone"]);
function roleSpec(ctx, name2) {
  const fixed = ctx.team.roles.find((role) => key(role.name) === key(name2));
  if (fixed) return { ...fixed, formed: false };
  const formed = ctx.sessionRoles.find((role) => key(role.name) === key(name2));
  const candidateOf = ctx.team.candidates.find((entry) => key(entry.name) === key(formed?.candidate ?? ""));
  if (formed) return { name: formed.name, agent: formed.agent, model: formed.model, effort: formed.effort, ...candidateOf?.surface ? { surface: candidateOf.surface } : {}, folders: formed.folders, instructions: formed.instructions, formed: true };
  const candidate = ctx.team.candidates.find((entry) => key(entry.name) === key(name2));
  if (candidate) return { name: candidate.name, agent: candidate.agent, model: candidate.model, effort: candidate.effort, ...candidate.surface ? { surface: candidate.surface } : {}, folders: [], instructions: candidate.notes, formed: true };
  if (key(name2) === HELPER && !ctx.team.candidates.length) {
    return { name: HELPER, agent: ctx.team.lead.agent, model: ctx.team.lead.model, effort: ctx.team.lead.effort, ...ctx.team.lead.surface ? { surface: ctx.team.lead.surface } : {}, folders: [], instructions: "Helps the lead with work no role owns.", formed: false };
  }
  return null;
}
var headerFor = (spec, lang) => spec.formed ? promptsFor(lang).roleHeader(spec) : "";
function rosterOf(ctx, run, extra = []) {
  const names = [...new Set([...run.members.filter((member) => !member.retired).map((member) => member.role), ...extra.map((spec) => spec.name)].map(key))];
  return names.map((name2) => roleSpec(ctx, name2) ?? { name: name2, folders: [], instructions: "" });
}
var sameRuntime = (a, b) => a.agent === b.agent && (a.model ?? "") === (b.model ?? "") && (a.effort ?? "") === (b.effort ?? "");
async function refreshAgents(workspaceId) {
  const rows = await orca().listAgents(workspaceId ?? void 0);
  for (const row of rows) {
    if (!row.terminalId) continue;
    const was = orca().agents.get(row.terminalId);
    orca().agents.set(row.terminalId, { ...was ?? { workspaceId: workspaceId ?? null }, ...row, terminalId: row.terminalId, state: was && Date.now() - was.at < 5e3 ? was.state : row.state, at: Date.now(), workspaceId: was?.workspaceId ?? workspaceId ?? null });
  }
}
async function agentAlive(terminalId, workspaceId) {
  if (orca().agents.has(terminalId) && Date.now() - orca().agents.get(terminalId).at < 15e3) return true;
  await refreshAgents(workspaceId);
  if (orca().agents.has(terminalId) && Date.now() - orca().agents.get(terminalId).at < 15e3) return true;
  return orca().terminalAlive(terminalId);
}
async function isIdleAgent(terminalId, workspaceId) {
  if (!orca().stateOf(terminalId)) await refreshAgents(workspaceId);
  if (!orca().stateOf(terminalId)) {
    const probed = await orca().probeState(terminalId);
    return probed === "done" || probed === "waiting";
  }
  return orca().isIdle(terminalId);
}
var seenWorking = /* @__PURE__ */ new Map();
function noteAgentWorking(terminalId) {
  seenWorking.set(terminalId, Date.now());
  orca().noteWorking(terminalId);
}
async function reusableMember(leadId, spec) {
  const lead = store.lead(leadId);
  const mine = store.members().filter((member) => member.leadTerminalId === leadId && key(member.role) === key(spec.name) && sameRuntime(member, spec)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let busy2 = false;
  for (const member of mine) {
    if (!await agentAlive(member.terminalId, lead?.workspaceId ?? null)) continue;
    if (await isIdleAgent(member.terminalId, lead?.workspaceId ?? null)) return member.terminalId;
    busy2 = true;
  }
  return busy2 ? "busy" : null;
}
async function dispatch(ctx, leadId, spec, prompt, lang) {
  const existing = await reusableMember(leadId, spec);
  if (existing === "busy") throw new Error(lang === "zh" ? `${spec.name} \u6B63\u5FD9\u4E8E\u5176\u4ED6\u5DE5\u4F5C\uFF1B\u8BF7\u7B49\u5B83\u5B8C\u6210\uFF0C\u6216\u628A\u5DE5\u4F5C\u4EA4\u7ED9\u522B\u7684\u89D2\u8272\u3002` : `${spec.name} is busy with other work; wait for it to finish, or give the work to another role.`);
  if (existing) {
    const sent = await sendMember(existing, prompt);
    if (!sent) throw new Error(lang === "zh" ? `\u65E0\u6CD5\u628A\u4EFB\u52A1\u4EA4\u7ED9 ${spec.name}\u3002` : `Could not hand the task to ${spec.name}.`);
    seenWorking.delete(existing);
    return { agentId: existing, title: store.member(existing)?.title ?? spec.name, continued: true, surface: store.member(existing)?.surface ?? "terminal", note: null };
  }
  const P = promptsFor(lang);
  const title = memberTitle(spec.name, store.members().filter((entry) => entry.leadTerminalId === leadId).map((entry) => entry.title));
  const launchId = newLaunchId();
  const systemPrompt = P.memberSystemPrompt(ctx.team, spec);
  const wanted = surfaceOf(spec);
  const model = spec.model && spec.agent === "pi" ? await resolveModel(spec.model) : spec.model;
  const member = { leadTerminalId: leadId, role: spec.name, agent: spec.agent, model: spec.model, effort: spec.effort, surface: wanted, title };
  await store.addLaunch({ id: launchId, kind: "member", prompt, systemPrompt, member, model, effort: spec.effort, createdAt: now() });
  const forTerminal = `[ensemble:${launchId}]
${spec.agent === "claude" ? prompt : P.memberStartPrompt(ctx.team, spec, prompt)}`;
  const forChat = `${P.chatNote(orca().teamBin)}

${P.memberStartPrompt(ctx.team, spec, prompt)}`;
  let notes = [];
  let started;
  try {
    started = await orca().launch({ path: ctx.lead.path, agent: spec.agent, model, effort: spec.effort, prompt: wanted === "chat" ? forChat : forTerminal, surface: wanted, as: leadId });
  } catch (error2) {
    if (!(error2 instanceof LaunchRefused) || wanted !== "chat") throw error2;
    notes = [lang === "zh" ? `${spec.name}\uFF1AOrca \u8FD9\u4E2A\u7248\u672C\u4E0D\u80FD\u4EE5\u56FE\u5F62\u754C\u9762\u6253\u5F00 ${spec.agent}\uFF0C\u6539\u7528\u547D\u4EE4\u884C\uFF08\u7EC8\u7AEF\uFF09\u3002` : `${spec.name}: this Orca cannot open ${spec.agent} as a chat here; started it in a terminal instead.`];
    started = await orca().launch({ path: ctx.lead.path, agent: spec.agent, model, effort: spec.effort, prompt: forTerminal, surface: "terminal", as: leadId });
  }
  const { terminalId } = started;
  const ran = started.surface;
  if (!store.member(terminalId)) await store.setMember({ terminalId, ...member, surface: ran, createdAt: now() });
  void orca().rename(terminalId, title);
  seenWorking.delete(terminalId);
  return { agentId: terminalId, title, continued: false, surface: ran, note: notes[0] ?? null };
}
async function attachWorker(ctx, leadId, member, spec, lang) {
  const teamRun = store.leadRun(leadId, true);
  if (!orchestra?.enabled() || !teamRun || teamRun.mode !== "delegation") return null;
  const earlier = store.member(member.agentId);
  if (earlier?.dispatchId) {
    await orchestra.abandon(earlier.dispatchId).catch(() => void 0);
    await store.setMember({ ...earlier, dispatchId: void 0, orcaTaskId: void 0 });
  }
  const orcaRun = teamRun.orcaRunId ?? await orchestra.runFor(teamRun.id, leadId, `${teamRun.id} ${teamRun.title}`);
  if (!orcaRun) return null;
  if (teamRun.orcaRunId !== orcaRun) await store.mutate(teamRun.id, (current2) => ({ ...current2, orcaRunId: orcaRun }));
  const dispatch2 = await orchestra.startWorker({ runId: orcaRun, leadId, handle: member.agentId, title: member.title, spec: specBrief(spec), workspacePath: ctx.lead.path });
  if (!dispatch2) return lang === "zh" ? `${spec.name}\uFF1AOrca \u7F16\u6392\u6CA1\u6709\u63A5\u7BA1\u8FD9\u4E2A\u6210\u5458\uFF0C\u63D2\u4EF6\u81EA\u5DF1\u6D3E\u53D1\u3002` : `${spec.name}: Orca's orchestration did not take this member; the plugin dispatches it itself.`;
  const live = memberOf(store.get(teamRun.id) ?? teamRun, member.agentId);
  if (live && live.state !== "working" && live.state !== "attention") {
    await orchestra.abandon(dispatch2.dispatchId).catch(() => void 0);
    return null;
  }
  const current = store.member(member.agentId);
  if (current) await store.setMember({ ...current, dispatchId: dispatch2.dispatchId, orcaTaskId: dispatch2.taskId, orcaRunId: orcaRun });
  return null;
}
async function resolveModel(model) {
  const choice = resolvePiModel(model, await orca().piModels());
  if (choice.ok) return choice.model;
  const hint = choice.matches.length ? ` (${choice.error === "ambiguous" ? "one of" : "near"}: ${choice.matches.join(", ")})` : "";
  throw new Error(`pi has no model "${model}"${hint}. Put a provider/id model in the team, such as ${choice.matches[0] ?? "provider/id"}.`);
}
function specBrief(spec) {
  return [spec.instructions.trim(), spec.folders.length ? `Folders: ${spec.folders.join(", ")}` : "", `Work through the agent-team command (${TEAM_BIN} report <json>) and report with worker_done.`].filter(Boolean).join("\n\n").slice(0, 2e4);
}
async function sendMember(id, text, leadId) {
  const member = store.member(id);
  const lead = member ? store.lead(member.leadTerminalId) : void 0;
  if (orchestra?.governs(member) && member.leadTerminalId && member.surface === "chat") {
    const sent = await orchestra.send(member.dispatchId, member.leadTerminalId, "Ensemble", text);
    if (sent) {
      noteAgentWorking(id);
      if (sent.dispatchId !== member.dispatchId) await store.setMember({ ...member, dispatchId: sent.dispatchId });
      return true;
    }
  }
  const workspaceId = lead?.workspaceId ?? null;
  if (!await isIdleAgent(id, workspaceId)) return false;
  const typed = await orca().send(id, text);
  if (typed && orchestra?.holds(member)) Orchestra.sent(member.dispatchId);
  return typed;
}
async function sendIfIdle(id, text) {
  if (store.member(id)) return sendMember(id, text);
  const workspaceId = store.lead(id)?.workspaceId ?? null;
  if (!await isIdleAgent(id, workspaceId)) return false;
  return orca().send(id, text);
}
async function sendWhenIdle(id, text, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await sendIfIdle(id, text)) return true;
    const member = store.member(id);
    if (member && !await agentAlive(id, store.lead(member.leadTerminalId)?.workspaceId ?? null)) return false;
    await sleep(750);
  }
  return false;
}
var reports = /* @__PURE__ */ new Map();
async function lastMessage(id) {
  const reported = reports.get(id);
  if (reported) {
    reports.delete(id);
    return reported;
  }
  const member = store.member(id);
  const lead = member ? store.lead(member.leadTerminalId) : store.lead(id);
  const sessionId = orca().agents.get(id)?.sessionId ?? null;
  if (lead && sessionId) {
    const transcript = await claudeTranscript(lead.path, sessionId);
    const last = transcript?.filter((message) => message.role === "assistant").at(-1)?.text;
    if (last) return last;
  }
  const screen = lastReplyFromScreen(await orca().readTerminal(id, 300));
  return screen || null;
}
async function turnEnded(terminalId, since) {
  const member = store.member(terminalId);
  const lead = member ? store.lead(member.leadTerminalId) : store.lead(terminalId);
  const agent = member?.agent ?? lead?.team.lead.agent ?? orca().agents.get(terminalId)?.agent ?? null;
  const sessionId = orca().agents.get(terminalId)?.sessionId ?? (member ? null : lead?.agentSessionId) ?? null;
  if (agent === "claude" && lead) {
    if (!sessionId) return { ended: null, text: null };
    const turn = await claudeTurn(lead.path, sessionId);
    if (turn.found) return { ended: turn.ended && turn.endedAt >= since - 2e3, text: turn.text || null };
  }
  return { ended: null, text: null };
}
function amendReport(run, agentId, result) {
  const text = excerpt(result, 4e3);
  const index = run.events.map((event) => event.component === "reports" && event.action === "report" && event.from === agentId).lastIndexOf(true);
  return {
    ...run,
    updatedAt: now(),
    members: run.members.map((member) => member.agentId === agentId ? { ...member, result: text, collected: false } : member),
    tasks: run.tasks.map((task) => task.owner === agentId && task.state === "done" && task === [...run.tasks].reverse().find((entry) => entry.owner === agentId && entry.state === "done") ? { ...task, result: excerpt(result, 300) } : task),
    events: index < 0 ? run.events : run.events.map((event, at) => at === index ? { ...event, note: excerpt(result.replace(/\s+/g, " "), 160) } : event)
  };
}
async function memberTurnEnded(terminalId, member) {
  const since = Date.parse(member.dispatchedAt);
  const turn = await turnEnded(terminalId, since);
  if (turn.ended !== null) return { ended: turn.ended, text: turn.text };
  const agent = store.member(terminalId)?.agent;
  const worked = (seenWorking.get(terminalId) ?? 0) >= since;
  return { ended: agent !== "claude" && worked && Date.now() - since > 15e3, text: null };
}
async function closeActive(leadId, lang) {
  const active = store.leadRun(leadId, true);
  if (!active) return null;
  if (!roundComplete(active) && active.members.length) {
    const working = workingMembers(active).map((member) => member.title).join(", ");
    return lang === "zh" ? `\u8FD0\u884C ${active.id}\uFF08${active.mode === "team" ? "\u56E2\u961F" : "\u59D4\u6D3E"}\u6A21\u5F0F\uFF09\u8FD8\u5728\u8FDB\u884C\uFF08${working}\uFF09\u3002\u8BF7\u5148\u8FD0\u884C ${LEAD_TOOLS.wait}\uFF0C\u6216\u7528 ${LEAD_TOOLS.send} \u8C03\u6574\u3002` : `Run ${active.id} (${active.mode} mode) is still working (${working}). Run ${LEAD_TOOLS.wait} first, or ${LEAD_TOOLS.send} to adjust it.`;
  }
  await store.mutate(active.id, (run) => ({ ...run, status: "closed", claims: [], updatedAt: now() }));
  return null;
}
var staffing = /* @__PURE__ */ new Set();
var isStaffing = (runId) => [...staffing].some((lock) => lock.startsWith(`${runId}:`));
function staffableRoles(ctx, run) {
  if (run.members.filter((member) => !member.retired).length >= MAX_TEAM_SIZE) return [];
  return unstaffedRoles(run).filter((role) => {
    const spec = roleSpec(ctx, role);
    return spec !== null && spec.name !== HELPER;
  });
}
async function staff(runId) {
  const run = store.get(runId);
  if (!run || run.mode !== "team" || run.status !== "active" || !run.brief) return;
  const roles = unstaffedRoles(run).filter((role) => !staffing.has(`${runId}:${key(role)}`));
  if (!roles.length) return;
  const ctx = await leadContext({ id: run.leadAgentId, workspaceId: run.workspaceId });
  for (const role of roles) {
    const current = store.get(runId);
    if (current.members.filter((member) => !member.retired).length >= MAX_TEAM_SIZE) break;
    const spec = roleSpec(ctx, role);
    if (!spec) continue;
    const lock = `${runId}:${key(spec.name)}`;
    if (staffing.has(lock)) continue;
    staffing.add(lock);
    try {
      const started = await dispatch(ctx, run.leadAgentId, spec, promptsFor(current.language).teamKickoffPrompt(current, current.brief, rosterOf(ctx, current, [spec]), spec, headerFor(spec, current.language)), current.language);
      await store.mutate(runId, (latest) => {
        const reopened = roundComplete(latest) && latest.notifiedRound >= latest.round ? { ...latest, round: latest.round + 1, rounds: Math.max(latest.rounds, latest.round + 1) } : latest;
        return addPost(upsertMember(reopened, { role: spec.name, agentId: started.agentId, title: started.title, task: "" }, now()), { author: "lead", agentId: run.leadAgentId, kind: "note", text: latest.language === "zh" ? `${memberName({ title: started.title, role: spec.name }, true)}\u4E3A\u5B83\u7684\u5F85\u529E\u4EFB\u52A1\u52A0\u5165\u4E86\u8FD0\u884C\u3002` : `${memberName({ title: started.title, role: spec.name })} joined the run for its open tasks.`, to: [], files: [] }, now()).run;
      });
      if (!started.continued) await attachWorker(ctx, run.leadAgentId, started, spec, current.language);
    } catch (error2) {
      console.error(`[ensemble] run ${runId}: could not staff ${role}`, error2);
    } finally {
      staffing.delete(lock);
    }
  }
}
function advance(runId, depth = 0) {
  return asActor("plugin", () => moveAlong(runId, depth));
}
async function moveAlong(runId, depth) {
  if (depth > 6) return;
  await staff(runId).catch((error2) => console.error(`[ensemble] staffing ${runId} failed`, error2));
  let action = null;
  await store.mutate(runId, (current) => {
    const step = nextStep(current);
    if (step.kind === "dispatch") {
      const next = assignTasks(current, step.assignments, now());
      action = { kind: "dispatch", run: next, assignments: step.assignments };
      return next;
    }
    if (step.kind === "verdicts") {
      let next = markVerdictsDelivered(current, step.taskIds, true, now());
      const owners = /* @__PURE__ */ new Map();
      for (const id of step.taskIds) {
        const owner = taskOf(current, id).owner;
        owners.set(owner, [...owners.get(owner) ?? [], id]);
      }
      const stamp = now();
      for (const owner of owners.keys()) next = updateMember(next, owner, { state: "working", collected: false, dispatchedAt: stamp }, stamp);
      action = { kind: "verdicts", run: next, owners: [...owners].map(([agentId, taskIds]) => ({ agentId, taskIds, dispatchedAt: stamp })) };
      return next;
    }
    if (step.kind === "plans") {
      action = { kind: "plans", taskIds: step.taskIds };
      return markPlansNotified(current, step.taskIds, true, now());
    }
    if (step.kind === "next-round") {
      const started = startRound(current, now());
      action = { kind: "round", run: started };
      return started;
    }
    if (step.kind === "notify-lead") {
      action = { kind: "notify", round: current.round, previous: current.notifiedRound };
      return { ...current, notifiedRound: current.round };
    }
    return current;
  }).catch(() => void 0);
  const taken = action;
  if (!taken) return;
  if (taken.kind === "dispatch") {
    const ctx = await leadContext({ id: taken.run.leadAgentId, workspaceId: taken.run.workspaceId }).catch(() => null);
    for (const { taskId, agentId } of taken.assignments) {
      const member = memberOf(taken.run, agentId);
      const task = taskOf(taken.run, taskId);
      if (!member || !task || task.owner !== agentId || task.state !== "doing") continue;
      const spec = ctx ? roleSpec(ctx, member.role) : null;
      const sent2 = await sendWhenIdle(agentId, promptsFor(taken.run.language).assignmentPrompt(taken.run, task, spec ? headerFor(spec, taken.run.language) : "")).catch(() => false);
      if (sent2) continue;
      await store.mutate(runId, (current) => {
        const back = releaseTask(current, agentId, task.id, now()).run;
        const latest = memberOf(back, agentId);
        return latest?.dispatchedAt === member.dispatchedAt && latest.state === "working" ? updateMember(back, agentId, { state: "done" }, now()) : back;
      });
    }
    await advance(runId, depth + 1);
    return;
  }
  if (taken.kind === "verdicts") {
    for (const owner of taken.owners) {
      const tasks = owner.taskIds.map((id) => taskOf(taken.run, id)).filter((task) => !!task);
      const sent2 = await sendWhenIdle(owner.agentId, promptsFor(taken.run.language).planReviewedPrompt(taken.run, tasks)).catch(() => false);
      if (sent2) {
        await store.log(runId, tasks.map((task) => ({ component: "plans", action: "verdict", direction: "out", from: "plugin", to: [owner.agentId], subject: task.id, note: task.plan?.status ?? "" })));
        continue;
      }
      await store.mutate(runId, (current) => {
        const back = markVerdictsDelivered(current, owner.taskIds, false, now());
        const latest = memberOf(back, owner.agentId);
        return latest?.dispatchedAt === owner.dispatchedAt && latest.state === "working" ? updateMember(back, owner.agentId, { state: "done" }, now()) : back;
      });
    }
    await advance(runId, depth + 1);
    return;
  }
  if (taken.kind === "plans") {
    const run2 = store.get(runId);
    const plans = taken.taskIds.map((id) => taskOf(run2, id)).filter((task) => !!task);
    const sent2 = await sendWhenIdle(run2.leadAgentId, plans.map((task) => promptsFor(run2.language).planWaitingPrompt(run2, task)).join("\n\n---\n\n"), 4).catch(() => false);
    if (!sent2) await store.mutate(runId, (current) => markPlansNotified(current, taken.taskIds, false, now()));
    else {
      const seen = /* @__PURE__ */ new Set();
      await store.log(runId, plans.flatMap((task) => seen.has(task.id) ? [] : [{ component: "plans", action: "notify", direction: "out", from: "plugin", to: ["lead"], subject: (seen.add(task.id), task.id), note: excerpt(task.plan?.text, 140) }]));
    }
    return;
  }
  if (taken.kind === "round") {
    for (const member of taken.run.members.filter((entry) => entry.state === "working")) {
      const sent2 = await sendWhenIdle(member.agentId, promptsFor(taken.run.language).teamRoundPrompt(taken.run, member.readSeq)).catch(() => false);
      if (sent2) continue;
      console.error(`[ensemble] run ${runId}: could not start round ${taken.run.round} for ${member.title}`);
      await store.mutate(runId, (current) => finishMember(current, member.agentId, "failed", `(could not start round ${current.round}: the agent was not idle or is gone)`, now()));
    }
    await advance(runId, depth + 1);
    return;
  }
  const run = store.get(runId);
  const sent = await sendWhenIdle(run.leadAgentId, promptsFor(run.language).leadNoticePrompt(run), 4).catch(() => false);
  if (!sent) await store.mutate(runId, (current) => current.notifiedRound === taken.round ? { ...current, notifiedRound: taken.previous } : current);
  else await store.log(runId, [{ component: run.mode === "team" ? "tasks" : "reports", action: "notify", direction: "out", from: "plugin", to: ["lead"], subject: run.mode === "team" ? String(taken.round) : `batch ${taken.round}`, note: "" }]);
}
var DISPATCH_MARGIN_MS = 3e3;
async function finishIfCurrent(runId, seen, endedAt, outcome, message) {
  const after = await store.mutate(runId, (current) => {
    const member = memberOf(current, seen.agentId);
    if (!member || member.state !== "working" && member.state !== "attention" || member.dispatchedAt !== seen.dispatchedAt) return current;
    if (Date.parse(member.dispatchedAt) > endedAt - DISPATCH_MARGIN_MS) return current;
    return finishMember(current, seen.agentId, outcome, message, now());
  });
  const session = store.member(seen.agentId);
  const finished = memberOf(after, seen.agentId)?.state !== "working" && memberOf(after, seen.agentId)?.state !== "attention";
  if (finished && orchestra?.holds(session)) {
    await orchestra.abandon(session.dispatchId).catch(() => void 0);
    await store.setMember({ ...session, dispatchId: void 0 });
  }
  return after;
}
async function reconcile(runId) {
  const run = store.get(runId);
  if (!run) return;
  const workspaceId = store.lead(run.leadAgentId)?.workspaceId ?? null;
  if (workingMembers(run).length) await refreshAgents(workspaceId);
  for (const member of workingMembers(run)) {
    if (Date.now() - Date.parse(member.dispatchedAt) < 3e4) continue;
    const session = store.member(member.agentId);
    if (orchestra?.governs(session) && session.dispatchId) {
      const dispatch2 = Orchestra.informative(await orchestra.show(session.dispatchId));
      if (dispatch2) {
        const settled = Orchestra.settled(dispatch2);
        if (settled.settled) {
          const message = reports.get(member.agentId) ?? await lastMessage(member.agentId);
          reports.delete(member.agentId);
          await finishIfCurrent(runId, member, Date.now(), outcomeOf(dispatch2), message);
          continue;
        }
        const gone = /exit|unverifi/i.test(dispatch2.liveness ?? "");
        const stale = Date.now() - Date.parse(member.dispatchedAt) > 6e5;
        if (gone || stale) {
          if (!await agentAlive(member.agentId, workspaceId)) {
            await finishIfCurrent(runId, member, Date.now(), "failed", "(the member's agent stopped or its terminal was closed)");
            continue;
          }
          const state2 = orca().stateOf(member.agentId);
          const turn = await memberTurnEnded(member.agentId, member);
          const ended = state2 === "done" || state2 === "waiting" ? turn.ended || stale : turn.ended;
          if (ended) {
            const message = reports.get(member.agentId) ?? turn.text ?? await lastMessage(member.agentId);
            reports.delete(member.agentId);
            await finishIfCurrent(runId, member, Date.now(), "completed", message);
            continue;
          }
        }
        const waiting = /attention|blocked|waitingOnHuman|permission/i.test(dispatch2.activity ?? "");
        await store.mutate(runId, (current) => {
          const live = memberOf(current, member.agentId);
          if (!live || live.state !== "working" && live.state !== "attention") return current;
          const next = waiting ? "attention" : "working";
          return live.state === next ? current : updateMember(current, member.agentId, { state: next }, now());
        });
        continue;
      }
    }
    if (!await agentAlive(member.agentId, workspaceId)) {
      await finishIfCurrent(runId, member, Date.now(), "failed", "(the member's agent stopped or its terminal was closed)");
      continue;
    }
    const state = orca().stateOf(member.agentId);
    if (state === "blocked") {
      if (member.state !== "attention") await store.mutate(runId, (current) => memberOf(current, member.agentId)?.state === "working" ? updateMember(current, member.agentId, { state: "attention" }, now()) : current);
    } else if (state === "done" || state === "waiting") {
      const turn = await memberTurnEnded(member.agentId, member);
      if (turn.ended || Date.now() - Date.parse(member.dispatchedAt) > 6e5) {
        const message = reports.get(member.agentId) ?? turn.text ?? await lastMessage(member.agentId);
        reports.delete(member.agentId);
        await finishIfCurrent(runId, member, Date.now(), "completed", message);
      }
    } else if (member.state === "attention") {
      await store.mutate(runId, (current) => memberOf(current, member.agentId)?.state === "attention" ? updateMember(current, member.agentId, { state: "working" }, now()) : current);
    }
  }
  await advance(runId);
}
function outcomeOf(dispatch2, mainAgent) {
  return dispatch2 ? Orchestra.settled(dispatch2).outcome : mainAgent?.outcome === "failure" ? "failed" : mainAgent?.outcome === "cancellation" || mainAgent?.outcome === "interruption" ? "canceled" : "completed";
}
async function onAgentStatus(payload) {
  const terminalId = payload.terminalId;
  if (!terminalId) return;
  await store.load();
  if (payload.state === "working") seenWorking.set(terminalId, Date.now());
  const lead = store.lead(terminalId);
  if (lead && payload.sessionId && lead.agentSessionId !== payload.sessionId) await store.patchLead(terminalId, { agentSessionId: payload.sessionId });
  const run = store.memberRun(terminalId);
  const member = run ? memberOf(run, terminalId) : void 0;
  if (run && member) {
    if (payload.state === "blocked" && member.state === "working") await store.mutate(run.id, (current) => updateMember(current, terminalId, { state: "attention" }, now()));
    if (payload.state === "working" && member.state === "attention") await store.mutate(run.id, (current) => updateMember(current, terminalId, { state: "working" }, now()));
    if (payload.state === "done" && (member.state === "working" || member.state === "attention")) {
      const session = store.member(terminalId);
      let dispatch2 = null;
      if (orchestra?.governs(session)) dispatch2 = Orchestra.informative(await orchestra.show(session.dispatchId));
      if (dispatch2) {
        if (Orchestra.settled(dispatch2).settled) {
          const message = reports.get(terminalId) ?? await lastMessage(terminalId);
          reports.delete(terminalId);
          await finishIfCurrent(run.id, member, Date.now(), outcomeOf(dispatch2, payload.mainAgent), message);
          await advance(run.id);
        } else if (reports.has(terminalId)) {
          const message = reports.get(terminalId);
          reports.delete(terminalId);
          await finishIfCurrent(run.id, member, Date.now(), "completed", message);
          await advance(run.id);
        }
      } else {
        const turn = await memberTurnEnded(terminalId, member);
        if (turn.ended) {
          const message = reports.get(terminalId) ?? turn.text ?? await lastMessage(terminalId);
          reports.delete(terminalId);
          await finishIfCurrent(run.id, member, Date.now(), outcomeOf(null, payload.mainAgent), message);
          await advance(run.id);
        }
      }
    }
  }
  const planner = store.planner(terminalId);
  if (planner && planner.status === "planning" && payload.state === "done") await finishPlanner(terminalId);
  if (lead && payload.state === "done") {
    for (const delay of [0, 1500, 4e3, 9e3]) {
      if (delay) await sleep(delay);
      if (await trySummarize(terminalId)) break;
    }
    const led = store.leadRun(terminalId, true);
    if (led) await advance(led.id);
  }
}
async function finishPlanner(terminalId) {
  const job = store.planner(terminalId);
  if (!job || job.status !== "planning") return;
  const since = Date.parse(job.startedAt);
  for (const delay of [0, 1500, 4e3]) {
    if (delay) await sleep(delay);
    const turn = await claudeTurn(job.root, orca().agents.get(terminalId)?.sessionId ?? null);
    if (turn.found && !(turn.ended && turn.endedAt >= since)) continue;
    const parsed = parseTeam(await readFile3(join5(job.root, job.file), "utf8").catch(() => ""));
    await store.setPlanner({ ...job, status: parsed.ok ? "done" : "failed", errors: parsed.ok ? [] : parsed.errors, endedAt: now() });
    if (parsed.ok) {
      const workspaces = await orca().listWorkspaces().catch(() => []);
      const row = workspaces.find((entry) => entry.path === job.root);
      if (row) await orca().openFile(row.id, job.file).catch(() => void 0);
      await orca().notify("Ensemble", `${job.file}`);
    }
    return;
  }
}
async function trySummarize(leadId) {
  const newest = store.leadRun(leadId, false);
  const batch = newest ? batchToSummarize(newest) : void 0;
  if (!newest || !batch) return true;
  const collected = newest.events.filter((event) => event.component === "reports" && event.action === "collect").at(-1)?.at;
  const turn = await turnEnded(leadId, collected ? Date.parse(collected) : Date.parse(batch.at));
  const summary = turn.ended === true ? turn.text : turn.ended === null && orca().isIdle(leadId) ? await lastMessage(leadId) : null;
  if (!summary) return false;
  await asActor("lead", () => store.mutate(newest.id, (current) => summarizeBatch(current, summary, now())));
  return true;
}
var sweeping = null;
function startSweep() {
  if (!sweeping) {
    sweeping = setInterval(() => {
      for (const run of store.activeRuns()) void reconcile(run.id).catch((error2) => orca().orca.log(`sweep of ${run.id} failed: ${String(error2)}`));
      for (const lead of store.leads().filter((entry) => !entry.endedAt && orca().isIdle(entry.terminalId))) void trySummarize(lead.terminalId).catch(() => void 0);
    }, 3e4);
    sweeping.unref?.();
  }
  return () => {
    if (sweeping) clearInterval(sweeping);
    sweeping = null;
  };
}
async function withLeadMail(leadId, result, lang) {
  const run = store.leadRun(leadId, false);
  if (!run || run.mode !== "team") return result;
  const mail = leadInbox(run);
  const plans = pendingPlans(run);
  if (!mail.length && !plans.length) return result;
  if (mail.length) await store.mutate(run.id, (current) => markInbox(current, "lead", mail.at(-1).seq, now()));
  const zh = lang === "zh";
  const extra = [
    inboxText(mail, lang),
    plans.length ? `${zh ? `\u{1F4DD} \u7B49\u4F60\u5BA1\u6279\u7684\u8BA1\u5212\uFF08${LEAD_TOOLS.tasks}\uFF0Creview\uFF09\uFF1A` : `\u{1F4DD} Plans waiting for your approval (${LEAD_TOOLS.tasks}, review):`}
${plans.map((task) => `- ${task.id} "${task.title}" ${zh ? "\u63D0\u4EA4\u8005" : "by"} ${task.ownerTitle}: ${excerpt(task.plan.text, 400)}`).join("\n")}` : ""
  ].filter(Boolean).join("\n\n");
  return { ...result, text: `${result.text ?? ""}

${extra}` };
}
async function withMail(runId, agentId, result) {
  const run = store.get(runId);
  if (!run) return result;
  const mail = inboxOf(run, agentId);
  const verdicts = undeliveredVerdicts(run).filter((task) => task.owner === agentId);
  if (!mail.length && !verdicts.length) return result;
  await store.mutate(runId, (current) => {
    const read = mail.length ? markInbox(current, agentId, mail.at(-1).seq, now()) : current;
    const delivered = verdicts.length ? markVerdictsDelivered(read, verdicts.map((task) => task.id), true, now()) : read;
    return logEvents(delivered, verdicts.map((task) => ({ component: "plans", action: "verdict", direction: "out", from: "plugin", to: [agentId], subject: task.id, note: task.plan?.status ?? "" })), now());
  });
  const P = promptsFor(run.language);
  const heading = run.language === "zh" ? "\u{1F9FE} \u534F\u8C03\u5668\u5BF9\u4F60\u7684\u8BA1\u5212\u4F5C\u51FA\u4E86\u51B3\u5B9A\uFF1A" : "\u{1F9FE} The lead decided on your plans:";
  const extra = [inboxText(mail, run.language), verdicts.length ? `${heading}
${verdicts.map((task) => `- ${P.verdictLine(task)}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
  return { ...result, text: `${result.text ?? ""}

${extra}` };
}
async function lockIfAuto(ctx, leadId, mode) {
  if (ctx.effective === "auto" && !ctx.locked) await store.lockSession(leadId, mode);
}
function mirrorTask(run, role, agentId, title, task) {
  const result = addTasks(run, [{ title: excerpt(task.split("\n").find((line) => line.trim()) ?? task, 80), detail: task, role }], "lead", now());
  const id = result.added[0]?.id;
  const mirrored = { ...result.run, tasks: result.run.tasks.map((entry) => entry.id === id ? { ...entry, state: "doing", owner: agentId, ownerTitle: title } : entry) };
  return id ? attachPacket(mirrored, id) : mirrored;
}
function contextEvent(agentId, spec, continued, note = "") {
  return { component: "contexts", action: continued ? "continue" : "start", direction: "out", from: "plugin", to: [agentId], subject: spec.name, note: note || runtimeLabel(spec) };
}
function leadTeamRun(leadId) {
  const run = store.leadRun(leadId, false);
  return run?.mode === "team" ? run : void 0;
}
function nextStepPending(run) {
  const step = nextStep(run);
  return step.kind === "dispatch" || step.kind === "verdicts" || step.kind === "next-round";
}
async function memberTeamRun(agentId) {
  const found = store.memberRun(agentId);
  const seen = found ? memberOf(found, agentId) : void 0;
  if (!found || !seen || found.mode !== "team") return null;
  const run = seen.state === "done" && !seen.retired ? await store.mutate(found.id, (current) => touchMember(current, agentId, now())) : found;
  return { run, member: memberOf(run, agentId) };
}
function overlappingRoles(specs) {
  const pairs = [];
  for (let i = 0; i < specs.length; i += 1) {
    for (let j = i + 1; j < specs.length; j += 1) {
      const a = specs[i];
      const b = specs[j];
      const left = a.folders.length ? a.folders : [""];
      const right = b.folders.length ? b.folders : [""];
      if (left.some((x) => right.some((y) => pathsOverlap(x, y)))) pairs.push([a.name, b.name]);
    }
  }
  return pairs;
}
function buildTools(lang) {
  const zh = lang === "zh";
  const tr = (en, cn) => zh ? cn : en;
  const P = promptsFor(lang);
  const L = LEAD_TOOLS;
  const leadMail = (leadId, result) => withLeadMail(leadId, result, lang);
  const modeName = (mode) => zh ? { auto: "\u81EA\u52A8", team: "\u56E2\u961F", delegation: "\u59D4\u6D3E", none: "\u65E0" }[mode] : mode;
  const MODE_HINT = zh ? {
    auto: `\u6309\u9700\u6C42\u9009\u62E9\uFF1A\u56E2\u961F\u6A21\u5F0F\uFF08\u5148\u4E0E\u7528\u6237\u5BF9\u63A5\u9700\u6C42\uFF0C${L.brief}\uFF0C\u7528\u6237\u786E\u8BA4\u540E ${L.kickoff}\uFF09\u6216\u59D4\u6D3E\u6A21\u5F0F\uFF08${L.delegate}\uFF09\u3002\u7B2C\u4E00\u6B21\u542F\u52A8\u8FD0\u884C\u540E\uFF0C\u672C\u4F1A\u8BDD\u5C31\u56FA\u5B9A\u4E3A\u90A3\u4E2A\u6A21\u5F0F\u3002`,
    team: `\u56E2\u961F\u6A21\u5F0F\uFF1A\u5148\u548C\u7528\u6237\u786E\u5B9A\u9700\u6C42\u7B80\u62A5\u4E0E\u4EFB\u52A1\u8BA1\u5212\uFF08${L.brief}\uFF09\uFF0C\u518D ${L.kickoff}\u3002${L.delegate} \u4F1A\u88AB\u62D2\u7EDD\u3002`,
    delegation: `\u59D4\u6D3E\u6A21\u5F0F\uFF1A\u62C6\u5206\u9700\u6C42\u540E\u8FD0\u884C ${L.delegate}\u3002${L.kickoff} \u4F1A\u88AB\u62D2\u7EDD\u3002`,
    none: `\u65E0\u534F\u4F5C\uFF1A\u4F60\u81EA\u5DF1\u5B8C\u6210\u5DE5\u4F5C\uFF0C\u4E0D\u542F\u52A8\u4EFB\u4F55\u6210\u5458\u3002${L.delegate} \u548C ${L.kickoff} \u4F1A\u88AB\u62D2\u7EDD\u3002`
  } : {
    auto: `Pick per request: team mode (intake with the user, ${L.brief}, confirmation, ${L.kickoff}) or delegation mode (${L.delegate}). The first run you start fixes the session to that mode.`,
    team: `Team mode: agree a brief and a task plan with the user first (${L.brief}), then ${L.kickoff}. ${L.delegate} is refused.`,
    delegation: `Delegation mode: split the request and run ${L.delegate}. ${L.kickoff} is refused.`,
    none: `No collaboration: do the work yourself and start no members. ${L.delegate} and ${L.kickoff} are refused.`
  };
  const refusal = (ctx) => {
    if (ctx.locked) {
      return tr(
        `This session is locked to ${ctx.locked} mode: in auto mode, the first run fixed it for the whole session. ${MODE_HINT[ctx.locked]} Only resetting the session changes it.`,
        `\u672C\u4F1A\u8BDD\u5DF2\u9501\u5B9A\u4E3A${modeName(ctx.locked)}\u6A21\u5F0F\uFF1A\u81EA\u52A8\u6A21\u5F0F\u4E0B\u7B2C\u4E00\u6B21\u8FD0\u884C\u5C31\u56FA\u5B9A\u4E86\u6574\u4E2A\u4F1A\u8BDD\u7684\u6A21\u5F0F\u3002${MODE_HINT[ctx.locked]} \u53EA\u6709\u91CD\u7F6E\u4F1A\u8BDD\u624D\u80FD\u66F4\u6539\u3002`
      );
    }
    const how = ctx.override ? tr("The user switched this session to it", "\u7528\u6237\u4E3A\u672C\u4F1A\u8BDD\u5207\u6362\u5230\u4E86\u8BE5\u6A21\u5F0F") : tr("The team file sets it", "\u6765\u81EA\u56E2\u961F\u6587\u4EF6");
    return tr(
      `This session is in ${ctx.effective} mode (${how}). ${MODE_HINT[ctx.effective]} The user can switch the mode with the "Mode" button on your chat's composer.`,
      `\u672C\u4F1A\u8BDD\u5904\u4E8E${modeName(ctx.effective)}\u6A21\u5F0F\uFF08${how}\uFF09\u3002${MODE_HINT[ctx.effective]} \u7528\u6237\u53EF\u4EE5\u7528\u5BF9\u8BDD\u8F93\u5165\u6846\u65C1\u7684\u300C\u6A21\u5F0F\u300D\u6309\u94AE\u5207\u6362\u3002`
    );
  };
  const hint = (ctx) => {
    const fixed = ctx.team.roles.map((role) => role.name);
    const formed = ctx.sessionRoles.map((role) => role.name);
    return [
      fixed.length ? tr(`Roles: ${fixed.join(", ")}.`, `\u56FA\u5B9A\u89D2\u8272\uFF1A${fixed.join(", ")}\u3002`) : "",
      formed.length ? tr(`Roles you formed: ${formed.join(", ")}.`, `\u4F60\u5EFA\u7684\u89D2\u8272\uFF1A${formed.join(", ")}\u3002`) : "",
      ctx.team.candidates.length ? tr(`Candidates: ${ctx.team.candidates.map((candidate) => candidate.name).join(", ")}. Give one work under a job name: role "tester" and candidate "<name>"; or form a role on one with ${L.role}.`, `\u5019\u9009\u6210\u5458\uFF1A${ctx.team.candidates.map((candidate) => candidate.name).join(", ")}\u3002\u4EA4\u7ED9\u5019\u9009\u6210\u5458\u7684\u5DE5\u4F5C\u8981\u8D77\u4E00\u4E2A\u5C97\u4F4D\u540D\uFF1Arole \u586B "tester" \u8FD9\u6837\u7684\u5C97\u4F4D\uFF0Ccandidate \u586B\u5019\u9009\u6210\u5458\u540D\uFF1B\u4E5F\u53EF\u4EE5\u7528 ${L.role} \u5728\u67D0\u4E2A\u5019\u9009\u4E0A\u5EFA\u89D2\u8272\u3002`) : tr(`Or "${HELPER}".`, `\u6216\u8005\u7528 "${HELPER}"\u3002`)
    ].filter(Boolean).join(" ");
  };
  const unknownRole = (ctx, role) => tr(`Unknown role "${role}". ${hint(ctx)}`, `\u672A\u77E5\u89D2\u8272\u300C${role}\u300D\u3002${hint(ctx)}`);
  const notAJob = (name2) => tr(
    `${name2} is a candidate, not a job. Name the job in role (such as api, tester or docs) and the candidate in candidate: {"role": "tester", "candidate": "${name2}"}.`,
    `${name2} \u662F\u5019\u9009\u6210\u5458\uFF0C\u4E0D\u662F\u5C97\u4F4D\u3002\u8BF7\u5728 role \u91CC\u5199\u5C97\u4F4D\u540D\uFF08\u4F8B\u5982 api\u3001tester \u6216 docs\uFF09\uFF0C\u5728 candidate \u91CC\u5199\u5019\u9009\u6210\u5458\uFF1A{"role": "tester", "candidate": "${name2}"}\u3002`
  );
  const jobRole = (ctx, role, candidate) => {
    const name2 = role.trim();
    const wanted = candidate?.trim() ?? "";
    const fixed = ctx.team.roles.find((entry) => key(entry.name) === key(name2));
    const formed = ctx.sessionRoles.find((entry) => key(entry.name) === key(name2));
    if (fixed && wanted) return tr(`${fixed.name} is a fixed role of the team; it runs on its own model, so give it work without a candidate, or name another job.`, `${fixed.name} \u662F\u56E2\u961F\u7684\u56FA\u5B9A\u89D2\u8272\uFF0C\u8FD0\u884C\u5728\u81EA\u5DF1\u7684\u6A21\u578B\u4E0A\uFF1B\u4EA4\u7ED9\u5B83\u7684\u5DE5\u4F5C\u4E0D\u8981\u5E26 candidate\uFF0C\u6216\u8005\u53E6\u8D77\u4E00\u4E2A\u5C97\u4F4D\u540D\u3002`);
    if (formed && wanted && key(formed.candidate) !== key(wanted)) return tr(`${formed.name} runs on ${formed.candidate}. Move it with ${L.role} (name "${formed.name}", candidate "${wanted}") first, or name another job.`, `${formed.name} \u8FD0\u884C\u5728 ${formed.candidate} \u4E0A\u3002\u8BF7\u5148\u7528 ${L.role}\uFF08name "${formed.name}"\uFF0Ccandidate "${wanted}"\uFF09\u628A\u5B83\u6362\u8FC7\u53BB\uFF0C\u6216\u8005\u53E6\u8D77\u4E00\u4E2A\u5C97\u4F4D\u540D\u3002`);
    if (fixed || formed) {
      const spec2 = roleSpec(ctx, name2);
      return spec2 ? { spec: spec2, form: null } : unknownRole(ctx, name2);
    }
    const isCandidate = ctx.team.candidates.some((entry) => key(entry.name) === key(name2));
    if (wanted) {
      const pick2 = ctx.team.candidates.find((entry) => key(entry.name) === key(wanted));
      const list = ctx.team.candidates.map((entry) => `${entry.name} (${runtimeLabel(entry)})`).join(", ");
      if (!pick2) return ctx.team.candidates.length ? tr(`There is no candidate "${wanted}". Candidates: ${list}.`, `\u6CA1\u6709\u5019\u9009\u6210\u5458\u300C${wanted}\u300D\u3002\u5019\u9009\u6210\u5458\uFF1A${list}\u3002`) : tr(`This team has no candidate members, so it uses its fixed roles. ${hint(ctx)}`, `\u8FD9\u4E2A\u56E2\u961F\u6CA1\u6709\u5019\u9009\u6210\u5458\uFF0C\u53EA\u7528\u56FA\u5B9A\u89D2\u8272\u3002${hint(ctx)}`);
      if (RESERVED.has(key(name2))) return tr(`"${name2}" is reserved; pick another job name.`, `\u300C${name2}\u300D\u662F\u4FDD\u7559\u540D\uFF0C\u8BF7\u6362\u4E00\u4E2A\u5C97\u4F4D\u540D\u3002`);
      if (isCandidate) return notAJob(name2);
      const form = { name: name2, candidate: pick2.name, agent: pick2.agent, model: pick2.model, effort: pick2.effort, folders: [], instructions: pick2.notes.trim(), createdAt: now() };
      const spec2 = roleSpec({ ...ctx, sessionRoles: [...ctx.sessionRoles, form] }, name2);
      return spec2 ? { spec: spec2, form } : unknownRole(ctx, name2);
    }
    if (isCandidate) return notAJob(name2);
    const spec = roleSpec(ctx, name2);
    return spec ? { spec, form: null } : unknownRole(ctx, name2);
  };
  const jobRoles = (ctx, asks) => {
    let working = ctx;
    const specs = [];
    const formed = [];
    for (const ask of asks) {
      const result = jobRole(working, ask.role, ask.candidate);
      if (typeof result === "string") return result;
      if (result.form) {
        working = { ...working, sessionRoles: [...working.sessionRoles, result.form] };
        formed.push(result.form);
      }
      specs.push(result.spec);
    }
    return { ctx: working, specs, formed };
  };
  const memberLine = (title, spec) => key(title) === key(spec.name) ? `${title} (${runtimeLabel(spec)})` : `${title} (${spec.name}, ${runtimeLabel(spec)})`;
  const rosterText = (ctx) => {
    const { team } = ctx;
    const lines = [];
    if (team.roles.length) {
      lines.push(tr("Fixed roles:", "\u56FA\u5B9A\u89D2\u8272\uFF1A"), tr("| Role | Agent/model | Folders |", "| \u89D2\u8272 | Agent/\u6A21\u578B | \u6587\u4EF6\u5939 |"), "| --- | --- | --- |", ...team.roles.map((role) => `| ${role.name} | ${runtimeLabel(role)} | ${role.folders.length ? role.folders.join(", ") : tr("(any)", "\uFF08\u4E0D\u9650\uFF09")} |`));
    }
    if (team.candidates.length) {
      lines.push("", tr("Candidate members (give one work under a job name: role is the job, such as tester, candidate is the candidate; assign by description, and never give a candidate work its description rules out):", "\u5019\u9009\u6210\u5458\uFF08\u4EA4\u7ED9\u5B83\u4EEC\u7684\u5DE5\u4F5C\u8981\u8D77\u4E00\u4E2A\u5C97\u4F4D\u540D\uFF1Arole \u662F\u5C97\u4F4D\uFF0C\u4F8B\u5982 tester\uFF0Ccandidate \u662F\u5019\u9009\u6210\u5458\uFF1B\u6309\u63CF\u8FF0\u5206\u5DE5\uFF0C\u63CF\u8FF0\u91CC\u6392\u9664\u7684\u5DE5\u4F5C\u7EDD\u4E0D\u4EA4\u7ED9\u5B83\uFF09\uFF1A"));
      for (const candidate of team.candidates) {
        lines.push(`- ${candidate.name} (${runtimeLabel(candidate)})`, ...candidate.notes.trim() ? candidate.notes.trim().split("\n").map((line) => `  ${line.trim()}`) : [tr("  (no description)", "  \uFF08\u65E0\u63CF\u8FF0\uFF09")]);
      }
      lines.push("", ctx.sessionRoles.length ? tr("Roles you formed in this session:", "\u672C\u4F1A\u8BDD\u4E2D\u4F60\u5EFA\u7684\u89D2\u8272\uFF1A") : tr("Roles you formed in this session: none.", "\u672C\u4F1A\u8BDD\u4E2D\u4F60\u5EFA\u7684\u89D2\u8272\uFF1A\u65E0\u3002"));
      if (ctx.sessionRoles.length) lines.push(tr("| Role | Candidate | Folders | Instructions |", "| \u89D2\u8272 | \u5019\u9009\u6210\u5458 | \u6587\u4EF6\u5939 | \u8BF4\u660E |"), "| --- | --- | --- | --- |", ...ctx.sessionRoles.map((role) => `| ${role.name} | ${role.candidate} (${runtimeLabel(role)}) | ${role.folders.length ? role.folders.join(", ") : tr("(any)", "\uFF08\u4E0D\u9650\uFF09")} | ${excerpt(role.instructions, 120) || "-"} |`));
    } else {
      lines.push(`| ${HELPER} | ${runtimeLabel(team.lead)} | ${tr("(any; delegation only, when no role fits)", "\uFF08\u4E0D\u9650\uFF1B\u4EC5\u59D4\u6D3E\u6A21\u5F0F\uFF0C\u6CA1\u6709\u5408\u9002\u89D2\u8272\u65F6\u4F7F\u7528\uFF09")} |`);
    }
    return lines.join("\n");
  };
  const teamSpecs = (ctx, names, tasks) => {
    const fromTasks = tasks.map((task) => task.role).filter((role) => !!role);
    const wanted = names?.length ? names : fromTasks.length ? fromTasks : ctx.team.roles.length ? ctx.team.roles.map((role) => role.name) : ctx.sessionRoles.map((role) => role.name);
    if (!wanted.length) return tr(`No roles yet. ${hint(ctx)}`, `\u8FD8\u6CA1\u6709\u89D2\u8272\u3002${hint(ctx)}`);
    const specs = [];
    for (const name2 of [...wanted, ...fromTasks]) {
      const spec = roleSpec(ctx, name2);
      if (!spec || spec.name === HELPER) return unknownRole(ctx, name2);
      if (!specs.some((entry) => key(entry.name) === key(spec.name))) specs.push(spec);
    }
    return specs;
  };
  const planText = (tasks) => tasks.map((task, index) => `${index + 1}. ${task.title} (${task.role ?? tr("anyone", "\u4EFB\u4F55\u4EBA")})${task.after?.length ? ` \xB7 ${tr("after", "\u7B49\u5F85")} ${task.after.join(", ")}` : ""}${task.files?.length ? ` \xB7 ${tr("files", "\u6587\u4EF6")}: ${task.files.join(", ")}` : ""}${task.detail ? `
   ${task.detail}` : ""}`);
  const resultsText = (run) => {
    if (run.mode === "team") {
      const unread = run.posts.filter((post) => post.seq > run.leadReadSeq).length;
      const page = boardPage(run, run.leadReadSeq, BOARD_LIMIT);
      return { text: [runSummary(run), "", tr(`Board since your last read (${unread} posts):`, `\u4F60\u4E0A\u6B21\u8BFB\u53D6\u540E\u7684\u9ED1\u677F\uFF08${unread} \u6761\uFF09\uFF1A`), page.text, page.more ? tr(`Read the rest with ${L.board}.`, `\u5176\u4F59\u5185\u5BB9\u7528 ${L.board} \u8BFB\u53D6\u3002`) : ""].filter(Boolean).join("\n"), readSeq: page.lastSeq };
    }
    const state = (member) => zh ? { working: "\u8FDB\u884C\u4E2D", done: "\u5DF2\u5B8C\u6210", attention: "\u9700\u5904\u7406", failed: "\u5931\u8D25" }[member.state] : member.state;
    const members2 = run.members.map((member) => [`## ${memberName(member, zh)}: ${state(member)}`, member.state === "working" || member.state === "attention" ? tr("(no result yet)", "\uFF08\u8FD8\u6CA1\u6709\u7ED3\u679C\uFF09") : member.result ?? tr("(finished without a final reply)", "\uFF08\u7ED3\u675F\u65F6\u6CA1\u6709\u6700\u7EC8\u56DE\u590D\uFF09")].join("\n"));
    return { text: [runSummary(run), "", ...members2].join("\n\n"), readSeq: run.leadReadSeq };
  };
  const notInTeam = tr("You are not in a team run right now, so there is no board. Report in your final reply; the lead reads it.", "\u4F60\u73B0\u5728\u4E0D\u5728\u56E2\u961F\u8FD0\u884C\u4E2D\uFF0C\u6CA1\u6709\u9ED1\u677F\u3002\u8BF7\u5728\u6700\u7EC8\u56DE\u590D\u91CC\u6C47\u62A5\uFF0C\u534F\u8C03\u5668\u4F1A\u9605\u8BFB\u3002");
  const statusTool = defineTool({
    name: L.status,
    title: tr("Team status", "\u56E2\u961F\u72B6\u6001"),
    description: tr(
      "The team's roles and candidate members, this session's collaboration mode (team, delegation, auto or none), the roles you formed and the run in progress. Call it before acting on each request.",
      "\u56E2\u961F\u7684\u89D2\u8272\u548C\u5019\u9009\u6210\u5458\u3001\u672C\u4F1A\u8BDD\u7684\u534F\u4F5C\u6A21\u5F0F\uFF08\u56E2\u961F\u3001\u59D4\u6D3E\u3001\u81EA\u52A8\u6216\u65E0\uFF09\u3001\u4F60\u5EFA\u7684\u89D2\u8272\u4EE5\u53CA\u8FDB\u884C\u4E2D\u7684\u8FD0\u884C\u3002\u5904\u7406\u6BCF\u4E2A\u9700\u6C42\u524D\u5148\u8C03\u7528\u5B83\u3002"
    ),
    input: object({}),
    async execute(_input, { agent }) {
      const ctx = await leadContext(agent);
      const run = store.leadRun(agent.id, false);
      const source = ctx.locked ? tr(" (auto settled on it; locked for this session)", "\uFF08\u81EA\u52A8\u6A21\u5F0F\u5DF2\u786E\u5B9A\uFF0C\u672C\u4F1A\u8BDD\u9501\u5B9A\uFF09") : ctx.override ? tr(` (switched by the user for this session; the team file says ${ctx.team.mode})`, `\uFF08\u7528\u6237\u4E3A\u672C\u4F1A\u8BDD\u5207\u6362\uFF1B\u56E2\u961F\u6587\u4EF6\u8BBE\u7F6E\u4E3A ${modeName(ctx.team.mode)}\uFF09`) : tr(" (from the team file)", "\uFF08\u6765\u81EA\u56E2\u961F\u6587\u4EF6\uFF09");
      return leadMail(agent.id, ok([
        tr(`Team file: ${ctx.file}`, `\u56E2\u961F\u6587\u4EF6\uFF1A${ctx.file}`) + (ctx.team.goal.trim() ? tr(` \xB7 goal: ${ctx.team.goal.trim()}`, ` \xB7 \u76EE\u6807\uFF1A${ctx.team.goal.trim()}`) : ""),
        tr(`Mode: ${ctx.effective}${source}.`, `\u6A21\u5F0F\uFF1A${modeName(ctx.effective)}${source}\u3002`),
        MODE_HINT[ctx.effective],
        "",
        rosterText(ctx),
        "",
        run ? runSummary(run) : tr("No run yet.", "\u8FD8\u6CA1\u6709\u8FD0\u884C\u3002")
      ].join("\n"), { mode: ctx.effective, configured: ctx.team.mode, override: ctx.override, locked: ctx.locked, run: run ? { id: run.id, mode: run.mode, status: run.status, round: run.round, rounds: run.rounds } : null }));
    }
  });
  const roleTool = defineTool({
    name: L.role,
    title: tr("Form a role", "\u5EFA\u89D2\u8272"),
    description: tr(
      "With candidate members: form a role for this session on one candidate with its own instructions and folders, change its candidate, or remove it. Giving work with a role name and a candidate forms the role by itself, so this is only needed for instructions, folders or a move. A role can only run on a candidate's agent and model.",
      "\u6709\u5019\u9009\u6210\u5458\u65F6\uFF1A\u5728\u67D0\u4E2A\u5019\u9009\u4E0A\u4E3A\u672C\u4F1A\u8BDD\u5EFA\u4E00\u4E2A\u6709\u81EA\u5DF1\u8BF4\u660E\u548C\u6587\u4EF6\u5939\u7684\u89D2\u8272\uFF0C\u66F4\u6362\u5B83\u7684\u5019\u9009\uFF0C\u6216\u5220\u9664\u5B83\u3002\u6D3E\u5DE5\u65F6\u5199\u4E86\u5C97\u4F4D\u540D\uFF08role\uFF09\u548C\u5019\u9009\u6210\u5458\uFF08candidate\uFF09\u5C31\u4F1A\u81EA\u52A8\u5EFA\u597D\u89D2\u8272\uFF0C\u6240\u4EE5\u53EA\u6709\u8981\u8BBE\u7F6E\u8BF4\u660E\u3001\u6587\u4EF6\u5939\u6216\u66F4\u6362\u5019\u9009\u65F6\u624D\u9700\u8981\u5B83\u3002\u89D2\u8272\u53EA\u80FD\u8FD0\u884C\u5728\u5019\u9009\u6210\u5458\u7684 agent \u548C\u6A21\u578B\u4E0A\u3002"
    ),
    input: object({
      name: string2().min(1).describe(tr("Short lowercase role name, such as api or tester", "\u7B80\u77ED\u7684\u5C0F\u5199\u89D2\u8272\u540D\uFF0C\u4F8B\u5982 api \u6216 tester")),
      candidate: string2().optional().describe(tr("The candidate member to run it on; required for a new role", "\u8FD0\u884C\u5B83\u7684\u5019\u9009\u6210\u5458\uFF1B\u65B0\u89D2\u8272\u5FC5\u586B")),
      instructions: string2().optional().describe(tr("What the role does and how; repeated in each task it gets", "\u8FD9\u4E2A\u89D2\u8272\u505A\u4EC0\u4E48\u3001\u600E\u4E48\u505A\uFF1B\u4F1A\u9644\u5728\u5B83\u7684\u6BCF\u4E2A\u4EFB\u52A1\u91CC")),
      folders: array(string2()).optional().describe(tr("Folders the role owns; empty for no limit", "\u89D2\u8272\u8D1F\u8D23\u7684\u6587\u4EF6\u5939\uFF1B\u4E3A\u7A7A\u8868\u793A\u4E0D\u9650")),
      remove: boolean2().optional().describe(tr("Remove the role instead", "\u6539\u4E3A\u5220\u9664\u8FD9\u4E2A\u89D2\u8272"))
    }),
    async execute({ name: name2, candidate, instructions, folders, remove }, { agent }) {
      const ctx = await leadContext(agent);
      if (!ctx.team.candidates.length) return fail(tr(`This team has no candidate members, so it uses its fixed roles: ${ctx.team.roles.map((role2) => role2.name).join(", ")}.`, `\u8FD9\u4E2A\u56E2\u961F\u6CA1\u6709\u5019\u9009\u6210\u5458\uFF0C\u53EA\u7528\u56FA\u5B9A\u89D2\u8272\uFF1A${ctx.team.roles.map((role2) => role2.name).join(", ")}\u3002`));
      const roleName = name2.trim();
      if (RESERVED.has(key(roleName))) return fail(tr(`"${roleName}" is reserved; pick another name.`, `\u300C${roleName}\u300D\u662F\u4FDD\u7559\u540D\uFF0C\u8BF7\u6362\u4E00\u4E2A\u3002`));
      if (ctx.team.roles.some((role2) => key(role2.name) === key(roleName))) return fail(tr(`"${roleName}" is a fixed role of the team; pick another name.`, `\u300C${roleName}\u300D\u662F\u56E2\u961F\u7684\u56FA\u5B9A\u89D2\u8272\uFF0C\u8BF7\u6362\u4E00\u4E2A\u540D\u5B57\u3002`));
      if (ctx.team.candidates.some((entry) => key(entry.name) === key(roleName))) return fail(tr(`"${roleName}" is a candidate's name, not a job; name the role after its job, such as api or tester.`, `\u300C${roleName}\u300D\u662F\u5019\u9009\u6210\u5458\u7684\u540D\u5B57\uFF0C\u4E0D\u662F\u5C97\u4F4D\uFF1B\u8BF7\u6309\u5C97\u4F4D\u7ED9\u89D2\u8272\u8D77\u540D\uFF0C\u4F8B\u5982 api \u6216 tester\u3002`));
      const existing = ctx.sessionRoles.find((role2) => key(role2.name) === key(roleName));
      const active = store.leadRun(agent.id, true);
      const busy2 = active?.members.some((member) => !member.retired && key(member.role) === key(roleName) && (member.state === "working" || member.state === "attention"));
      if (remove) {
        if (!existing) return fail(tr(`There is no role "${roleName}" you formed.`, `\u4F60\u6CA1\u6709\u5EFA\u8FC7\u89D2\u8272\u300C${roleName}\u300D\u3002`));
        if (busy2) return fail(tr(`A member of ${roleName} is still working. Run ${L.wait} first.`, `${roleName} \u7684\u6210\u5458\u8FD8\u5728\u5DE5\u4F5C\uFF0C\u8BF7\u5148\u8FD0\u884C ${L.wait}\u3002`));
        await store.setSessionRoles(agent.id, ctx.sessionRoles.filter((role2) => role2 !== existing));
        if (active) await store.mutate(active.id, (current) => retireRole(current, roleName, now()));
        return leadMail(agent.id, ok(tr(`Removed ${roleName}.`, `\u5DF2\u5220\u9664 ${roleName}\u3002`)));
      }
      const pick2 = candidate ? ctx.team.candidates.find((entry) => key(entry.name) === key(candidate)) : existing ? ctx.team.candidates.find((entry) => key(entry.name) === key(existing.candidate)) : void 0;
      const list = ctx.team.candidates.map((entry) => `${entry.name} (${runtimeLabel(entry)})`).join(", ");
      if (!pick2) return fail(candidate ? tr(`There is no candidate "${candidate}". Candidates: ${list}.`, `\u6CA1\u6709\u5019\u9009\u6210\u5458\u300C${candidate}\u300D\u3002\u5019\u9009\u6210\u5458\uFF1A${list}\u3002`) : tr(`Pick a candidate for the new role. Candidates: ${list}.`, `\u8BF7\u4E3A\u65B0\u89D2\u8272\u9009\u62E9\u4E00\u4E2A\u5019\u9009\u6210\u5458\u3002\u5019\u9009\u6210\u5458\uFF1A${list}\u3002`));
      const moved = existing !== void 0 && (existing.agent !== pick2.agent || existing.model !== pick2.model || existing.effort !== pick2.effort);
      if (moved && busy2) return fail(tr(`A member of ${roleName} is still working on ${existing.candidate}. Run ${L.wait} first.`, `${roleName} \u7684\u6210\u5458\u8FD8\u5728 ${existing.candidate} \u4E0A\u5DE5\u4F5C\uFF0C\u8BF7\u5148\u8FD0\u884C ${L.wait}\u3002`));
      const role = {
        name: existing?.name ?? roleName,
        candidate: pick2.name,
        agent: pick2.agent,
        model: pick2.model,
        effort: pick2.effort,
        folders: (folders ?? existing?.folders ?? []).map((folder) => folder.trim()).filter(Boolean),
        instructions: (instructions ?? existing?.instructions ?? "").trim(),
        createdAt: existing?.createdAt ?? now()
      };
      await store.setSessionRoles(agent.id, [...ctx.sessionRoles.filter((entry) => entry !== existing), role]);
      if (moved && active) {
        await store.mutate(active.id, (current) => retireRole(current, role.name, now()));
        await advance(active.id);
      }
      const where = `${pick2.name} (${runtimeLabel(pick2)})`;
      return leadMail(agent.id, ok(tr(
        `${existing ? "Updated" : "Formed"} ${role.name} on ${where}${role.folders.length ? `, folders ${role.folders.join(", ")}` : ""}.${moved ? " Its earlier member is retired." : ""}`,
        `\u5DF2${existing ? "\u66F4\u65B0" : "\u5EFA\u7ACB"}\u89D2\u8272 ${role.name}\uFF0C\u8FD0\u884C\u5728 ${where}${role.folders.length ? `\uFF0C\u6587\u4EF6\u5939 ${role.folders.join(", ")}` : ""}\u3002${moved ? "\u5B83\u4E4B\u524D\u7684\u6210\u5458\u5DF2\u9000\u5F79\u3002" : ""}`
      )));
    }
  });
  const delegateTool = defineTool({
    name: L.delegate,
    title: tr("Delegate tasks", "\u59D4\u6D3E\u4EFB\u52A1"),
    description: tr(
      `Delegation mode (${MODE_SPECS.delegation.pattern}): give self-contained tasks to roles. Each member sees only its own task and reports back only to you. Returns at once; then run ${L.wait}.`,
      `\u59D4\u6D3E\u6A21\u5F0F\uFF08${MODE_SPECS.delegation.pattern}\uFF09\uFF1A\u628A\u72EC\u7ACB\u5B8C\u6574\u7684\u4EFB\u52A1\u4EA4\u7ED9\u89D2\u8272\u3002\u6BCF\u4E2A\u6210\u5458\u53EA\u770B\u5230\u81EA\u5DF1\u7684\u4EFB\u52A1\uFF0C\u53EA\u5411\u4F60\u6C47\u62A5\u3002\u7ACB\u5373\u8FD4\u56DE\uFF0C\u4E4B\u540E\u8FD0\u884C ${L.wait}\u3002`
    ),
    input: object({
      tasks: array(object({
        role: string2().min(1).describe(tr(`A fixed role, a role you formed, a new job name such as api or tester (with candidate), or "${HELPER}" (teams without candidates) when nothing fits. The member is named after it.`, `\u56FA\u5B9A\u89D2\u8272\u3001\u4F60\u5EFA\u7684\u89D2\u8272\u3001\u65B0\u7684\u5C97\u4F4D\u540D\uFF08\u4F8B\u5982 api \u6216 tester\uFF0C\u540C\u65F6\u586B candidate\uFF09\uFF0C\u6216\u5728\u90FD\u4E0D\u5408\u9002\u65F6\u7528 "${HELPER}"\uFF08\u4EC5\u9650\u6CA1\u6709\u5019\u9009\u6210\u5458\u7684\u56E2\u961F\uFF09\u3002\u6210\u5458\u4EE5\u5B83\u547D\u540D\u3002`)),
        candidate: string2().optional().describe(tr("For a new job name: the candidate that does it (assign by its description); the role is formed on it for this session. Reuse the role name for later work on the same job.", "\u65B0\u5C97\u4F4D\u540D\u65F6\u586B\uFF1A\u7531\u54EA\u4E2A\u5019\u9009\u6210\u5458\u6765\u505A\uFF08\u6309\u5176\u63CF\u8FF0\u5206\u5DE5\uFF09\uFF1B\u4F1A\u5728\u5B83\u4E0A\u9762\u4E3A\u672C\u4F1A\u8BDD\u5EFA\u597D\u8FD9\u4E2A\u89D2\u8272\u3002\u4E4B\u540E\u540C\u4E00\u5C97\u4F4D\u7684\u5DE5\u4F5C\u7EE7\u7EED\u7528\u8FD9\u4E2A\u89D2\u8272\u540D\u3002")),
        task: string2().min(1).describe(tr("A self-contained task: context, files, acceptance criteria and what to report back", "\u72EC\u7ACB\u5B8C\u6574\u7684\u4EFB\u52A1\uFF1A\u80CC\u666F\u3001\u6587\u4EF6\u3001\u9A8C\u6536\u6807\u51C6\uFF0C\u4EE5\u53CA\u8981\u6C47\u62A5\u4EC0\u4E48"))
      })).min(1).max(8),
      title: string2().optional().describe(tr("A short title for the user's request", "\u7528\u6237\u9700\u6C42\u7684\u7B80\u77ED\u6807\u9898")),
      reason: string2().optional().describe(tr("In auto mode: why delegation fits this request", "\u81EA\u52A8\u6A21\u5F0F\u4E0B\uFF1A\u4E3A\u4EC0\u4E48\u8FD9\u4E2A\u9700\u6C42\u9002\u5408\u59D4\u6D3E"))
    }),
    async execute({ tasks, title, reason }, { agent }) {
      const ctx = await leadContext(agent);
      if (!allowsMode(ctx.effective, "delegation")) return fail(refusal(ctx));
      const resolved = jobRoles(ctx, tasks);
      if (typeof resolved === "string") return fail(resolved);
      const byRole = /* @__PURE__ */ new Map();
      tasks.forEach((entry, index) => {
        const spec = resolved.specs[index];
        const group = byRole.get(key(spec.name)) ?? { spec, tasks: [] };
        group.tasks.push(entry.task.trim());
        byRole.set(key(spec.name), group);
      });
      let run = store.leadRun(agent.id, true);
      if (run && run.mode !== "delegation") {
        const blocked = await closeActive(agent.id, lang);
        if (blocked) return fail(blocked);
        run = void 0;
      }
      if (run) {
        const busy2 = [...byRole.values()].filter((group) => run.members.some((member) => key(member.role) === key(group.spec.name) && (member.state === "working" || member.state === "attention")));
        if (busy2.length) return fail(tr(`${busy2.map((group) => group.spec.name).join(", ")} still work on run ${run.id}. Run ${L.wait} first, or ${L.send} to change their task.`, `${busy2.map((group) => group.spec.name).join(", ")} \u8FD8\u5728\u8FD0\u884C ${run.id} \u4E2D\u5DE5\u4F5C\u3002\u8BF7\u5148\u8FD0\u884C ${L.wait}\uFF0C\u6216\u7528 ${L.send} \u4FEE\u6539\u5B83\u4EEC\u7684\u4EFB\u52A1\u3002`));
      }
      if (resolved.formed.length) await store.setSessionRoles(agent.id, resolved.ctx.sessionRoles);
      await lockIfAuto(ctx, agent.id, "delegation");
      if (run) {
        run = await store.mutate(run.id, (current) => ({ ...startBatch(current, now()), title: title?.trim() || current.title, reason: reason?.trim() || current.reason }));
      } else {
        const first = tasks[0].task;
        run = await store.create(createRun({ id: store.newId(), leadAgentId: agent.id, workspaceId: ctx.workspaceId, mode: "delegation", title: title?.trim() || excerpt(first, 60), reason, language: lang, now: now() }));
      }
      const overlaps = overlappingRoles([...byRole.values()].map((group) => group.spec));
      const warnings = overlaps.map(([a, b]) => tr(`${a} and ${b} may edit the same files at the same time; make sure their tasks touch different files.`, `${a} \u548C ${b} \u53EF\u80FD\u540C\u65F6\u6539\u540C\u4E00\u6279\u6587\u4EF6\uFF0C\u8BF7\u786E\u4FDD\u5B83\u4EEC\u7684\u4EFB\u52A1\u6D89\u53CA\u4E0D\u540C\u6587\u4EF6\u3002`));
      run = await store.mutate(run.id, (current) => addBatch(current, { title: title?.trim() || excerpt(tasks[0].task, 60), reason: reason?.trim() ?? "", warnings: overlaps.map(([a, b]) => `${a} \u2194 ${b}`), followUp: false }, now()));
      const lines = [];
      for (const { spec, tasks: parts } of byRole.values()) {
        const task = parts.length === 1 ? parts[0] : parts.map((part, index) => `### ${tr("Part", "\u7B2C")} ${index + 1}${zh ? " \u90E8\u5206" : ""}
${part}`).join("\n\n");
        const header = headerFor(spec, lang);
        try {
          const started = await dispatch(ctx, agent.id, spec, P.delegationTaskPrompt(run, header ? `${header}

${task}` : task), lang);
          run = await store.mutate(run.id, (current) => mirrorTask(upsertMember(current, { role: spec.name, agentId: started.agentId, title: started.title, task }, now()), spec.name, started.agentId, started.title, task));
          run = await store.log(run.id, [contextEvent(started.agentId, spec, started.continued)]);
          lines.push(`- ${memberLine(started.title, spec)}: ${started.continued ? tr("continued", "\u6CBF\u7528\u5DF2\u6709\u6210\u5458") : tr("started", "\u5DF2\u542F\u52A8")}`);
          if (started.note) lines.push(`  ${started.note}`);
          const attached = await attachWorker(ctx, agent.id, started, spec, lang);
          if (attached) lines.push(`  ${attached}`);
        } catch (error2) {
          lines.push(`- ${spec.name}: ${tr("not started", "\u672A\u542F\u52A8")}: ${error2 instanceof Error ? error2.message : String(error2)}`);
        }
      }
      return ok([
        tr(`Delegation run ${run.id} "${run.title}", batch ${run.round}:`, `\u59D4\u6D3E\u8FD0\u884C ${run.id}\u300C${run.title}\u300D\uFF0C\u7B2C ${run.round} \u6279\uFF1A`),
        ...lines,
        ...warnings.length ? ["", tr("Warnings:", "\u6CE8\u610F\uFF1A"), ...warnings.map((warning) => `- ${warning}`)] : [],
        "",
        tr(`Run ${L.wait} to collect the results.`, `\u8FD0\u884C ${L.wait} \u6536\u96C6\u7ED3\u679C\u3002`)
      ].join("\n"), { runId: run.id, members: run.members.map(({ role, agentId, title: memberTitle2, state }) => ({ role, agentId, title: memberTitle2, state })) });
    }
  });
  const BriefInput = object({
    title: string2().min(1),
    goal: string2().min(1),
    requirements: array(string2().min(1)).min(1),
    acceptance: array(string2().min(1)).min(1).describe(tr("Acceptance criteria the result is checked against", "\u7528\u6765\u68C0\u67E5\u7ED3\u679C\u7684\u9A8C\u6536\u6807\u51C6")),
    constraints: array(string2()).default([]),
    outOfScope: array(string2()).default([])
  });
  const PlanTaskInput = object({
    title: string2().min(1),
    detail: string2().optional().describe(tr("What done means for this task", "\u8FD9\u4E2A\u4EFB\u52A1\u600E\u6837\u7B97\u5B8C\u6210")),
    role: string2().optional().describe(tr("The role that should do it: a fixed or formed role, or a new job name such as tester (with candidate); omit for anyone", "\u5E94\u8BE5\u7531\u54EA\u4E2A\u89D2\u8272\u505A\uFF1A\u56FA\u5B9A\u89D2\u8272\u3001\u4F60\u5EFA\u7684\u89D2\u8272\uFF0C\u6216\u65B0\u7684\u5C97\u4F4D\u540D\uFF08\u4F8B\u5982 tester\uFF0C\u540C\u65F6\u586B candidate\uFF09\uFF1B\u4E0D\u586B\u8868\u793A\u4EFB\u4F55\u4EBA")),
    candidate: string2().optional().describe(tr("For a new job name in role: the candidate that does it; the role is formed on it for this session", "role \u662F\u65B0\u5C97\u4F4D\u540D\u65F6\u586B\uFF1A\u7531\u54EA\u4E2A\u5019\u9009\u6210\u5458\u6765\u505A\uFF1B\u4F1A\u5728\u5B83\u4E0A\u9762\u4E3A\u672C\u4F1A\u8BDD\u5EFA\u597D\u8FD9\u4E2A\u89D2\u8272")),
    after: array(number2().int().min(1)).optional().describe(tr("Positions (1-based) of earlier tasks in this list it waits for", "\u5B83\u8981\u7B49\u5F85\u7684\u3001\u672C\u5217\u8868\u4E2D\u6392\u5728\u524D\u9762\u7684\u4EFB\u52A1\u5E8F\u53F7\uFF08\u4ECE 1 \u5F00\u59CB\uFF09")),
    files: array(string2()).optional().describe(tr("Paths it will change; claimed for its owner while it works", "\u5B83\u4F1A\u6539\u52A8\u7684\u8DEF\u5F84\uFF1B\u8D1F\u8D23\u4EBA\u5DE5\u4F5C\u671F\u95F4\u4F1A\u88AB\u8BA4\u9886"))
  });
  const briefTool = defineTool({
    name: L.brief,
    title: tr("Record the brief", "\u8BB0\u5F55\u9700\u6C42\u7B80\u62A5"),
    description: tr(
      `Team mode (${MODE_SPECS.team.pattern}), end of intake: record the brief and the task plan you are about to show the user. Show them in full and end your turn; once the user confirms in their reply, run ${L.kickoff}. Call it again to replace them after a correction.`,
      `\u56E2\u961F\u6A21\u5F0F\uFF08${MODE_SPECS.team.pattern}\uFF09\uFF0C\u9700\u6C42\u5BF9\u63A5\u7684\u6700\u540E\u4E00\u6B65\uFF1A\u8BB0\u5F55\u4F60\u8981\u5C55\u793A\u7ED9\u7528\u6237\u7684\u9700\u6C42\u7B80\u62A5\u548C\u4EFB\u52A1\u8BA1\u5212\u3002\u5B8C\u6574\u5C55\u793A\u540E\u7ED3\u675F\u672C\u8F6E\uFF1B\u7528\u6237\u56DE\u590D\u786E\u8BA4\u540E\u518D\u8FD0\u884C ${L.kickoff}\u3002\u7528\u6237\u4FEE\u6539\u540E\u518D\u6B21\u8C03\u7528\u4EE5\u66FF\u6362\u3002`
    ),
    input: object({
      brief: BriefInput,
      tasks: array(PlanTaskInput).max(30).optional().describe(tr("The work broken into tasks for the shared task board; one task per role when omitted", "\u62C6\u5206\u5230\u5171\u4EAB\u4EFB\u52A1\u677F\u4E0A\u7684\u4EFB\u52A1\uFF1B\u4E0D\u586B\u5219\u6BCF\u4E2A\u89D2\u8272\u4E00\u4E2A\u4EFB\u52A1")),
      roles: array(string2().min(1)).optional().describe(tr("The roles taking part (fixed roles, formed roles, or job names the tasks form); the roles the tasks name when omitted", "\u53C2\u4E0E\u7684\u89D2\u8272\uFF08\u56FA\u5B9A\u89D2\u8272\u3001\u4F60\u5EFA\u7684\u89D2\u8272\uFF0C\u6216\u4EFB\u52A1\u4E2D\u65B0\u5EFA\u7684\u5C97\u4F4D\u540D\uFF09\uFF1B\u4E0D\u586B\u5219\u4E3A\u4EFB\u52A1\u4E2D\u6307\u5B9A\u7684\u89D2\u8272")),
      rounds: number2().int().min(1).max(MAX_ROUNDS).optional().describe(tr("1 = work only; 2 (default) adds a review round in which members check each other's done tasks", "1 = \u53EA\u505A\u5DE5\u4F5C\uFF1B2\uFF08\u9ED8\u8BA4\uFF09\u589E\u52A0\u4E00\u8F6E\u4E92\u8BC4\uFF0C\u6210\u5458\u68C0\u67E5\u5F7C\u6B64\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1")),
      planApproval: boolean2().optional().describe(tr("Members submit a plan per task and wait for your approval before doing it", "\u6210\u5458\u6BCF\u4E2A\u4EFB\u52A1\u5148\u63D0\u4EA4\u8BA1\u5212\uFF0C\u7B49\u4F60\u6279\u51C6\u540E\u518D\u505A")),
      reason: string2().optional().describe(tr("In auto mode: why team mode fits this request", "\u81EA\u52A8\u6A21\u5F0F\u4E0B\uFF1A\u4E3A\u4EC0\u4E48\u8FD9\u4E2A\u9700\u6C42\u9002\u5408\u56E2\u961F\u6A21\u5F0F"))
    }),
    async execute({ brief, tasks, roles, rounds, planApproval, reason }, { agent }) {
      const ctx = await leadContext(agent);
      if (!allowsMode(ctx.effective, "team")) return fail(refusal(ctx));
      const plan = (tasks ?? []).map((task) => ({ title: task.title, detail: task.detail, role: task.role?.trim() || null, after: (task.after ?? []).map(String), files: task.files }));
      const asks = [...(tasks ?? []).filter((task) => task.role?.trim()).map((task) => ({ role: task.role, candidate: task.candidate })), ...(roles ?? []).map((role) => ({ role }))];
      const resolved = jobRoles(ctx, asks);
      if (typeof resolved === "string") return fail(resolved);
      const specs = teamSpecs(resolved.ctx, roles, plan);
      if (typeof specs === "string") return fail(specs);
      const check = addTasks(createRun({ id: "R0", leadAgentId: agent.id, workspaceId: ctx.workspaceId, mode: "team", title: "check", language: lang, now: now() }), plan, "lead", now());
      if (check.errors.length) return fail(`${tr("The task plan has problems:", "\u4EFB\u52A1\u8BA1\u5212\u6709\u95EE\u9898\uFF1A")}
${check.errors.map((error2) => `- ${error2}`).join("\n")}`);
      const tail = await orca().readTerminal(agent.id, 400);
      const recorded = { title: brief.title.trim(), goal: brief.goal.trim(), requirements: brief.requirements, acceptance: brief.acceptance, constraints: brief.constraints, outOfScope: brief.outOfScope };
      const pending = { brief: recorded, roles: specs.map((spec) => spec.name), rounds: rounds ?? DEFAULT_TEAM_ROUNDS, reason: reason?.trim() ?? "", tasks: plan, planApproval: planApproval === true, seq: 0, at: now(), transcript: tail };
      if (resolved.formed.length) await store.setSessionRoles(agent.id, resolved.ctx.sessionRoles);
      await store.setPendingBrief(agent.id, pending);
      return ok([
        tr("Brief recorded. Show it to the user as below, with the task plan and the roles taking part, ask them to confirm or correct it, and end your turn. Don't start members yet.", "\u9700\u6C42\u7B80\u62A5\u5DF2\u8BB0\u5F55\u3002\u8BF7\u628A\u4E0B\u9762\u7684\u7B80\u62A5\u3001\u4EFB\u52A1\u8BA1\u5212\u548C\u53C2\u4E0E\u89D2\u8272\u5C55\u793A\u7ED9\u7528\u6237\uFF0C\u8BF7\u5BF9\u65B9\u786E\u8BA4\u6216\u4FEE\u6539\uFF0C\u7136\u540E\u7ED3\u675F\u672C\u8F6E\u3002\u5148\u4E0D\u8981\u542F\u52A8\u6210\u5458\u3002"),
        "",
        briefText({ ...recorded, userConfirmation: "" }, lang),
        "",
        tr("Task plan:", "\u4EFB\u52A1\u8BA1\u5212\uFF1A"),
        ...plan.length ? planText(plan) : pending.roles.map((role, index) => tr(`${index + 1}. ${role}: its part of the brief (${role})`, `${index + 1}. ${role}\uFF1A\u7B80\u62A5\u4E2D\u5C5E\u4E8E\u5B83\u7684\u90E8\u5206\uFF08${role}\uFF09`)),
        "",
        tr(`Roles: ${pending.roles.join(", ")} \xB7 rounds: ${pending.rounds}${pending.planApproval ? " \xB7 plans need your approval" : ""}`, `\u89D2\u8272\uFF1A${pending.roles.join(", ")} \xB7 \u8F6E\u6570\uFF1A${pending.rounds}${pending.planApproval ? " \xB7 \u8BA1\u5212\u9700\u8981\u4F60\u5BA1\u6279" : ""}`),
        "",
        tr(`When they confirm, run ${L.kickoff} with their confirming words. When they correct it, run ${L.brief} again.`, `\u7528\u6237\u786E\u8BA4\u540E\uFF0C\u7528\u5176\u786E\u8BA4\u539F\u8BDD\u8FD0\u884C ${L.kickoff}\uFF1B\u7528\u6237\u4FEE\u6539\u540E\uFF0C\u518D\u6B21\u8FD0\u884C ${L.brief}\u3002`)
      ].join("\n"));
    }
  });
  const kickoffTool = defineTool({
    name: L.kickoff,
    title: tr("Start a team run", "\u542F\u52A8\u56E2\u961F\u8FD0\u884C"),
    description: tr(
      `Team mode (${MODE_SPECS.team.pattern}): start the team on the brief and task plan recorded with ${L.brief}, once the user has confirmed them. Posts the brief, fills the task board and starts the roles together. Returns at once; then run ${L.wait}.`,
      `\u56E2\u961F\u6A21\u5F0F\uFF08${MODE_SPECS.team.pattern}\uFF09\uFF1A\u7528\u6237\u786E\u8BA4\u540E\uFF0C\u6309 ${L.brief} \u8BB0\u5F55\u7684\u7B80\u62A5\u548C\u4EFB\u52A1\u8BA1\u5212\u542F\u52A8\u56E2\u961F\u3002\u4F1A\u53D1\u5E03\u7B80\u62A5\u3001\u586B\u597D\u4EFB\u52A1\u677F\u5E76\u540C\u65F6\u542F\u52A8\u5404\u89D2\u8272\u3002\u7ACB\u5373\u8FD4\u56DE\uFF0C\u4E4B\u540E\u8FD0\u884C ${L.wait}\u3002`
    ),
    input: object({
      userConfirmation: string2().min(1).describe(tr("The user's words confirming the brief, quoted exactly from the message they sent after you showed it", "\u7528\u6237\u786E\u8BA4\u7B80\u62A5\u7684\u539F\u8BDD\uFF0C\u5FC5\u987B\u539F\u6837\u5F15\u7528\u4F60\u5C55\u793A\u7B80\u62A5\u4E4B\u540E\u7528\u6237\u53D1\u7684\u6D88\u606F"))
    }),
    async execute({ userConfirmation }, { agent }) {
      const ctx = await leadContext(agent);
      if (!allowsMode(ctx.effective, "team")) return fail(refusal(ctx));
      const pending = store.pendingBrief(agent.id);
      if (!pending) return fail(tr(`No brief is recorded. Finish intake: run ${L.brief} with the brief and task plan, show them to the user and end your turn; start the team after they confirm.`, `\u8FD8\u6CA1\u6709\u8BB0\u5F55\u9700\u6C42\u7B80\u62A5\u3002\u8BF7\u5148\u5B8C\u6210\u9700\u6C42\u5BF9\u63A5\uFF1A\u7528 ${L.brief} \u8BB0\u5F55\u7B80\u62A5\u548C\u4EFB\u52A1\u8BA1\u5212\uFF0C\u5C55\u793A\u7ED9\u7528\u6237\u5E76\u7ED3\u675F\u672C\u8F6E\uFF1B\u7528\u6237\u786E\u8BA4\u540E\u518D\u542F\u52A8\u56E2\u961F\u3002`));
      if (!await userConfirmed(agent.id, pending, userConfirmation)) {
        return fail(tr(
          `userConfirmation must quote the user's reply to the brief recorded with ${L.brief}: a message they sent after you showed it. It does not match one. Show the user the brief, end your turn, and call this tool once they confirm. A request, or anything said before the brief, cannot confirm it.`,
          `userConfirmation \u5FC5\u987B\u5F15\u7528\u7528\u6237\u5BF9 ${L.brief} \u6240\u8BB0\u5F55\u7B80\u62A5\u7684\u56DE\u590D\uFF0C\u4E5F\u5C31\u662F\u4F60\u5C55\u793A\u7B80\u62A5\u4E4B\u540E\u7528\u6237\u53D1\u7684\u6D88\u606F\uFF0C\u73B0\u5728\u5BF9\u4E0D\u4E0A\u3002\u8BF7\u628A\u7B80\u62A5\u5C55\u793A\u7ED9\u7528\u6237\u5E76\u7ED3\u675F\u672C\u8F6E\uFF0C\u7B49\u7528\u6237\u786E\u8BA4\u540E\u518D\u8C03\u7528\u3002\u9700\u6C42\u672C\u8EAB\u6216\u7B80\u62A5\u4E4B\u524D\u8BF4\u7684\u8BDD\u90FD\u4E0D\u80FD\u7B97\u786E\u8BA4\u3002`
        ));
      }
      const tasks = pending.tasks ?? [];
      const specs = teamSpecs(ctx, pending.roles, tasks);
      if (typeof specs === "string") return fail(`${specs} ${tr(`Record the brief again with ${L.brief}.`, `\u8BF7\u7528 ${L.brief} \u91CD\u65B0\u8BB0\u5F55\u7B80\u62A5\u3002`)}`);
      const blocked = await closeActive(agent.id, lang);
      if (blocked) return fail(blocked);
      await lockIfAuto(ctx, agent.id, "team");
      const full = { ...pending.brief, userConfirmation: userConfirmation.trim() };
      let run = await store.create(createRun({ id: store.newId(), leadAgentId: agent.id, workspaceId: ctx.workspaceId, mode: "team", title: full.title, reason: pending.reason, rounds: pending.rounds, brief: full, planApproval: pending.planApproval, language: lang, now: now() }));
      await store.setPendingBrief(agent.id, null);
      const plan = tasks.length ? tasks : specs.map((spec) => ({
        title: tr(`${spec.name}: its part of the brief`, `${spec.name}\uFF1A\u7B80\u62A5\u4E2D\u5C5E\u4E8E\u5B83\u7684\u90E8\u5206`),
        detail: tr(`Do the part of the brief that falls to the ${spec.name} role. Split it into further tasks (${MEMBER_TOOLS.task}, action "add") when it is large.`, `\u5B8C\u6210\u7B80\u62A5\u4E2D\u5C5E\u4E8E ${spec.name} \u89D2\u8272\u7684\u90E8\u5206\u3002\u5DE5\u4F5C\u91CF\u5927\u65F6\u62C6\u6210\u66F4\u591A\u4EFB\u52A1\uFF08${MEMBER_TOOLS.task}\uFF0Caction "add"\uFF09\u3002`),
        role: spec.name
      }));
      const locks = specs.map((spec) => `${run.id}:${key(spec.name)}`);
      for (const lock of locks) staffing.add(lock);
      const lines = [];
      try {
        run = await store.mutate(run.id, (current) => addTasks(addPost(current, { author: "lead", agentId: agent.id, kind: "brief", text: briefText(full, lang), to: [], files: [] }, now()).run, plan, "lead", now()).run);
        const roster = rosterOf(ctx, run, specs);
        for (const spec of specs) {
          try {
            const started = await dispatch(ctx, agent.id, spec, P.teamKickoffPrompt(run, full, roster, spec, headerFor(spec, lang)), lang);
            run = await store.mutate(run.id, (current) => upsertMember(current, { role: spec.name, agentId: started.agentId, title: started.title, task: "" }, now()));
            lines.push(`- ${memberLine(started.title, spec)}: ${started.continued ? tr("continued", "\u6CBF\u7528\u5DF2\u6709\u6210\u5458") : tr("started", "\u5DF2\u542F\u52A8")}`);
            if (started.note) lines.push(`  ${started.note}`);
            const attached = started.continued ? null : await attachWorker(ctx, agent.id, started, spec, lang);
            if (attached) lines.push(`  ${attached}`);
          } catch (error2) {
            lines.push(`- ${spec.name}: ${tr("not started", "\u672A\u542F\u52A8")}: ${error2 instanceof Error ? error2.message : String(error2)}`);
          }
        }
      } finally {
        for (const lock of locks) staffing.delete(lock);
      }
      return ok([
        tr(`Team run ${run.id} "${run.title}" started, ${run.rounds} round${run.rounds === 1 ? "" : "s"}${run.planApproval ? ", plans need your approval" : ""}. The brief is post #1 on the board.`, `\u56E2\u961F\u8FD0\u884C ${run.id}\u300C${run.title}\u300D\u5DF2\u542F\u52A8\uFF0C\u5171 ${run.rounds} \u8F6E${run.planApproval ? "\uFF0C\u8BA1\u5212\u9700\u8981\u4F60\u5BA1\u6279" : ""}\u3002\u7B80\u62A5\u662F\u9ED1\u677F\u4E0A\u7684\u7B2C 1 \u6761\u5E16\u5B50\u3002`),
        ...lines,
        "",
        taskBoardText(run, lang),
        "",
        tr(`Run ${L.wait}. The plugin hands open tasks to idle members, starts members for roles with work, and runs the review round by itself.`, `\u8FD0\u884C ${L.wait}\u3002\u63D2\u4EF6\u4F1A\u628A\u5F85\u529E\u4EFB\u52A1\u6D3E\u7ED9\u7A7A\u95F2\u6210\u5458\u3001\u4E3A\u6709\u4EFB\u52A1\u4F46\u6CA1\u6709\u6210\u5458\u7684\u89D2\u8272\u542F\u52A8\u6210\u5458\uFF0C\u5E76\u81EA\u52A8\u8FDB\u884C\u4E92\u8BC4\u8F6E\u3002`)
      ].join("\n"), { runId: run.id, members: run.members.map(({ role, agentId, title }) => ({ role, agentId, title })) });
    }
  });
  const tasksTool = defineTool({
    name: L.tasks,
    title: tr("Manage the task board", "\u7BA1\u7406\u4EFB\u52A1\u677F"),
    description: tr(
      "Team mode: add tasks, edit or reassign them (role), reopen a task (state todo; with feedback a done task goes back to its role), drop tasks, and approve or send back plans that wait for your approval. Members take open tasks; idle ones get them handed by the plugin.",
      "\u56E2\u961F\u6A21\u5F0F\uFF1A\u65B0\u589E\u4EFB\u52A1\u3001\u4FEE\u6539\u6216\u6539\u6D3E\u4EFB\u52A1\uFF08role\uFF09\u3001\u91CD\u65B0\u6253\u5F00\u4EFB\u52A1\uFF08state todo\uFF1B\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\u5E26 feedback \u4F1A\u9000\u56DE\u7ED9\u539F\u89D2\u8272\uFF09\u3001\u53D6\u6D88\u4EFB\u52A1\uFF0C\u4EE5\u53CA\u6279\u51C6\u6216\u6253\u56DE\u7B49\u4F60\u5BA1\u6279\u7684\u8BA1\u5212\u3002\u6210\u5458\u4F1A\u81EA\u5DF1\u9886\u53D6\u5F85\u529E\u4EFB\u52A1\uFF0C\u7A7A\u95F2\u6210\u5458\u7531\u63D2\u4EF6\u6D3E\u53D1\u3002"
    ),
    input: object({
      add: array(object({
        title: string2().min(1),
        detail: string2().optional(),
        role: string2().optional().describe(tr("The role that should do it: a fixed or formed role, or a new job name such as tester (with candidate); omit for anyone", "\u5E94\u8BE5\u7531\u54EA\u4E2A\u89D2\u8272\u505A\uFF1A\u56FA\u5B9A\u89D2\u8272\u3001\u4F60\u5EFA\u7684\u89D2\u8272\uFF0C\u6216\u65B0\u7684\u5C97\u4F4D\u540D\uFF08\u4F8B\u5982 tester\uFF0C\u540C\u65F6\u586B candidate\uFF09\uFF1B\u4E0D\u586B\u8868\u793A\u4EFB\u4F55\u4EBA")),
        candidate: string2().optional().describe(tr("For a new job name in role: the candidate that does it; the role is formed on it for this session", "role \u662F\u65B0\u5C97\u4F4D\u540D\u65F6\u586B\uFF1A\u7531\u54EA\u4E2A\u5019\u9009\u6210\u5458\u6765\u505A\uFF1B\u4F1A\u5728\u5B83\u4E0A\u9762\u4E3A\u672C\u4F1A\u8BDD\u5EFA\u597D\u8FD9\u4E2A\u89D2\u8272")),
        after: array(string2()).optional().describe(tr("Ids of tasks it waits for, such as T2", "\u5B83\u8981\u7B49\u5F85\u7684\u4EFB\u52A1\u7F16\u53F7\uFF0C\u4F8B\u5982 T2")),
        files: array(string2()).optional()
      })).optional(),
      update: array(object({
        id: string2().min(1),
        title: string2().optional(),
        detail: string2().optional(),
        role: string2().nullable().optional().describe(tr("Reassign to a role, or null for anyone", "\u6539\u6D3E\u7ED9\u67D0\u4E2A\u89D2\u8272\uFF0Cnull \u8868\u793A\u4EFB\u4F55\u4EBA")),
        candidate: string2().optional().describe(tr("For a new job name in role: the candidate that does it; the role is formed on it for this session", "role \u662F\u65B0\u5C97\u4F4D\u540D\u65F6\u586B\uFF1A\u7531\u54EA\u4E2A\u5019\u9009\u6210\u5458\u6765\u505A\uFF1B\u4F1A\u5728\u5B83\u4E0A\u9762\u4E3A\u672C\u4F1A\u8BDD\u5EFA\u597D\u8FD9\u4E2A\u89D2\u8272")),
        state: _enum(["todo", "dropped"]).optional().describe(tr("todo reopens (a done task needs feedback); dropped cancels", "todo \u91CD\u65B0\u6253\u5F00\uFF08\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\u9700\u8981 feedback\uFF09\uFF1Bdropped \u53D6\u6D88")),
        after: array(string2()).optional(),
        feedback: string2().optional().describe(tr("Why it is reopened or reassigned; the next owner reads it", "\u4E3A\u4EC0\u4E48\u91CD\u65B0\u6253\u5F00\u6216\u6539\u6D3E\uFF1B\u4E0B\u4E00\u4E2A\u8D1F\u8D23\u4EBA\u4F1A\u770B\u5230"))
      })).optional(),
      review: array(object({
        id: string2().min(1),
        approve: boolean2(),
        feedback: string2().optional().describe(tr("Required when sending a plan back", "\u6253\u56DE\u8BA1\u5212\u65F6\u5FC5\u586B"))
      })).optional()
    }),
    async execute({ add, update, review }, { agent }) {
      const ctx = await leadContext(agent);
      const run = leadTeamRun(agent.id);
      if (!run || run.status !== "active") return fail(tr(`There is no team run in progress. Start one with ${L.kickoff} after intake.`, `\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u56E2\u961F\u8FD0\u884C\u3002\u5B8C\u6210\u9700\u6C42\u5BF9\u63A5\u540E\u7528 ${L.kickoff} \u542F\u52A8\u3002`));
      const anyone = (role) => key(role) === "anyone" || role.trim() === "\u4EFB\u4F55\u4EBA";
      const named = [...add ?? [], ...update ?? []].filter((entry) => typeof entry.role === "string" && entry.role.trim() !== "" && !anyone(entry.role));
      const resolved = jobRoles(ctx, named);
      if (typeof resolved === "string") return fail(resolved);
      const helperRole = named.find((entry) => roleSpec(resolved.ctx, entry.role)?.name === HELPER);
      if (helperRole) return fail(unknownRole(ctx, helperRole.role));
      if (resolved.formed.length) await store.setSessionRoles(agent.id, resolved.ctx.sessionRoles);
      const roleName = (role) => roleSpec(resolved.ctx, role)?.name ?? role;
      const errors = [];
      await store.mutate(run.id, (current) => {
        let state = current;
        if (add?.length) {
          const result = addTasks(state, add.map(({ candidate: _candidate, ...task }) => ({ ...task, role: task.role && !anyone(task.role) ? roleName(task.role) : null })), "lead", now());
          errors.push(...result.errors);
          state = result.run;
        }
        for (const { candidate: _candidate, ...change } of update ?? []) {
          const before = taskOf(state, change.id);
          if (before?.state === "done" && change.state === "todo") {
            const result2 = rejectTask(state, change.id, change.feedback ?? "", now());
            if (result2.error) errors.push(result2.error);
            else state = updateTasks(result2.run, [{ ...change, state: void 0, feedback: void 0 }], now()).run;
            continue;
          }
          const result = updateTasks(state, [{ ...change, role: change.role === void 0 ? void 0 : change.role && !anyone(change.role) ? roleName(change.role) : null }], now());
          errors.push(...result.errors);
          state = result.run;
          const after = taskOf(state, change.id);
          if (before?.state === "doing" && before.owner && before.ownerTitle && after?.owner !== before.owner) {
            const reason = change.feedback ? ` (${change.feedback.trim()})` : "";
            const text = zh ? `${before.id}\u300C${before.title}\u300D\uFF1A\u534F\u8C03\u5668${after?.state === "dropped" ? "\u5DF2\u53D6\u6D88\u8FD9\u4E2A\u4EFB\u52A1" : "\u5DF2\u628A\u5B83\u4ECE\u4F60\u8FD9\u91CC\u6536\u56DE"}${reason}\u3002\u8BF7\u505C\u6B62\u8FD9\u4E2A\u4EFB\u52A1\u3002` : `${before.id} "${before.title}": the lead ${after?.state === "dropped" ? "dropped it" : "took it off you"}${reason}. Stop working on it.`;
            state = addPost(state, { author: "lead", agentId: agent.id, kind: "note", text, to: [before.ownerTitle], files: [] }, now()).run;
          }
        }
        for (const verdict of review ?? []) {
          const result = reviewPlan(state, verdict.id, verdict.approve, verdict.feedback ?? "", now());
          if (result.error) errors.push(result.error);
          else state = result.run;
        }
        return { ...state, status: "active" };
      });
      await advance(run.id);
      const latest = store.get(run.id);
      return leadMail(agent.id, ok([
        errors.length ? `${tr("Some changes were not made:", "\u90E8\u5206\u4FEE\u6539\u6CA1\u6709\u5B8C\u6210\uFF1A")}
${errors.map((error2) => `- ${error2}`).join("\n")}
` : tr("Done.", "\u5DF2\u5B8C\u6210\u3002"),
        taskBoardText(latest, lang),
        "",
        tr(`Run ${L.wait} for the members.`, `\u8FD0\u884C ${L.wait} \u7B49\u5F85\u6210\u5458\u3002`)
      ].join("\n")));
    }
  });
  const broadcastTool = defineTool({
    name: L.broadcast,
    title: tr("Post to the team", "\u53D1\u7ED9\u56E2\u961F"),
    description: tr(
      "Team mode: post a message from you on the board and send it to the members (all, or the given roles). Use it to settle a contradiction or answer a question; members that finished go back to work on it.",
      "\u56E2\u961F\u6A21\u5F0F\uFF1A\u4EE5\u4F60\u7684\u540D\u4E49\u5728\u9ED1\u677F\u4E0A\u53D1\u5E16\u5E76\u53D1\u7ED9\u6210\u5458\uFF08\u5168\u90E8\uFF0C\u6216\u6307\u5B9A\u89D2\u8272\uFF09\u3002\u7528\u4E8E\u89E3\u51B3\u5206\u6B67\u6216\u56DE\u7B54\u95EE\u9898\uFF1B\u5DF2\u5B8C\u6210\u7684\u6210\u5458\u4F1A\u636E\u6B64\u7EE7\u7EED\u5DE5\u4F5C\u3002"
    ),
    input: object({
      message: string2().min(1),
      roles: array(string2().min(1)).optional().describe(tr("Only these roles; every member of the run when omitted", "\u53EA\u53D1\u7ED9\u8FD9\u4E9B\u89D2\u8272\uFF1B\u4E0D\u586B\u5219\u53D1\u7ED9\u672C\u6B21\u8FD0\u884C\u7684\u6240\u6709\u6210\u5458"))
    }),
    async execute({ message, roles }, { agent }) {
      await leadContext(agent);
      const run = leadTeamRun(agent.id);
      if (!run) return fail(tr(`There is no team run. Start one with ${L.kickoff} after intake.`, `\u6CA1\u6709\u56E2\u961F\u8FD0\u884C\u3002\u5B8C\u6210\u9700\u6C42\u5BF9\u63A5\u540E\u7528 ${L.kickoff} \u542F\u52A8\u3002`));
      const wanted = roles?.length ? new Set(roles.map(key)) : null;
      const targets = run.members.filter((member) => member.state !== "failed" && !member.retired && (!wanted || wanted.has(key(member.role))));
      if (!targets.length) return fail(tr(`No member of run ${run.id} matches ${roles?.join(", ")}.`, `\u8FD0\u884C ${run.id} \u4E2D\u6CA1\u6709\u6210\u5458\u5339\u914D ${roles?.join(", ")}\u3002`));
      let posted = 0;
      let next = await store.mutate(run.id, (current) => {
        const result = addPost({ ...current, status: "active" }, { author: "lead", agentId: agent.id, kind: "note", text: message, to: roles?.length ? roles : [TO_ALL], files: [] }, now());
        posted = result.post.seq;
        return result.run;
      });
      const idle = [];
      for (const member of targets) {
        const unread = inboxOf(store.get(run.id), member.agentId);
        const sent = await sendIfIdle(member.agentId, promptsFor(next.language).mentionPrompt(next, unread.length ? unread : next.posts.filter((post) => post.seq === posted))).catch(() => false);
        if (!sent) continue;
        idle.push(member);
        next = await store.mutate(run.id, (current) => markInbox(wakeMembers(current, [member.agentId], now()), member.agentId, Math.max(posted, unread.at(-1)?.seq ?? 0), now()));
      }
      const running = targets.filter((member) => !idle.includes(member));
      return leadMail(agent.id, ok([
        tr(`Posted on the board of run ${run.id} (round ${next.round} of ${next.rounds}).`, `\u5DF2\u53D1\u5230\u8FD0\u884C ${run.id} \u7684\u9ED1\u677F\uFF08\u7B2C ${next.round}/${next.rounds} \u8F6E\uFF09\u3002`),
        idle.length ? tr(`Sent to: ${idle.map((member) => member.title).join(", ")}.`, `\u5DF2\u53D1\u7ED9\uFF1A${idle.map((member) => member.title).join(", ")}\u3002`) : "",
        running.length ? tr(`Still working, it reaches them with their next tool result: ${running.map((member) => member.title).join(", ")}.`, `\u4ECD\u5728\u5DE5\u4F5C\u7684\u6210\u5458\u4F1A\u5728\u4E0B\u4E00\u6B21\u5DE5\u5177\u8FD4\u56DE\u4E2D\u6536\u5230\uFF1A${running.map((member) => member.title).join(", ")}\u3002`) : "",
        tr(`Run ${L.wait} for their answers.`, `\u8FD0\u884C ${L.wait} \u7B49\u5F85\u4ED6\u4EEC\u7684\u56DE\u590D\u3002`)
      ].filter(Boolean).join("\n")));
    }
  });
  const sendTool = defineTool({
    name: L.send,
    title: tr("Message a member", "\u53D1\u6D88\u606F\u7ED9\u6210\u5458"),
    description: tr(
      "Send a follow-up to one member of the current run, for example to fix an incomplete result. The member must have finished its turn.",
      "\u7ED9\u5F53\u524D\u8FD0\u884C\u7684\u67D0\u4E2A\u6210\u5458\u53D1\u540E\u7EED\u6D88\u606F\uFF0C\u4F8B\u5982\u8BA9\u5B83\u8865\u5168\u4E0D\u5B8C\u6574\u7684\u7ED3\u679C\u3002\u8BE5\u6210\u5458\u5FC5\u987B\u5DF2\u7ED3\u675F\u672C\u8F6E\u3002"
    ),
    input: object({
      role: string2().optional().describe(tr("The member's role", "\u6210\u5458\u7684\u89D2\u8272")),
      agentId: string2().optional().describe(tr("The member's agent id, when several members share a role", "\u6210\u5458\u7684 agent id\uFF08\u591A\u4E2A\u6210\u5458\u5171\u7528\u4E00\u4E2A\u89D2\u8272\u65F6\uFF09")),
      message: string2().min(1)
    }),
    async execute({ role, agentId, message }, { agent }) {
      const ctx = await leadContext(agent);
      const run = store.leadRun(agent.id, false);
      if (!run) return fail(tr(`There is no run yet. Use ${L.delegate} or ${L.kickoff}.`, `\u8FD8\u6CA1\u6709\u8FD0\u884C\u3002\u8BF7\u7528 ${L.delegate} \u6216 ${L.kickoff}\u3002`));
      const member = agentId ? memberOf(run, agentId) : [...run.members].reverse().find((entry) => role !== void 0 && key(entry.role) === key(role) && !entry.retired);
      if (!member) return fail(tr(`No member of run ${run.id} matches ${agentId ?? role ?? "(no role or agentId given)"}. Members: ${run.members.map((entry) => memberName(entry)).join(", ")}.`, `\u8FD0\u884C ${run.id} \u4E2D\u6CA1\u6709\u6210\u5458\u5339\u914D ${agentId ?? role ?? "\uFF08\u672A\u7ED9\u51FA role \u6216 agentId\uFF09"}\u3002\u6210\u5458\uFF1A${run.members.map((entry) => memberName(entry, true)).join(", ")}\u3002`));
      if (!await isIdleAgent(member.agentId, ctx.lead.workspaceId)) return fail(tr(`${member.title} is still working. Run ${L.wait} first, so the message doesn't interrupt it.`, `${member.title} \u8FD8\u5728\u5DE5\u4F5C\u3002\u8BF7\u5148\u8FD0\u884C ${L.wait}\uFF0C\u4EE5\u514D\u6253\u65AD\u5B83\u3002`));
      const spec = roleSpec(ctx, member.role);
      const header = spec ? headerFor(spec, run.language) : "";
      const MP = promptsFor(run.language);
      if (run.mode === "team") {
        let posted = 0;
        const withPost = await store.mutate(run.id, (current) => {
          const result = addPost({ ...current, status: "active" }, { author: "lead", agentId: agent.id, kind: "note", text: message, to: [member.title], files: [] }, now());
          posted = result.post.seq;
          return result.run;
        });
        const unread = inboxOf(withPost, member.agentId);
        const sent = await sendIfIdle(member.agentId, MP.mentionPrompt(withPost, unread)).catch(() => false);
        if (!sent) return leadMail(agent.id, fail(tr(`${member.title} just started working; it gets your message with its next tool result.`, `${member.title} \u521A\u5F00\u59CB\u5DE5\u4F5C\uFF0C\u4F1A\u5728\u4E0B\u4E00\u6B21\u5DE5\u5177\u8FD4\u56DE\u4E2D\u6536\u5230\u4F60\u7684\u6D88\u606F\u3002`)));
        await store.mutate(run.id, (current) => markInbox(wakeMembers(current, [member.agentId], now()), member.agentId, Math.max(posted, unread.at(-1)?.seq ?? 0), now()));
      } else {
        const sent = await sendIfIdle(member.agentId, MP.delegationTaskPrompt(run, header ? `${header}

${message}` : message)).catch(() => false);
        if (!sent) return leadMail(agent.id, fail(tr(`${member.title} just started working. Run ${L.wait} first.`, `${member.title} \u521A\u5F00\u59CB\u5DE5\u4F5C\uFF0C\u8BF7\u5148\u8FD0\u884C ${L.wait}\u3002`)));
        await store.mutate(run.id, (current) => {
          const batch = startBatch({ ...current, status: "active" }, now());
          const opened = addBatch(batch, { title: excerpt(message.split("\n").find((line) => line.trim()) ?? message, 60), reason: "", warnings: [], followUp: true }, now());
          return mirrorTask(updateMember(opened, member.agentId, { state: "working", collected: false, task: message, dispatchedAt: now() }, now()), member.role, member.agentId, member.title, message);
        });
        if (spec) await store.log(run.id, [contextEvent(member.agentId, spec, true, member.title)]);
      }
      return leadMail(agent.id, ok(tr(`Sent to ${member.title}. Run ${L.wait} for the result.`, `\u5DF2\u53D1\u7ED9 ${member.title}\u3002\u8FD0\u884C ${L.wait} \u7B49\u5F85\u7ED3\u679C\u3002`)));
    }
  });
  const waitTool = defineTool({
    name: L.wait,
    title: tr("Wait for the team", "\u7B49\u5F85\u56E2\u961F"),
    description: tr(
      `Wait until the current run's members finish (a team run: its last round, with no open task left for an idle member), a member needs attention, a plan waits for your approval, a member writes to you, or the timeout passes; then return their results or the new board posts. At most ${MAX_WAIT_SECONDS} seconds per call; call again while members still work.`,
      `\u7B49\u5F85\u5F53\u524D\u8FD0\u884C\u7684\u6210\u5458\u5B8C\u6210\uFF08\u56E2\u961F\u8FD0\u884C\uFF1A\u6700\u540E\u4E00\u8F6E\uFF0C\u4E14\u6CA1\u6709\u53EF\u6D3E\u7ED9\u7A7A\u95F2\u6210\u5458\u7684\u5F85\u529E\u4EFB\u52A1\uFF09\uFF0C\u6216\u6709\u6210\u5458\u9700\u8981\u5904\u7406\u3001\u6709\u8BA1\u5212\u7B49\u4F60\u5BA1\u6279\u3001\u6709\u6210\u5458\u7ED9\u4F60\u53D1\u6D88\u606F\u3001\u6216\u8D85\u65F6\uFF1B\u7136\u540E\u8FD4\u56DE\u7ED3\u679C\u6216\u9ED1\u677F\u4E0A\u7684\u65B0\u5E16\u5B50\u3002\u6BCF\u6B21\u6700\u591A ${MAX_WAIT_SECONDS} \u79D2\uFF1B\u6210\u5458\u8FD8\u5728\u5DE5\u4F5C\u65F6\u8BF7\u518D\u6B21\u8C03\u7528\u3002`
    ),
    input: object({ timeoutSeconds: number2().int().min(5).max(MAX_WAIT_SECONDS).optional().describe(tr(`Default 300, at most ${MAX_WAIT_SECONDS}`, `\u9ED8\u8BA4 300\uFF0C\u6700\u591A ${MAX_WAIT_SECONDS}`)) }),
    async execute({ timeoutSeconds }, { agent, signal }) {
      const ctx = await leadContext(agent);
      const first = store.leadRun(agent.id, false);
      if (!first) return fail(tr(`There is no run yet. Use ${L.delegate} or ${L.kickoff}.`, `\u8FD8\u6CA1\u6709\u8FD0\u884C\u3002\u8BF7\u7528 ${L.delegate} \u6216 ${L.kickoff}\u3002`));
      const deadline = Date.now() + (timeoutSeconds ?? 300) * 1e3;
      const known = new Set(first.members.filter((member) => member.state === "attention").map((member) => member.agentId));
      const knownPlans = new Set(pendingPlans(first).map((task) => task.id));
      const mailFrom = first.posts.at(-1)?.seq ?? 0;
      let lastCheck = 0;
      const finished = (run2) => runFinished(run2) && !isStaffing(run2.id) && (run2.mode !== "team" || !staffableRoles(ctx, run2).length);
      for (; ; ) {
        const run2 = store.get(first.id);
        const final2 = finished(run2);
        const attention = run2.members.some((member) => member.state === "attention" && !known.has(member.agentId));
        const plans = pendingPlans(run2).some((task) => !knownPlans.has(task.id));
        const mail = leadInbox(run2).some((post) => post.seq > mailFrom);
        const stalled = run2.members.length === 0 || !run2.members.some((member) => member.state === "working") && !nextStepPending(run2) && !isStaffing(run2.id);
        if (final2 || attention || plans || mail || stalled || Date.now() >= deadline || signal.aborted) break;
        if (Date.now() - lastCheck > 1e4) {
          lastCheck = Date.now();
          await reconcile(run2.id).catch((error2) => console.error(`[ensemble] reconcile ${run2.id} failed`, error2));
          continue;
        }
        await sleep(2e3, signal);
      }
      const run = store.get(first.id);
      const final = finished(run);
      const { text, readSeq } = resultsText(run);
      await store.mutate(run.id, (current) => ({ ...markCollected(current, now(), readSeq), notifiedRound: final ? Math.max(current.notifiedRound, current.round) : current.notifiedRound }));
      const head = final ? run.mode === "team" ? tr("The team run has finished. Check the done tasks against the brief's acceptance criteria, send back what misses them, and report to the user.", "\u56E2\u961F\u8FD0\u884C\u5DF2\u7ED3\u675F\u3002\u8BF7\u5BF9\u7167\u7B80\u62A5\u7684\u9A8C\u6536\u6807\u51C6\u68C0\u67E5\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\uFF0C\u628A\u4E0D\u8FBE\u6807\u7684\u6253\u56DE\uFF0C\u7136\u540E\u5411\u7528\u6237\u6C47\u62A5\u3002") : tr("Every member has finished.", "\u6240\u6709\u6210\u5458\u90FD\u5DF2\u5B8C\u6210\u3002") : pendingPlans(run).length ? tr(`Plans wait for your approval: review them with ${L.tasks}.`, `\u6709\u8BA1\u5212\u7B49\u4F60\u5BA1\u6279\uFF1A\u7528 ${L.tasks} \u5BA1\u6279\u3002`) : run.members.some((member) => member.state === "attention") ? tr("A member needs attention (a permission prompt or an error): tell the user which one. Others may still work.", "\u6709\u6210\u5458\u9700\u8981\u5904\u7406\uFF08\u6743\u9650\u8BF7\u6C42\u6216\u51FA\u9519\uFF09\uFF1A\u544A\u8BC9\u7528\u6237\u662F\u54EA\u4E00\u4E2A\u3002\u5176\u4ED6\u6210\u5458\u53EF\u80FD\u8FD8\u5728\u5DE5\u4F5C\u3002") : tr(`Members are still working. Run ${L.wait} again, or answer the user meanwhile; the plugin tells you when the run has finished.`, `\u6210\u5458\u8FD8\u5728\u5DE5\u4F5C\u3002\u8BF7\u518D\u6B21\u8FD0\u884C ${L.wait}\uFF0C\u6216\u5148\u56DE\u590D\u7528\u6237\uFF1B\u8FD0\u884C\u7ED3\u675F\u65F6\u63D2\u4EF6\u4F1A\u901A\u77E5\u4F60\u3002`);
      return leadMail(agent.id, ok(`${head}

${text}`, { runId: run.id, final, members: run.members.map(({ role, title, state }) => ({ role, title, state })) }));
    }
  });
  const boardTool = defineTool({
    name: L.board,
    title: tr("Read the team board", "\u8BFB\u53D6\u56E2\u961F\u9ED1\u677F"),
    description: tr("Team mode: read the shared board of the current team run: the task board, the brief and every member's posts.", "\u56E2\u961F\u6A21\u5F0F\uFF1A\u8BFB\u53D6\u5F53\u524D\u56E2\u961F\u8FD0\u884C\u7684\u5171\u4EAB\u9ED1\u677F\uFF1A\u4EFB\u52A1\u677F\u3001\u9700\u6C42\u7B80\u62A5\u548C\u6BCF\u4E2A\u6210\u5458\u7684\u5E16\u5B50\u3002"),
    input: object({ since: number2().int().min(0).optional().describe(tr("Only posts after this number", "\u53EA\u8BFB\u53D6\u8FD9\u4E2A\u7F16\u53F7\u4E4B\u540E\u7684\u5E16\u5B50")) }),
    async execute({ since }, { agent }) {
      await leadContext(agent);
      const run = leadTeamRun(agent.id);
      if (!run) return fail(tr("There is no team run.", "\u6CA1\u6709\u56E2\u961F\u8FD0\u884C\u3002"));
      const page = boardPage(run, since ?? 0, BOARD_LIMIT);
      await store.mutate(run.id, (current) => ({ ...current, leadReadSeq: Math.max(current.leadReadSeq, page.lastSeq) }));
      return leadMail(agent.id, ok(`${runSummary(run)}

${page.text}`));
    }
  });
  const closeTool = defineTool({
    name: L.close,
    title: tr("Close the run", "\u7ED3\u675F\u8FD0\u884C"),
    description: tr(
      "End the current run once the user accepted its result: it is closed, file claims are released, and with closeMembers the members' terminals are closed. A new run also closes the previous one.",
      "\u7528\u6237\u63A5\u53D7\u7ED3\u679C\u540E\u7ED3\u675F\u5F53\u524D\u8FD0\u884C\uFF1A\u8FD0\u884C\u5173\u95ED\u3001\u91CA\u653E\u6587\u4EF6\u8BA4\u9886\uFF1B\u8BBE\u7F6E closeMembers \u65F6\u4F1A\u5173\u95ED\u6210\u5458\u7684\u7EC8\u7AEF\u3002\u542F\u52A8\u65B0\u8FD0\u884C\u4E5F\u4F1A\u5173\u95ED\u4E0A\u4E00\u6B21\u8FD0\u884C\u3002"
    ),
    input: object({
      closeMembers: boolean2().optional().describe(tr("Close the members' terminals; they are started again when needed", "\u5173\u95ED\u6210\u5458\u7684\u7EC8\u7AEF\uFF1B\u9700\u8981\u65F6\u4F1A\u91CD\u65B0\u542F\u52A8")),
      archiveMembers: boolean2().optional().describe(tr("Same as closeMembers", "\u540C closeMembers")),
      note: string2().optional().describe(tr("A closing note for the board", "\u5199\u5728\u9ED1\u677F\u4E0A\u7684\u7ED3\u675F\u8BF4\u660E"))
    }),
    async execute({ closeMembers, archiveMembers: legacyArchive, note }, { agent }) {
      const archiveMembers = closeMembers ?? legacyArchive;
      await leadContext(agent);
      const run = store.leadRun(agent.id, true);
      if (!run) return ok(tr("No run is in progress.", "\u6CA1\u6709\u8FDB\u884C\u4E2D\u7684\u8FD0\u884C\u3002"));
      const working = workingMembers(run);
      if (working.length) return fail(tr(`${working.map((member) => member.title).join(", ")} still work. Run ${L.wait} first.`, `${working.map((member) => member.title).join(", ")} \u8FD8\u5728\u5DE5\u4F5C\uFF0C\u8BF7\u5148\u8FD0\u884C ${L.wait}\u3002`));
      await store.mutate(run.id, (current) => {
        const noted = note?.trim() && current.mode === "team" ? addPost(current, { author: "lead", agentId: agent.id, kind: "note", text: note.trim(), to: [], files: [] }, now()).run : current;
        return { ...noted, status: "closed", claims: [], updatedAt: now() };
      });
      let archived = 0;
      let stopped = 0;
      if (archiveMembers) {
        for (const member of run.members) {
          const session = store.member(member.agentId);
          if (orchestra?.holds(session)) {
            const result = await orchestra.stop(session.dispatchId);
            if (result.ok) stopped += 1;
            else orca().orca.log(`[ensemble] run ${run.id}: Orca did not stop the worker of ${member.title} (${session.dispatchId}): ${result.error ?? result.state}`);
          }
          if (!await isIdleAgent(member.agentId, store.lead(agent.id)?.workspaceId ?? null)) continue;
          await orca().closeTerminal(member.agentId).then(() => {
            archived += 1;
          }, () => void 0);
        }
      }
      const open2 = run.tasks.filter((task) => task.state === "todo" || task.state === "doing");
      const ids = open2.map((task) => task.id).join(", ");
      const stoppedNote = zh ? `\u5DF2\u505C\u6B62 ${stopped} \u4E2A\u6210\u5458\u7684 Orca \u5DE5\u4F5C\u5355\u5143\u3002` : ` Stopped ${stopped} member worker${stopped === 1 ? "" : "s"} in Orca.`;
      return ok(zh ? `\u5DF2\u7ED3\u675F\u8FD0\u884C ${run.id}\u300C${run.title}\u300D\u3002${archiveMembers ? `\u5DF2\u5173\u95ED ${archived} \u4E2A\u6210\u5458\u7684\u7EC8\u7AEF\u3002${stopped ? stoppedNote : ""}` : ""}${open2.length ? `\u8FD8\u6709 ${open2.length} \u4E2A\u4EFB\u52A1\u672A\u5B8C\u6210\uFF1A${ids}\u3002` : ""}` : `Closed run ${run.id} "${run.title}".${archiveMembers ? ` Closed ${archived} member terminal${archived === 1 ? "" : "s"}.${stopped ? stoppedNote : ""}` : ""}${open2.length ? ` ${open2.length} task${open2.length === 1 ? " was" : "s were"} still open: ${ids}.` : ""}`);
    }
  });
  const readTool = defineTool({
    name: MEMBER_TOOLS.read,
    title: tr("Read the team board", "\u8BFB\u53D6\u56E2\u961F\u9ED1\u677F"),
    description: tr("Read your team run's shared board: the brief the user agreed, the task board, claimed files and every member's posts.", "\u8BFB\u53D6\u4F60\u6240\u5728\u56E2\u961F\u8FD0\u884C\u7684\u5171\u4EAB\u9ED1\u677F\uFF1A\u7528\u6237\u786E\u8BA4\u7684\u9700\u6C42\u7B80\u62A5\u3001\u4EFB\u52A1\u677F\u3001\u5DF2\u8BA4\u9886\u7684\u6587\u4EF6\u548C\u6BCF\u4E2A\u6210\u5458\u7684\u5E16\u5B50\u3002"),
    input: object({ since: number2().int().min(0).optional().describe(tr("Only posts after this number; all posts and the brief when omitted", "\u53EA\u8BFB\u53D6\u8FD9\u4E2A\u7F16\u53F7\u4E4B\u540E\u7684\u5E16\u5B50\uFF1B\u4E0D\u586B\u5219\u8BFB\u53D6\u5168\u90E8\u5E16\u5B50\u548C\u7B80\u62A5")) }),
    async execute({ since }, { agent }) {
      await store.load();
      const found = await memberTeamRun(agent.id);
      if (!found) return fail(notInTeam);
      const { run, member } = found;
      const claims = run.claims.length ? `

${tr("Claimed paths", "\u5DF2\u8BA4\u9886\u7684\u8DEF\u5F84")}: ${run.claims.map((claim2) => `${claim2.path || "."} (${claim2.role})`).join(", ")}` : "";
      const page = boardPage(run, since ?? 0, BOARD_LIMIT);
      const ready = run.tasks.filter((task) => taskReady(run, task) && mayTake(member, task)).map((task) => task.id);
      await store.mutate(run.id, (current) => markInbox(updateMember(current, agent.id, { readSeq: Math.max(memberOf(current, agent.id)?.readSeq ?? 0, page.lastSeq) }, now()), agent.id, page.lastSeq, now()));
      return withMail(run.id, agent.id, ok([
        tr(`Team run ${run.id}, round ${run.round} of ${run.rounds}. You are ${key(member.title) === key(member.role) ? `the ${member.role} member` : memberName(member)}.`, `\u56E2\u961F\u8FD0\u884C ${run.id}\uFF0C\u7B2C ${run.round}/${run.rounds} \u8F6E\u3002\u4F60\u662F${key(member.title) === key(member.role) ? ` ${member.role} \u89D2\u8272\u7684\u6210\u5458` : ` ${memberName(member, true)}`}\u3002`) + (member.retired ? tr(" You were replaced in this run: take no more tasks.", "\u4F60\u5728\u8FD9\u6B21\u8FD0\u884C\u4E2D\u5DF2\u88AB\u66FF\u6362\uFF1A\u4E0D\u8981\u518D\u9886\u53D6\u4EFB\u52A1\u3002") : ""),
        "",
        taskBoardText(run, lang),
        ready.length ? tr(`Ready for you: ${ready.join(", ")}.`, `\u4F60\u53EF\u4EE5\u9886\u53D6\uFF1A${ready.join(", ")}\u3002`) : tr("No task is ready for you.", "\u73B0\u5728\u6CA1\u6709\u4F60\u53EF\u4EE5\u9886\u53D6\u7684\u4EFB\u52A1\u3002"),
        "",
        page.text + claims
      ].join("\n")));
    }
  });
  const postTool = defineTool({
    name: MEMBER_TOOLS.post,
    title: tr("Post to the team board", "\u5728\u56E2\u961F\u9ED1\u677F\u53D1\u5E16"),
    description: tr(
      `Post on your team run's shared board. Kinds: update (a decision others depend on), finding (a problem in someone's work), question (set "to"), answer, done (your part is finished: what changed and how you checked it). Address roles, "lead" or "${TO_ALL}" with "to"; addressed members get it in their next tool result, and are woken when idle.`,
      `\u5728\u56E2\u961F\u8FD0\u884C\u7684\u5171\u4EAB\u9ED1\u677F\u4E0A\u53D1\u5E16\u3002kind\uFF1Aupdate\uFF08\u522B\u4EBA\u4F9D\u8D56\u7684\u51B3\u5B9A\uFF09\u3001finding\uFF08\u522B\u4EBA\u5DE5\u4F5C\u4E2D\u7684\u95EE\u9898\uFF09\u3001question\uFF08\u9700\u8BBE\u7F6E "to"\uFF09\u3001answer\u3001done\uFF08\u4F60\u7684\u90E8\u5206\u5B8C\u6210\u4E86\uFF1A\u6539\u4E86\u4EC0\u4E48\u3001\u600E\u4E48\u9A8C\u8BC1\u7684\uFF09\u3002\u7528 "to" \u6307\u5B9A\u89D2\u8272\u3001\u6210\u5458\u540D\u3001"lead" \u6216 "${TO_ALL}"\uFF1B\u6536\u4EF6\u6210\u5458\u4F1A\u5728\u4E0B\u4E00\u6B21\u5DE5\u5177\u8FD4\u56DE\u4E2D\u6536\u5230\uFF0C\u7A7A\u95F2\u65F6\u4F1A\u88AB\u5524\u9192\u3002`
    ),
    input: object({
      kind: _enum(MEMBER_POST_KINDS),
      text: string2().min(1),
      to: array(string2().min(1)).optional().describe(tr(`Role names, a member's title, "lead", or "${TO_ALL}"`, `\u89D2\u8272\u540D\u3001\u6210\u5458\u540D\u3001"lead" \u6216 "${TO_ALL}"`)),
      files: array(string2().min(1)).optional().describe(tr("Files the post is about", "\u5E16\u5B50\u6D89\u53CA\u7684\u6587\u4EF6"))
    }),
    async execute({ kind, text, to, files }, { agent }) {
      await store.load();
      const found = await memberTeamRun(agent.id);
      if (!found) return fail(notInTeam);
      const { member } = found;
      const recipients = [...new Set((to ?? []).map((name2) => name2.trim()).filter(Boolean))];
      let posted = 0;
      const run = await store.mutate(found.run.id, (current) => {
        const result = addPost(current, { author: member.role, agentId: agent.id, kind, text, to: recipients, files: files ?? [] }, now());
        posted = result.post.seq;
        return result.run;
      });
      const notes = [];
      const everyone = recipients.some((name2) => key(name2) === TO_ALL);
      if (recipients.some((name2) => key(name2) === "lead")) {
        const message = zh ? `${PLUGIN_MESSAGE_PREFIX} ${memberName(member, true)}\u5728\u56E2\u961F\u8FD0\u884C ${run.id} \u7684\u9ED1\u677F\u4E0A\u7ED9\u4F60\u7559\u8A00\uFF08#${posted}\uFF0C${kind}\uFF09\uFF1A
${text}

\u7528 ${L.broadcast} \u6216 ${L.send} \u56DE\u590D\uFF1B\u5982\u679C\u6D89\u53CA\u9700\u6C42\u53D8\u66F4\uFF0C\u5148\u95EE\u7528\u6237\u3002\u8BF7\u7528\u4E2D\u6587\u56DE\u590D\u3002` : `${PLUGIN_MESSAGE_PREFIX} ${memberName(member)} wrote to you on the board of team run ${run.id} (#${posted}, ${kind}):
${text}

Answer with ${L.broadcast} or ${L.send}; ask the user first when it changes the requirement.`;
        const sent = await sendIfIdle(run.leadAgentId, message).catch(() => false);
        if (sent) await store.mutate(run.id, (current) => markInbox(current, "lead", posted, now()));
        notes.push(sent ? tr("The lead was told.", "\u5DF2\u901A\u77E5\u534F\u8C03\u5668\u3002") : tr("The lead gets it with its next tool result.", "\u534F\u8C03\u5668\u4F1A\u5728\u4E0B\u4E00\u6B21\u5DE5\u5177\u8FD4\u56DE\u4E2D\u6536\u5230\u3002"));
      }
      const targets = run.members.filter((entry) => entry.agentId !== agent.id && !entry.retired && entry.state !== "failed" && (everyone || recipients.some((name2) => key(name2) === key(entry.role) || key(name2) === key(entry.title))));
      for (const name2 of recipients) {
        if (key(name2) !== "lead" && key(name2) !== TO_ALL && !run.members.some((entry) => key(entry.role) === key(name2) || key(entry.title) === key(name2))) notes.push(tr(`No member of this run has the role or title "${name2}".`, `\u672C\u6B21\u8FD0\u884C\u4E2D\u6CA1\u6709\u89D2\u8272\u6216\u6210\u5458\u540D\u4E3A\u300C${name2}\u300D\u7684\u6210\u5458\u3002`));
      }
      for (const target of targets) {
        if (target.state === "working" || target.state === "attention") {
          notes.push(tr(`${target.title} gets it with its next tool result.`, `${target.title} \u4F1A\u5728\u4E0B\u4E00\u6B21\u5DE5\u5177\u8FD4\u56DE\u4E2D\u6536\u5230\u3002`));
        } else if (target.state === "done" && target.nudges < MAX_NUDGES && run.status === "active") {
          const unread = inboxOf(store.get(run.id), target.agentId);
          const sent = await sendIfIdle(target.agentId, promptsFor(run.language).mentionPrompt(run, unread)).catch(() => false);
          if (sent) await store.mutate(run.id, (current) => markInbox(updateMember(current, target.agentId, { state: "working", nudges: target.nudges + 1, collected: false, dispatchedAt: now() }, now()), target.agentId, unread.at(-1)?.seq ?? posted, now()));
          notes.push(sent ? tr(`${target.title} was woken to answer.`, `\u5DF2\u5524\u9192 ${target.title} \u6765\u56DE\u590D\u3002`) : tr(`${target.title} will see it on the board.`, `${target.title} \u4F1A\u5728\u9ED1\u677F\u4E0A\u770B\u5230\u3002`));
        } else {
          notes.push(tr(`${target.title} will see it on the board.`, `${target.title} \u4F1A\u5728\u9ED1\u677F\u4E0A\u770B\u5230\u3002`));
        }
      }
      return withMail(run.id, agent.id, ok([tr(`Posted #${posted}.`, `\u5DF2\u53D1\u5E16 #${posted}\u3002`), ...notes, kind === "done" ? tr("Your claims are released. End your turn now unless a task is ready for you.", "\u4F60\u7684\u8BA4\u9886\u5DF2\u91CA\u653E\u3002\u5982\u679C\u6CA1\u6709\u53EF\u9886\u53D6\u7684\u4EFB\u52A1\uFF0C\u8BF7\u73B0\u5728\u7ED3\u675F\u672C\u8F6E\u3002") : ""].filter(Boolean).join(" ")));
    }
  });
  const claimTool = defineTool({
    name: MEMBER_TOOLS.claim,
    title: tr("Claim files", "\u8BA4\u9886\u6587\u4EF6"),
    description: tr(
      "Claim the files or folders you are about to edit, so no other member edits them at the same time; or release them. Nothing is claimed when another member holds an overlapping path. Claiming a task already claims its files.",
      "\u8BA4\u9886\u4F60\u8981\u4FEE\u6539\u7684\u6587\u4EF6\u6216\u6587\u4EF6\u5939\uFF0C\u907F\u514D\u5176\u4ED6\u6210\u5458\u540C\u65F6\u4FEE\u6539\uFF1B\u4E5F\u53EF\u4EE5\u91CA\u653E\u3002\u522B\u4EBA\u6301\u6709\u91CD\u53E0\u8DEF\u5F84\u65F6\u4E0D\u4F1A\u8BA4\u9886\u4EFB\u4F55\u8DEF\u5F84\u3002\u9886\u53D6\u4EFB\u52A1\u65F6\u5DF2\u7ECF\u4E00\u5E76\u8BA4\u9886\u4E86\u5B83\u7684\u6587\u4EF6\u3002"
    ),
    input: object({
      paths: array(string2()).min(1).describe(tr('Repository-relative files or folders; "." is the whole repository', '\u4ED3\u5E93\u5185\u7684\u76F8\u5BF9\u8DEF\u5F84\uFF08\u6587\u4EF6\u6216\u6587\u4EF6\u5939\uFF09\uFF1B"." \u8868\u793A\u6574\u4E2A\u4ED3\u5E93')),
      release: boolean2().optional().describe(tr("Release these paths instead of claiming them", "\u6539\u4E3A\u91CA\u653E\u8FD9\u4E9B\u8DEF\u5F84"))
    }),
    async execute({ paths, release }, { agent }) {
      await store.load();
      const found = await memberTeamRun(agent.id);
      if (!found) return fail(notInTeam);
      if (release) {
        await store.mutate(found.run.id, (current) => releaseClaims(current, agent.id, paths));
        return withMail(found.run.id, agent.id, ok(tr(`Released ${paths.join(", ")}.`, `\u5DF2\u91CA\u653E ${paths.join(", ")}\u3002`)));
      }
      let conflicts = [];
      await store.mutate(found.run.id, (current) => {
        const result = claimPaths(current, agent.id, paths, now());
        conflicts = result.conflicts;
        return result.run;
      });
      if (conflicts.length) {
        await store.log(found.run.id, [{ component: "claims", action: "conflict", direction: "in", from: agent.id, to: [...new Set(conflicts.map((conflict) => conflict.heldBy))], subject: conflicts.map((conflict) => conflict.path).join(", "), note: conflicts.map((conflict) => `${conflict.held} (${conflict.heldBy})`).join(", ") }]);
        return withMail(found.run.id, agent.id, fail(zh ? `\u6CA1\u6709\u8BA4\u9886\u4EFB\u4F55\u8DEF\u5F84\uFF1A${conflicts.map((conflict) => `${conflict.path} \u4E0E ${conflict.held} \u91CD\u53E0\uFF08\u88AB ${conflict.heldBy} \u6301\u6709\uFF09`).join("\uFF1B")}\u3002\u8BF7\u5728\u9ED1\u677F\u4E0A\u95EE\u5BF9\u65B9\uFF08${MEMBER_TOOLS.post}\uFF0Ckind "question"\uFF0C\u8BBE\u7F6E "to"\uFF09\uFF0C\u4E0D\u8981\u76F4\u63A5\u4FEE\u6539\u3002` : `Nothing claimed: ${conflicts.map((conflict) => `${conflict.path} overlaps ${conflict.held}, held by ${conflict.heldBy}`).join("; ")}. Ask them on the board (${MEMBER_TOOLS.post} kind "question" with "to") instead of editing it.`));
      }
      return withMail(found.run.id, agent.id, ok(tr(`Claimed ${paths.join(", ")}. Your claims are released when you post "done" or your turn ends.`, `\u5DF2\u8BA4\u9886 ${paths.join(", ")}\u3002\u53D1 "done" \u5E16\u5B50\u6216\u672C\u8F6E\u7ED3\u675F\u65F6\u4F1A\u81EA\u52A8\u91CA\u653E\u3002`)));
    }
  });
  const taskTool = defineTool({
    name: MEMBER_TOOLS.task,
    title: tr("Work with the task board", "\u64CD\u4F5C\u4EFB\u52A1\u677F"),
    description: tr(
      `Your team run's task board. action "claim": take a ready task (the given id, or the next ready one for you); "done": finish your task with a result (what you changed and how you checked it); "release": put your task back; "add": add a task for work you found (title, detail, role, after, files); "plan": submit your plan for a task when the run needs plan approval; "reject": send another member's done task back to its role with a reason (review).`,
      '\u4F60\u6240\u5728\u56E2\u961F\u8FD0\u884C\u7684\u4EFB\u52A1\u677F\u3002action "claim"\uFF1A\u9886\u53D6\u4E00\u4E2A\u53EF\u505A\u7684\u4EFB\u52A1\uFF08\u6307\u5B9A id\uFF0C\u6216\u9886\u53D6\u4E0B\u4E00\u4E2A\u9002\u5408\u4F60\u7684\uFF09\uFF1B"done"\uFF1A\u5E26 result \u5B8C\u6210\u4F60\u7684\u4EFB\u52A1\uFF08\u6539\u4E86\u4EC0\u4E48\u3001\u600E\u4E48\u9A8C\u8BC1\u7684\uFF09\uFF1B"release"\uFF1A\u628A\u4EFB\u52A1\u653E\u56DE\u4EFB\u52A1\u677F\uFF1B"add"\uFF1A\u4E3A\u4F60\u53D1\u73B0\u7684\u5DE5\u4F5C\u65B0\u589E\u4EFB\u52A1\uFF08title\u3001detail\u3001role\u3001after\u3001files\uFF09\uFF1B"plan"\uFF1A\u9700\u8981\u8BA1\u5212\u5BA1\u6279\u65F6\u63D0\u4EA4\u4EFB\u52A1\u8BA1\u5212\uFF1B"reject"\uFF1A\u5E26\u7406\u7531\u628A\u522B\u7684\u6210\u5458\u5DF2\u5B8C\u6210\u7684\u4EFB\u52A1\u6253\u56DE\u7ED9\u539F\u89D2\u8272\uFF08\u8BC4\u5BA1\uFF09\u3002'
    ),
    input: object({
      action: _enum(["claim", "done", "release", "add", "plan", "reject"]),
      id: string2().optional().describe(tr("The task, such as T3", "\u4EFB\u52A1\u7F16\u53F7\uFF0C\u4F8B\u5982 T3")),
      result: string2().optional().describe(tr('For "done": what you changed and how you checked it', '"done" \u7528\uFF1A\u6539\u4E86\u4EC0\u4E48\u3001\u600E\u4E48\u9A8C\u8BC1\u7684')),
      text: string2().optional().describe(tr('For "plan": what you will change and how you will check it', '"plan" \u7528\uFF1A\u51C6\u5907\u6539\u4EC0\u4E48\u3001\u600E\u4E48\u9A8C\u8BC1')),
      reason: string2().optional().describe(tr('For "reject": what is wrong', '"reject" \u7528\uFF1A\u95EE\u9898\u662F\u4EC0\u4E48')),
      title: string2().optional().describe(tr('For "add"', '"add" \u7528')),
      detail: string2().optional().describe(tr('For "add": what done means', '"add" \u7528\uFF1A\u600E\u6837\u7B97\u5B8C\u6210')),
      role: string2().optional().describe(tr('For "add": the role that should do it; omit for anyone', '"add" \u7528\uFF1A\u5E94\u7531\u54EA\u4E2A\u89D2\u8272\u505A\uFF1B\u4E0D\u586B\u8868\u793A\u4EFB\u4F55\u4EBA')),
      after: array(string2()).optional().describe(tr('For "add": ids of tasks it waits for', '"add" \u7528\uFF1A\u5B83\u8981\u7B49\u5F85\u7684\u4EFB\u52A1\u7F16\u53F7')),
      files: array(string2()).optional().describe(tr('For "add": paths it will change', '"add" \u7528\uFF1A\u5B83\u4F1A\u6539\u52A8\u7684\u8DEF\u5F84'))
    }),
    async execute(input, { agent }) {
      await store.load();
      const found = await memberTeamRun(agent.id);
      if (!found) return fail(notInTeam);
      const { member } = found;
      const runId = found.run.id;
      const need = (value, what) => value?.trim() ? null : tr(`Give ${what}.`, `\u8BF7\u63D0\u4F9B${what}\u3002`);
      let error2;
      let reply = "";
      if (input.action === "claim") {
        if (member.retired) return withMail(runId, agent.id, fail(tr("You were replaced in this run; take no more tasks. End your turn.", "\u4F60\u5728\u8FD9\u6B21\u8FD0\u884C\u4E2D\u5DF2\u88AB\u66FF\u6362\uFF0C\u4E0D\u8981\u518D\u9886\u53D6\u4EFB\u52A1\u3002\u8BF7\u7ED3\u675F\u672C\u8F6E\u3002")));
        let task;
        await store.mutate(runId, (current) => {
          const result = claimTask(current, agent.id, input.id, now());
          error2 = result.error;
          task = result.task;
          return result.run;
        });
        if (task) {
          reply = [
            tr(`${task.id} is yours: ${task.title}`, `${task.id} \u5F52\u4F60\u4E86\uFF1A${task.title}`),
            task.detail,
            task.files.length ? tr(`Files (claimed for you): ${task.files.join(", ")}`, `\u6587\u4EF6\uFF08\u5DF2\u4E3A\u4F60\u8BA4\u9886\uFF09\uFF1A${task.files.join(", ")}`) : "",
            task.feedback ? tr(`Sent back before: ${task.feedback}`, `\u4E4B\u524D\u88AB\u6253\u56DE\u7684\u539F\u56E0\uFF1A${task.feedback}`) : "",
            found.run.planApproval ? tr(`Submit your plan (action "plan") and end your turn; work once it is approved.`, `\u5148\u63D0\u4EA4\u8BA1\u5212\uFF08action "plan"\uFF09\u5E76\u7ED3\u675F\u672C\u8F6E\uFF0C\u6279\u51C6\u540E\u518D\u52A8\u624B\u3002`) : tr(`When it is finished, mark it done (action "done").`, `\u5B8C\u6210\u540E\u6807\u8BB0\u4E3A\u5B8C\u6210\uFF08action "done"\uFF09\u3002`)
          ].filter(Boolean).join("\n");
        }
      } else if (input.action === "done") {
        error2 = need(input.id, tr("the task id", "\u4EFB\u52A1\u7F16\u53F7")) ?? need(input.result, tr("a result: what you changed and how you checked it", "\u7ED3\u679C\uFF1A\u6539\u4E86\u4EC0\u4E48\u3001\u600E\u4E48\u9A8C\u8BC1\u7684")) ?? void 0;
        if (!error2) await store.mutate(runId, (current) => {
          const result = completeTask(current, agent.id, input.id, input.result, now());
          error2 = result.error;
          return result.run;
        });
        if (!error2) {
          const run = store.get(runId);
          const ready = run.tasks.filter((task) => taskReady(run, task) && mayTake(member, task)).map((task) => task.id);
          const id = input.id.toUpperCase();
          reply = ready.length ? tr(`${id} is done. Ready for you next: ${ready.join(", ")} (action "claim").`, `${id} \u5DF2\u5B8C\u6210\u3002\u63A5\u4E0B\u6765\u4F60\u53EF\u4EE5\u9886\u53D6\uFF1A${ready.join(", ")}\uFF08action "claim"\uFF09\u3002`) : tr(`${id} is done. No task is ready for you: post "done" with a summary and end your turn; you are woken when one opens up.`, `${id} \u5DF2\u5B8C\u6210\u3002\u73B0\u5728\u6CA1\u6709\u4F60\u53EF\u4EE5\u9886\u53D6\u7684\u4EFB\u52A1\uFF1A\u53D1\u4E00\u6761 "done" \u5E16\u5B50\u603B\u7ED3\u540E\u7ED3\u675F\u672C\u8F6E\uFF0C\u6709\u65B0\u4EFB\u52A1\u65F6\u4F1A\u5524\u9192\u4F60\u3002`);
        }
      } else if (input.action === "release") {
        error2 = need(input.id, tr("the task id", "\u4EFB\u52A1\u7F16\u53F7")) ?? void 0;
        if (!error2) await store.mutate(runId, (current) => {
          const result = releaseTask(current, agent.id, input.id, now());
          error2 = result.error;
          return result.run;
        });
        if (!error2) reply = tr(`${input.id.toUpperCase()} is back on the board. Say why on the board (${MEMBER_TOOLS.post}).`, `${input.id.toUpperCase()} \u5DF2\u653E\u56DE\u4EFB\u52A1\u677F\u3002\u8BF7\u5728\u9ED1\u677F\u4E0A\u8BF4\u660E\u539F\u56E0\uFF08${MEMBER_TOOLS.post}\uFF09\u3002`);
      } else if (input.action === "add") {
        error2 = need(input.title, tr("a title", "\u6807\u9898")) ?? void 0;
        const role = input.role?.trim() && key(input.role) !== "anyone" && input.role.trim() !== "\u4EFB\u4F55\u4EBA" ? input.role.trim() : null;
        if (!error2 && role) {
          const run = store.get(runId);
          const ctx = await leadContext({ id: run.leadAgentId, workspaceId: run.workspaceId }).catch(() => null);
          const spec = ctx ? roleSpec(ctx, role) : null;
          const roles = run.members.filter((entry) => !entry.retired).map((entry) => entry.role).join(", ");
          if (!spec || spec.name === HELPER) error2 = tr(`Unknown role "${role}". Roles in this run: ${roles}; ask the lead for another.`, `\u672A\u77E5\u89D2\u8272\u300C${role}\u300D\u3002\u672C\u6B21\u8FD0\u884C\u4E2D\u7684\u89D2\u8272\uFF1A${roles}\uFF1B\u9700\u8981\u5176\u4ED6\u89D2\u8272\u8BF7\u95EE\u534F\u8C03\u5668\u3002`);
        }
        if (!error2) {
          let added = [];
          await store.mutate(runId, (current) => {
            const result = addTasks(current, [{ title: input.title, detail: input.detail, role, after: input.after, files: input.files }], member.role, now());
            error2 = result.errors[0];
            added = result.added;
            return result.run;
          });
          if (!error2) reply = tr(`Added ${added.map((task) => task.id).join(", ")}. It goes to ${role ?? "anyone"} once it is ready.`, `\u5DF2\u65B0\u589E ${added.map((task) => task.id).join(", ")}\u3002\u53EF\u4EE5\u5F00\u59CB\u65F6\u4F1A\u4EA4\u7ED9 ${role ?? "\u4EFB\u4F55\u4EBA"}\u3002`);
        }
      } else if (input.action === "plan") {
        error2 = need(input.id, tr("the task id", "\u4EFB\u52A1\u7F16\u53F7")) ?? need(input.text, tr("the plan", "\u8BA1\u5212\u5185\u5BB9")) ?? void 0;
        if (!error2) await store.mutate(runId, (current) => {
          const result = submitPlan(current, agent.id, input.id, input.text, now());
          error2 = result.error;
          return result.run;
        });
        if (!error2) reply = tr(`Plan for ${input.id.toUpperCase()} submitted. End your turn now; you are woken when the lead approves it or sends it back.`, `${input.id.toUpperCase()} \u7684\u8BA1\u5212\u5DF2\u63D0\u4EA4\u3002\u8BF7\u73B0\u5728\u7ED3\u675F\u672C\u8F6E\uFF1B\u534F\u8C03\u5668\u6279\u51C6\u6216\u6253\u56DE\u65F6\u4F1A\u5524\u9192\u4F60\u3002`);
      } else {
        error2 = need(input.id, tr("the task id", "\u4EFB\u52A1\u7F16\u53F7")) ?? need(input.reason, tr("the reason", "\u7406\u7531")) ?? void 0;
        const task = input.id ? taskOf(store.get(runId), input.id) : void 0;
        if (!error2 && task?.owner === agent.id) error2 = tr("That is your own task; fix it yourself.", "\u8FD9\u662F\u4F60\u81EA\u5DF1\u7684\u4EFB\u52A1\uFF0C\u8BF7\u81EA\u5DF1\u4FEE\u6B63\u3002");
        if (!error2) {
          let rejected;
          await store.mutate(runId, (current) => {
            const result = rejectTask(current, input.id, input.reason, now());
            error2 = result.error;
            rejected = result.task;
            if (!result.task) return result.run;
            const text = zh ? `\u5DF2\u6253\u56DE ${result.task.id}\u300C${result.task.title}\u300D\uFF1A${input.reason.trim()}` : `Sent ${result.task.id} "${result.task.title}" back: ${input.reason.trim()}`;
            return addPost(result.run, { author: member.role, agentId: agent.id, kind: "finding", text, to: result.task.role ? [result.task.role] : [TO_ALL], files: result.task.files }, now()).run;
          });
          if (rejected) reply = tr(`${rejected.id} goes back to ${rejected.role ?? "anyone"} with your reason.`, `${rejected.id} \u5DF2\u5E26\u7740\u4F60\u7684\u7406\u7531\u9000\u56DE\u7ED9 ${rejected.role ?? "\u4EFB\u4F55\u4EBA"}\u3002`);
        }
      }
      if (error2) return withMail(runId, agent.id, fail(error2));
      await advance(runId);
      return withMail(runId, agent.id, ok(reply));
    }
  });
  const reportTool = defineTool({
    name: MEMBER_TOOLS.report,
    title: tr("Report your result", "\u6C47\u62A5\u7ED3\u679C"),
    description: tr(
      'Hand your result to the lead: what you changed (files), how you checked it, and anything left or blocked. In a delegation run it finishes your task at once; in a team run it posts "done" with it. End your turn after it.',
      '\u628A\u7ED3\u679C\u4EA4\u7ED9\u534F\u8C03\u5668\uFF1A\u6539\u4E86\u54EA\u4E9B\u6587\u4EF6\u3001\u600E\u4E48\u9A8C\u8BC1\u7684\u3001\u8FD8\u6709\u4EC0\u4E48\u6CA1\u5B8C\u6210\u6216\u53D7\u963B\u3002\u59D4\u6D3E\u8FD0\u884C\u4E2D\u4F1A\u7ACB\u5373\u5B8C\u6210\u4F60\u7684\u4EFB\u52A1\uFF1B\u56E2\u961F\u8FD0\u884C\u4E2D\u4F1A\u4EE5 "done" \u5E16\u5B50\u53D1\u51FA\u3002\u4E4B\u540E\u7ED3\u675F\u672C\u8F6E\u3002'
    ),
    input: object({ result: string2().min(1).describe(tr("Your report, at most 300 words", "\u4F60\u7684\u6C47\u62A5\uFF0C\u4E0D\u8D85\u8FC7 500 \u5B57")) }),
    async execute({ result }, { agent }) {
      await store.load();
      const run = store.memberRun(agent.id);
      const member = run ? memberOf(run, agent.id) : void 0;
      if (!run || !member) return fail(notInTeam);
      if (run.mode === "team") {
        await store.mutate(run.id, (current) => addPost(touchMember(current, agent.id, now()), { author: member.role, agentId: agent.id, kind: "done", text: result, to: [], files: [] }, now()).run);
        await advance(run.id);
        return withMail(run.id, agent.id, ok(tr("Posted as done. End your turn unless a task is ready for you.", "\u5DF2\u4F5C\u4E3A done \u5E16\u5B50\u53D1\u51FA\u3002\u5982\u679C\u6CA1\u6709\u53EF\u9886\u53D6\u7684\u4EFB\u52A1\uFF0C\u8BF7\u7ED3\u675F\u672C\u8F6E\u3002")));
      }
      if (member.state === "working" || member.state === "attention") {
        await store.mutate(run.id, (current) => finishMember(current, agent.id, "completed", result, now()));
        await advance(run.id);
      } else {
        await store.mutate(run.id, (current) => amendReport(current, agent.id, result), { trace: false });
      }
      const session = store.member(agent.id);
      if (orchestra?.holds(session) && session.orcaTaskId) {
        const done = await orchestra.workerDone(agent.id, session.dispatchId, session.orcaTaskId, "succeeded", member.title, excerpt(result, 4e3));
        if (done) await store.setMember({ ...session, dispatchId: void 0, orcaTaskId: void 0 });
      }
      return ok(tr("The lead has your report. End your turn now.", "\u534F\u8C03\u5668\u5DF2\u6536\u5230\u4F60\u7684\u6C47\u62A5\u3002\u8BF7\u73B0\u5728\u7ED3\u675F\u672C\u8F6E\u3002"));
    }
  });
  const as = (tool, actorOf) => ({
    ...tool,
    execute: (input, context) => asActor(actorOf(context.agent.id), () => Promise.resolve(tool.execute(input, context)))
  });
  return {
    lead: [statusTool, roleTool, delegateTool, briefTool, kickoffTool, tasksTool, broadcastTool, sendTool, waitTool, boardTool, closeTool].map((tool) => as(tool, () => "lead")),
    member: [readTool, taskTool, postTool, claimTool, reportTool].map((tool) => as(tool, (agentId) => agentId))
  };
}
var TOOLSETS = { en: buildTools("en"), zh: buildTools("zh") };
function fieldsOf(schema) {
  try {
    const json = toJSONSchema(schema, { unrepresentable: "any", io: "input" });
    return Object.entries(json.properties ?? {}).map(([field, spec]) => {
      const type = spec.type === "array" ? `${spec.items?.type === "object" ? "object" : spec.items?.type ?? "any"}[]` : spec.enum ? spec.enum.map((value) => JSON.stringify(value)).join(" | ") : spec.type ?? "any";
      const items = spec.type === "array" && spec.items?.properties ? ` of { ${Object.keys(spec.items.properties).join(", ")} }` : spec.type === "object" && spec.properties ? ` { ${Object.keys(spec.properties).join(", ")} }` : "";
      return `  ${field}${json.required?.includes(field) ? "" : "?"}: ${type}${items}${spec.description ? `  ${spec.description}` : ""}`;
    });
  } catch {
    return [];
  }
}
var shown = /* @__PURE__ */ new Set();
async function handleShim(request, caller = null) {
  await store.load();
  const terminalId = request.terminalId;
  if (!terminalId) return { isError: true, text: "agent-team runs only inside Orca, in a terminal or a chat: neither ORCA_TERMINAL_HANDLE nor ORCA_AGENT_SESSION_ID is set." };
  orca().learnProfile(request.userDataPath);
  if (request.command.trim().toLowerCase() === "check-team") {
    const given = String(request.input?.file ?? request.input?.text ?? "").trim();
    if (!given) return { isError: true, text: "Usage: agent-team check-team <path to a .team.json file>" };
    const path = isAbsolute(given) ? given : join5(request.cwd, given);
    const parsed2 = parseTeam(await readFile3(path, "utf8").catch(() => ""));
    return parsed2.ok ? { isError: false, text: `OK: ${given} is a valid team (${parsed2.team.roles.length} roles, ${parsed2.team.candidates.length} candidates, mode ${parsed2.team.mode}).` } : { isError: true, text: `${given} has problems:
${parsed2.errors.map((error2) => `- ${error2}`).join("\n")}` };
  }
  const lead = store.lead(terminalId);
  const member = store.member(terminalId);
  const memberLead = member ? store.lead(member.leadTerminalId) : void 0;
  const lang = lead?.language ?? memberLead?.language ?? "en";
  const tools = lead ? TOOLSETS[lang].lead : member ? TOOLSETS[lang].member : [];
  if (!tools.length) {
    return { isError: true, text: lang === "zh" ? "\u8FD9\u4E2A\u7EC8\u7AEF\u4E0D\u5C5E\u4E8E\u4EFB\u4F55\u667A\u80FD\u4F53\u56E2\u961F\u3002\u8BF7\u5728\u300C\u667A\u80FD\u4F53\u56E2\u961F\u300D\u9762\u677F\u91CC\u542F\u52A8\u56E2\u961F\u4F1A\u8BDD\uFF0C\u6216\u5728\u65B0 agent \u7684\u7B2C\u4E00\u6761\u6D88\u606F\u5F00\u5934\u5199 @team\u3002" : "This terminal is not part of an agent team. Start a team session from the Ensemble panel, or begin a new agent's first prompt with @team." };
  }
  noteAgentWorking(terminalId);
  const name2 = request.command.trim().toLowerCase();
  if (!name2 || name2 === "help" || name2 === "--help" || name2 === "-h") {
    const topic = typeof request.input?.command === "string" ? String(request.input.command) : "";
    const tool2 = topic ? tools.find((entry) => entry.name === `${TEAM_BIN} ${topic}` || entry.name === topic) : void 0;
    if (tool2) return { isError: false, text: [`${tool2.name}: ${tool2.title}`, tool2.description, "", lang === "zh" ? "\u5B57\u6BB5\uFF08JSON\uFF09\uFF1A" : "Fields (JSON):", ...fieldsOf(tool2.input)].join("\n") };
    return { isError: false, text: [lang === "zh" ? "\u547D\u4EE4\uFF08`agent-team <\u547D\u4EE4> '<json>'`\uFF0C\u957F\u6587\u672C\u7528 stdin\uFF09\uFF1A" : "Commands (`agent-team <command> '<json>'`, or the JSON on stdin):", ...tools.map((entry) => `  ${entry.name.replace(`${TEAM_BIN} `, "")}  ${entry.title}`), "", lang === "zh" ? "`agent-team help <\u547D\u4EE4>` \u67E5\u770B\u5B57\u6BB5\u3002" : "`agent-team help <command>` shows its fields."].join("\n") };
  }
  const tool = tools.find((entry) => entry.name === `${TEAM_BIN} ${name2}`);
  if (!tool) return { isError: true, text: `${lang === "zh" ? "\u672A\u77E5\u547D\u4EE4" : "Unknown command"} "${name2}". ${lang === "zh" ? "\u53EF\u7528\u547D\u4EE4" : "Commands"}: ${tools.map((entry) => entry.name.replace(`${TEAM_BIN} `, "")).join(", ")}.` };
  const parsed = tool.input.safeParse(request.input ?? {});
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue2) => `${issue2.path.join(".") || "(input)"}: ${issue2.message}`).join("; ");
    return { isError: true, text: `${tool.name}: ${issues}
${lang === "zh" ? "\u5B57\u6BB5" : "Fields"}:
${fieldsOf(tool.input).join("\n")}` };
  }
  const controller = new AbortController();
  const actor = lead ? "lead" : terminalId;
  try {
    const result = await asCaller(caller, () => asActor(actor, () => tool.execute(parsed.data, { agent: { id: terminalId, workspaceId: request.workspaceId }, signal: controller.signal })));
    let text = result.text ?? "";
    if (lead && tool.name === LEAD_TOOLS.status && (!shown.has(terminalId) || request.input?.instructions === true)) {
      shown.add(terminalId);
      const ctx = await leadContext({ id: terminalId });
      text = `${promptsFor(lang).orchestratorPrompt(ctx.team, ctx.file)}

---

${text}`;
    }
    return { isError: result.isError === true, text };
  } catch (error2) {
    return { isError: true, text: error2 instanceof Error ? error2.message : String(error2) };
  }
}

// src/worker/teams.ts
import { existsSync as existsSync2 } from "node:fs";
import { mkdir, readdir as readdir2, readFile as readFile4, writeFile as writeFile2 } from "node:fs/promises";
import { join as join6 } from "node:path";
async function teamFiles(root) {
  const dir = join6(root, TEAMS_DIR);
  const names = await readdir2(dir).catch(() => []);
  const files = [];
  for (const name2 of names.filter((entry) => entry.endsWith(TEAM_SUFFIX)).sort()) {
    const file = `${TEAMS_DIR}/${name2}`;
    const parsed = parseTeam(await readFile4(join6(dir, name2), "utf8").catch(() => ""));
    files.push(parsed.ok ? { file, title: teamTitle(parsed.team, file), team: parsed.team, errors: [] } : { file, title: name2.slice(0, -TEAM_SUFFIX.length), team: null, errors: parsed.errors });
  }
  return files;
}
async function ensureIgnored(root) {
  const ignore = join6(root, ".agents", ".gitignore");
  if (!existsSync2(ignore)) await writeFile2(ignore, "# Ensemble plugin: run report links are local; team files are shared.\nruns/\n").catch(() => void 0);
}
async function saveTeamFile(root, team, file) {
  const checked = checkTeam(team);
  if (!checked.ok) throw new Error(checked.errors.join("\n"));
  await mkdir(join6(root, TEAMS_DIR), { recursive: true });
  await ensureIgnored(root);
  let relative = file;
  if (!relative) {
    const base = teamFileName(teamTitle(checked.team));
    relative = `${TEAMS_DIR}/${base}`;
    for (let index = 2; existsSync2(join6(root, relative)); index += 1) relative = `${TEAMS_DIR}/${base.slice(0, -TEAM_SUFFIX.length)}-${index}${TEAM_SUFFIX}`;
  }
  await writeFile2(join6(root, relative), serializeTeam(checked.team));
  return relative;
}
var PRESETS_KEY = "presets";
async function readPresets(orca2) {
  const value = await orca2.storage.get(PRESETS_KEY).catch(() => null);
  const list = Array.isArray(value) ? value : [];
  return list.flatMap((entry) => {
    const parsed = PresetSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}
async function writePresets(orca2, presets) {
  await orca2.storage.set(PRESETS_KEY, toJson(presets.map((preset) => PresetSchema.parse(preset))));
}
async function teamOfLead(orca2, lead) {
  const source = lead.source;
  if (source.kind === "file") {
    const parsed = parseTeam(await readFile4(join6(lead.path, source.file), "utf8").catch(() => ""));
    if (parsed.ok) return { team: parsed.team, source: source.file };
    return { team: lead.team, source: `${source.file} (unreadable now; using the copy taken when the session started)` };
  }
  if (source.kind === "preset") {
    const preset = (await readPresets(orca2)).find((entry) => entry.id === source.presetId);
    if (preset) return { team: { ...preset.team, preset: { id: preset.id, name: teamTitle(preset.team) } }, source: `the preset "${teamTitle(preset.team)}"` };
    return { team: lead.team, source: "a preset that was deleted (using the copy taken when the session started)" };
  }
  return { team: lead.team, source: "the team chosen when the session started" };
}
async function resolveNamedTeam(orca2, root, name2, defaultTeam) {
  const files = (await teamFiles(root)).filter((entry) => entry.team);
  const presets = await readPresets(orca2);
  const wanted = (name2 || defaultTeam).trim().toLowerCase();
  const match = (title, file) => title.toLowerCase() === wanted || (file ?? "").toLowerCase().endsWith(`/${wanted}${TEAM_SUFFIX}`);
  if (wanted) {
    const file = files.find((entry) => match(entry.title, entry.file));
    if (file) return { team: file.team, source: { kind: "file", file: file.file } };
    const preset = presets.find((entry) => match(teamTitle(entry.team)) || entry.id === wanted);
    if (preset) return { team: { ...preset.team, preset: { id: preset.id, name: teamTitle(preset.team) } }, source: { kind: "preset", presetId: preset.id } };
    if (name2) return null;
  }
  if (files.length === 1) return { team: files[0].team, source: { kind: "file", file: files[0].file } };
  if (!files.length && presets.length === 1) return { team: { ...presets[0].team, preset: { id: presets[0].id, name: teamTitle(presets[0].team) } }, source: { kind: "preset", presetId: presets[0].id } };
  return null;
}

// src/worker/model-choices.ts
var CLI_LISTS = /* @__PURE__ */ new Set(["pi", "omp"]);
async function modelChoices(agent, wait, sources) {
  const name2 = agent.trim();
  const fromOrca = name2 ? await sources.orca(name2, wait).catch(() => null) : null;
  if (fromOrca?.models.length) return { source: "orca", models: fromOrca.models, listing: fromOrca.listing };
  const listing = fromOrca?.listing ?? false;
  if (CLI_LISTS.has(name2)) {
    const ids = await sources.cli(name2).catch(() => []);
    if (ids.length) return { source: "cli", models: ids.map((id) => ({ id, label: id, isDefault: false, efforts: null })), listing };
  }
  return { source: "builtin", models: (MODEL_SUGGESTIONS[name2] ?? []).map((id) => ({ id, label: id, isDefault: false, efforts: null })), listing };
}

// src/worker/orca-models.ts
import { randomUUID } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname as dirname2, join as join7 } from "node:path";
var RUNTIME_FILE = "orca-runtime.json";
var SHORT_SOCKET_DIR = "/tmp/.orca-daemon-";
var MAX_ANSWER = 8 * 1024 * 1024;
var LISTING_WAIT_MS = 4e4;
var READ_MS = 1e4;
function socketTrusted(endpoint, uid = process.getuid?.()) {
  if (uid === void 0) return true;
  try {
    const socket = lstatSync(endpoint);
    if (!socket.isSocket() || socket.uid !== uid) return false;
    if (endpoint.startsWith(`${SHORT_SOCKET_DIR}${uid}/`)) {
      for (const dir of [dirname2(endpoint), dirname2(dirname2(endpoint))]) {
        const entry = lstatSync(dir);
        if (!entry.isDirectory() || entry.uid !== uid || (entry.mode & 63) !== 0) return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}
function runtimeOf(profile, trusted = socketTrusted) {
  let meta2;
  try {
    meta2 = JSON.parse(readFileSync(join7(profile, RUNTIME_FILE), "utf8"));
  } catch {
    return null;
  }
  const transports = Array.isArray(meta2?.transports) ? meta2.transports : meta2?.transport ? [meta2.transport] : [];
  const local = transports.find((entry) => {
    const transport = entry;
    return (transport?.kind === "unix" || transport?.kind === "named-pipe") && typeof transport.endpoint === "string" && transport.endpoint.length > 0;
  });
  if (!local || typeof meta2?.authToken !== "string" || !meta2.authToken) return null;
  if (local.kind === "unix" && !trusted(local.endpoint)) return null;
  return { endpoint: local.endpoint, token: meta2.authToken };
}
function readCatalog(runtime, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();
    const socket = createConnection(runtime.endpoint);
    let buffer = "";
    let done = false;
    const finish = (error2, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      if (error2) reject(error2);
      else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("Orca did not answer in time.")), timeoutMs);
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      buffer += chunk;
      if (buffer.length > MAX_ANSWER) return finish(new Error("Orca's answer was too large."));
      for (let at = buffer.indexOf("\n"); at >= 0; at = buffer.indexOf("\n")) {
        const line = buffer.slice(0, at);
        buffer = buffer.slice(at + 1);
        if (!line.trim()) continue;
        let frame;
        try {
          frame = JSON.parse(line);
        } catch {
          return finish(new Error("Orca sent an answer that is not JSON."));
        }
        if (frame._keepalive === true || frame.id !== id) continue;
        if (frame.ok === true) return finish(null, frame.result);
        const message = typeof frame.error?.message === "string" ? frame.error.message : "Orca refused the request.";
        return finish(Object.assign(new Error(message), { code: typeof frame.error?.code === "string" ? frame.error.code : void 0 }));
      }
    });
    socket.on("error", (error2) => finish(error2));
    socket.on("close", () => finish(new Error("Orca closed the connection.")));
    socket.write(`${JSON.stringify({ id, authToken: runtime.token, method: "agentSession.modelCatalog", params })}
`);
  });
}
function modelListOf(answer) {
  if (!answer || typeof answer !== "object") return null;
  const raw = answer;
  const listing = raw.listingInProgress === true;
  if (!Array.isArray(raw.models)) return { models: [], listing };
  const seen = /* @__PURE__ */ new Set();
  const models = [];
  for (const row of raw.models) {
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const label = typeof row.label === "string" && row.label.trim() ? row.label.trim() : id;
    const efforts = row.effortsKnown === false || !Array.isArray(row.efforts) ? null : row.efforts.flatMap((effort) => typeof effort?.value === "string" && effort.value ? [effort.value] : []);
    const defaultEffort = typeof row.defaultEffort === "string" && row.defaultEffort ? row.defaultEffort : void 0;
    models.push({ id, label, isDefault: row.isDefault === true, efforts, ...defaultEffort ? { defaultEffort } : {} });
  }
  return { models, listing };
}
var AGENT_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
var OrcaModels = class {
  constructor(profile, read = readCatalog, runtime = runtimeOf) {
    this.profile = profile;
    this.read = read;
    this.runtime = runtime;
  }
  lists = /* @__PURE__ */ new Map();
  async list(agent, wait = false) {
    const name2 = agent.trim();
    if (!AGENT_ID.test(name2)) return null;
    const kept = this.lists.get(name2);
    if (kept && kept.list.models.length && !kept.list.listing && Date.now() - kept.at < 6e4) return kept.list;
    const runtime = this.runtime(this.profile());
    if (!runtime) return null;
    const ask = (params, timeoutMs) => this.read(runtime, { agent: name2, ...params }, timeoutMs).then(modelListOf, () => null);
    let list = await ask({ savedOnly: true }, READ_MS) ?? await ask({}, READ_MS);
    if (wait && (!list || !list.models.length || list.listing)) list = await ask({ waitForListing: true }, LISTING_WAIT_MS) ?? list;
    if (list) this.lists.set(name2, { at: Date.now(), list });
    return list;
  }
};

// src/worker/api.ts
function runView(run, memberOf2 = () => void 0) {
  return {
    id: run.id,
    mode: run.mode,
    title: run.title,
    status: run.status,
    round: run.round,
    rounds: run.rounds,
    planApproval: run.planApproval,
    language: run.language,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    brief: run.brief ? { title: run.brief.title, goal: run.brief.goal, acceptance: run.brief.acceptance } : null,
    members: run.members.map((member) => {
      const record = memberOf2(member.agentId);
      return { role: member.role, agentId: member.agentId, title: member.title, state: member.state, task: excerpt(member.task, 280), retired: member.retired, agent: record?.agent ?? null, model: record?.model ?? null };
    }),
    tasks: run.tasks.map((task) => ({ id: task.id, title: excerpt(task.title, 160), role: task.role, state: task.state, ownerTitle: task.ownerTitle, waitingOn: task.state === "todo" ? task.deps.filter((dep) => taskOf(run, dep)?.state !== "done") : [], plan: task.plan?.status ?? null, sentBack: task.feedback !== "" && task.state !== "done" })),
    posts: run.posts.slice(-40).map((post) => ({ seq: post.seq, round: post.round, author: post.author, kind: post.kind, text: excerpt(post.text, 600), to: post.to, at: post.at })),
    postCount: run.posts.length,
    claims: run.claims.map((claim2) => ({ role: claim2.role, path: claim2.path || "." })),
    events: run.events.slice(-60),
    batches: run.batches.map((batch) => ({ round: batch.round, title: excerpt(batch.title, 120), packets: batch.taskIds.length, warnings: batch.warnings.length, followUp: batch.followUp, summarized: batch.summaryAt !== null }))
  };
}
function detailView(run, deps) {
  return {
    id: run.id,
    leadAgentId: run.leadAgentId,
    mode: run.mode,
    title: run.title,
    reason: run.reason,
    status: run.status,
    round: run.round,
    rounds: run.rounds,
    planApproval: run.planApproval,
    language: run.language,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    brief: run.brief,
    leadReadSeq: run.leadReadSeq,
    members: run.members.map((member) => {
      const record = deps.store.member(member.agentId);
      return { role: member.role, agentId: member.agentId, title: member.title, state: member.state, task: excerpt(member.task, 6e3), result: member.result, collected: member.collected, readSeq: member.readSeq, inboxSeq: member.inboxSeq, retired: member.retired, dispatchedAt: member.dispatchedAt, agent: record?.agent ?? null, model: record?.model ?? null, live: deps.adapter.stateOf(member.agentId) };
    }),
    tasks: run.tasks.map((task) => ({ id: task.id, title: task.title, detail: task.detail, role: task.role, deps: task.deps, waitingOn: task.state === "todo" ? task.deps.filter((dep) => taskOf(run, dep)?.state !== "done") : [], files: task.files, state: task.state, owner: task.owner, ownerTitle: task.ownerTitle, result: task.result, plan: task.plan ? { text: task.plan.text, status: task.plan.status, feedback: task.plan.feedback, delivered: task.plan.delivered } : null, feedback: task.feedback, createdBy: task.createdBy, updatedAt: task.updatedAt })),
    posts: run.posts.slice(-300).map((post) => ({ ...post, text: excerpt(post.text, 6e3) })),
    claims: run.claims.map((claim2) => ({ ...claim2, path: claim2.path || "." })),
    events: run.events,
    batches: run.batches.map((batch) => ({ ...batch }))
  };
}
function pendingView(lead) {
  const pending = lead.brief;
  if (!pending) return null;
  return {
    brief: pending.brief,
    roles: pending.roles,
    rounds: pending.rounds,
    planApproval: pending.planApproval,
    tasks: (pending.tasks ?? []).map((task) => ({ title: task.title, detail: task.detail ?? "", role: task.role ?? null, after: task.after ?? [], files: task.files ?? [] })),
    at: pending.at,
    confirmed: pending.confirmedBy === "panel"
  };
}
var sourceText = (lead) => lead.source.kind === "file" ? lead.source.file : lead.source.kind === "preset" ? "preset" : "inline";
async function leadView(deps, lead) {
  const { team, source } = await teamOfLead(deps.adapter.orca, lead);
  const run = deps.store.leadRun(lead.terminalId, false);
  const state = lead.endedAt ? "ended" : deps.live(lead.terminalId) ?? "unknown";
  const name2 = lead.path.split("/").pop() ?? lead.path;
  return {
    terminalId: lead.terminalId,
    workspaceId: lead.workspaceId,
    workspaceName: name2,
    path: lead.path,
    teamTitle: teamTitle(team, source),
    source: sourceText(lead),
    team,
    language: lead.language,
    configured: team.mode,
    override: lead.mode,
    locked: lead.locked,
    effective: effectiveMode(team.mode, lead.mode, lead.locked),
    state,
    createdAt: lead.createdAt,
    ended: lead.endedAt !== null,
    roles: lead.roles.map((role) => ({ name: role.name, candidate: role.candidate, agent: role.agent, model: role.model })),
    members: deps.store.members().filter((member) => member.leadTerminalId === lead.terminalId).map((member) => ({ terminalId: member.terminalId, role: member.role, title: member.title, agent: member.agent, model: member.model, state: deps.live(member.terminalId) ?? "unknown" })),
    pendingBrief: pendingView(lead),
    run: run ? runView(run, (agentId) => deps.store.member(agentId)) : null,
    runCount: deps.store.allRuns().filter((entry) => entry.leadAgentId === lead.terminalId).length
  };
}
async function runReportFile(lead, runId) {
  const relative = `.agents/runs/${runId}.team-run.json`;
  await mkdir2(join8(lead.path, ".agents", "runs"), { recursive: true });
  const ignore = join8(lead.path, ".agents", ".gitignore");
  if (!existsSync3(ignore)) await writeFile3(ignore, "# Ensemble plugin: run report links are local; team files are shared.\nruns/\n").catch(() => void 0);
  await writeFile3(join8(lead.path, relative), JSON.stringify({ agentTeamRun: runId, note: "Opens the Ensemble run report. The run itself is kept by the plugin." }, null, 2) + "\n");
  return relative;
}
var toLanguage = (value, fallback) => isPromptLanguage(value) ? value : fallback;
function createApi(deps) {
  const { adapter, store: store2 } = deps;
  const orca2 = adapter.orca;
  const orcaModels = deps.models ?? new OrcaModels(() => adapter.profilePath);
  async function projects() {
    const [list, workspaces] = await Promise.all([
      orca2.host.call("project.list", {}).then((result) => result.projects).catch(() => []),
      adapter.listWorkspaces().catch(() => [])
    ]);
    const views = [];
    for (const project of list.filter((entry) => !entry.hidden && entry.hostId === "local")) {
      const root = workspaces.find((workspace) => workspace.projectId === project.id && workspace.path === project.path)?.path ?? project.path;
      const files = await teamFiles(root);
      views.push({ id: project.id, name: project.name, path: project.path, kind: project.kind, hostId: project.hostId, teams: files.map((file) => ({ file: file.file, title: file.title, errors: file.errors, mode: file.team?.mode ?? null })) });
    }
    return views;
  }
  const refreshedAt = /* @__PURE__ */ new Map();
  async function refreshStates(workspaces) {
    const wanted = /* @__PURE__ */ new Set();
    for (const lead of store2.leads().filter((entry) => !entry.endedAt)) {
      const row = workspaces.find((entry) => entry.path === lead.path);
      if (row) wanted.add(row.id);
      if (!lead.workspaceId && row) await store2.patchLead(lead.terminalId, { workspaceId: row.id });
    }
    await Promise.all([...wanted].filter((id) => Date.now() - (refreshedAt.get(id) ?? 0) > 1e4).map(async (id) => {
      refreshedAt.set(id, Date.now());
      for (const row of await adapter.listAgents(id)) {
        if (!row.terminalId) continue;
        const was = adapter.agents.get(row.terminalId);
        if (!was || Date.now() - was.at > 1e4) adapter.agents.set(row.terminalId, { ...was ?? {}, ...row, terminalId: row.terminalId, workspaceId: was?.workspaceId ?? id, at: Date.now() });
      }
    }));
  }
  async function probeStates() {
    const terminals = [...store2.leads().filter((lead) => !lead.endedAt).map((lead) => lead.terminalId), ...store2.members().filter((member) => !store2.lead(member.leadTerminalId)?.endedAt).map((member) => member.terminalId)];
    const probed = await Promise.all(terminals.filter((id) => !adapter.stateOf(id)).slice(0, 12).map(async (id) => [id, await adapter.probeState(id)]));
    probeCache = new Map(probed);
  }
  let probeCache = /* @__PURE__ */ new Map();
  const liveState = (terminalId) => adapter.stateOf(terminalId) ?? probeCache.get(terminalId) ?? null;
  async function state() {
    await store2.load();
    const settings = await deps.settings();
    const context = await adapter.focusedWorkspace().catch(() => null);
    const focusedId = context?.workspaceId ?? null;
    const workspaces = await adapter.listWorkspaces().catch(() => []);
    await refreshStates(workspaces).catch(() => void 0);
    await probeStates().catch(() => void 0);
    const focusedRow = focusedId ? workspaces.find((row) => row.id === focusedId || focusedId.endsWith(`::${row.path}`)) : void 0;
    const focusedPath = focusedRow?.path ?? (focusedId?.includes("::") ? focusedId.slice(focusedId.indexOf("::") + 2) : null);
    const projectList = await projects();
    const focusedProject = projectList.find((project) => project.id === focusedRow?.projectId) ?? projectList.find((project) => focusedPath === project.path);
    const agents = focusedId ? await adapter.listAgents(focusedId) : [];
    for (const row of agents) if (row.terminalId && !adapter.agents.has(row.terminalId)) adapter.agents.set(row.terminalId, { ...row, terminalId: row.terminalId, workspaceId: focusedId, at: Date.now() });
    const leads = await Promise.all(store2.leads().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 40).map((lead) => leadView({ ...deps, live: liveState }, lead)));
    const inFocus = (lead) => focusedPath ? lead.path === focusedPath : false;
    leads.sort((a, b) => Number(inFocus(b)) - Number(inFocus(a)) || Number(a.ended) - Number(b.ended) || b.createdAt.localeCompare(a.createdAt));
    return {
      focused: context ? {
        workspaceId: focusedId,
        name: context.displayName,
        branch: context.branch,
        path: focusedPath,
        projectId: focusedProject?.id ?? null,
        projectPath: focusedProject?.path ?? null,
        projectName: focusedProject?.name ?? null,
        projectKind: focusedProject?.kind ?? null,
        agents: agents.filter((row) => row.terminalId).map((row) => ({ terminalId: row.terminalId, title: row.title, agent: row.agent, state: row.state, role: store2.lead(row.terminalId) ? "lead" : store2.member(row.terminalId) ? "member" : null }))
      } : null,
      leads,
      planners: store2.planners().filter((job) => job.root === focusedPath).sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, 5),
      projects: projectList,
      presets: await readPresets(orca2),
      settings,
      locale: deps.locale(),
      pluginReady: { cli: adapter.cliPath !== null, problems: deps.problems() }
    };
  }
  async function startLead(input) {
    const lead = input.team.lead;
    const wanted = surfaceOf(lead);
    const model = lead.model && lead.agent === "pi" ? await resolveModel(lead.model) : lead.model;
    const prompt = input.prompt;
    try {
      return await adapter.launch({ path: input.path, agent: lead.agent, model, effort: lead.effort, prompt, focus: true, surface: wanted });
    } catch (error2) {
      if (!(error2 instanceof LaunchRefused) || wanted !== "chat") throw error2;
      return adapter.launch({ path: input.path, agent: lead.agent, model, effort: lead.effort, prompt, focus: true, surface: "terminal" });
    }
  }
  async function start(input) {
    const settings = await deps.settings();
    const picked = await resolveTeam(input.team);
    let team = picked.team;
    const source = picked.source;
    const override = input.mode && isTeamMode(input.mode) && input.mode !== team.mode ? input.mode : null;
    const language = toLanguage(input.language ?? team.language, settings.language === "auto" ? languageFromLocale(deps.locale()) : settings.language);
    team = { ...team, language };
    const P = promptsFor(language);
    const launchId = newLaunchId();
    const sourceLabel = source.kind === "file" ? source.file : source.kind === "preset" ? `the preset "${teamTitle(team)}"` : "the team chosen at start";
    const prompt = P.leadStartPrompt(team, sourceLabel, input.request);
    const systemPrompt = P.orchestratorPrompt(team, sourceLabel);
    const chatMarked = `${promptsFor(language).chatNote(adapter.teamBin)}

${prompt}`;
    const base = { projectId: null, projectName: "", source, team, language, mode: override, locked: null, roles: [], brief: null };
    const wanted = surfaceOf(team.lead);
    const model = team.lead.model && team.lead.agent === "pi" ? await resolveModel(team.lead.model) : team.lead.model;
    const marked = wanted === "chat" ? chatMarked : `[ensemble:${launchId}]
${prompt}`;
    if (input.newWorkspace && input.projectPath) {
      await store2.addLaunch({ id: launchId, kind: "lead", prompt, systemPrompt, lead: { ...base, workspaceId: null, path: "" }, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      const made = await adapter.createWorkspace({ projectPath: input.projectPath, name: input.newWorkspace.name, baseBranch: input.newWorkspace.baseBranch, agent: team.lead.agent, model, effort: team.lead.effort, prompt: marked, surface: wanted }).catch(async (error2) => {
        if (!(error2 instanceof LaunchRefused) || wanted !== "chat") throw error2;
        return adapter.createWorkspace({ projectPath: input.projectPath, name: input.newWorkspace.name, baseBranch: input.newWorkspace.baseBranch, agent: team.lead.agent, model, effort: team.lead.effort, prompt: `[ensemble:${launchId}]
${prompt}`, surface: "terminal" });
      });
      await store2.updateIndex((index) => {
        const lead = index.leads[made.terminalId];
        index.leads[made.terminalId] = { ...lead ?? { ...base, terminalId: made.terminalId, agentSessionId: null, createdAt: (/* @__PURE__ */ new Date()).toISOString(), endedAt: null }, workspaceId: lead?.workspaceId ?? made.workspaceId, path: made.path, projectName: input.projectPath.split("/").pop() ?? "" };
      });
      return { terminalId: made.terminalId, workspaceId: made.workspaceId, path: made.path };
    }
    const path = input.workspacePath ?? input.projectPath;
    if (!path) throw new Error("Pick a workspace or a project.");
    await store2.addLaunch({ id: launchId, kind: "lead", prompt, systemPrompt, lead: { ...base, workspaceId: null, path }, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
    const { terminalId } = await startLead({ path, team, prompt: marked });
    await store2.updateIndex((index) => {
      const lead = index.leads[terminalId];
      index.leads[terminalId] = { ...lead ?? { ...base, terminalId, workspaceId: null, agentSessionId: null, createdAt: (/* @__PURE__ */ new Date()).toISOString(), endedAt: null }, path, projectName: path.split("/").pop() ?? "" };
    });
    return { terminalId, workspaceId: store2.lead(terminalId)?.workspaceId ?? null, path };
  }
  async function adopt(input) {
    const settings = await deps.settings();
    const picked = await resolveTeam(input.team);
    let team = picked.team;
    const override = input.mode && input.mode !== team.mode ? input.mode : null;
    const language = toLanguage(input.language ?? team.language, settings.language === "auto" ? languageFromLocale(deps.locale()) : settings.language);
    team = { ...team, language };
    await store2.setLead({ terminalId: input.terminalId, workspaceId: input.workspaceId, path: input.path, projectId: null, projectName: input.path.split("/").pop() ?? "", source: picked.source, team, language, mode: override, locked: null, roles: [], brief: null, agentSessionId: null, createdAt: (/* @__PURE__ */ new Date()).toISOString(), endedAt: null });
    const label = picked.source.kind === "file" ? picked.source.file : `the team "${teamTitle(team)}"`;
    const sent = await adapter.sendIfIdle(input.terminalId, promptsFor(language).leadStartPrompt(team, label, ""));
    if (!sent) await adapter.send(input.terminalId, promptsFor(language).leadStartPrompt(team, label, ""));
    return { ok: true };
  }
  async function resolveTeam(choice) {
    if (choice.kind === "file") {
      const found = (await teamFiles(choice.root)).find((entry) => entry.file === choice.file);
      if (!found?.team) throw new Error(`The team file ${choice.file} could not be read.`);
      return { team: found.team, source: { kind: "file", file: choice.file } };
    }
    if (choice.kind === "preset") {
      const preset = (await readPresets(orca2)).find((entry) => entry.id === choice.presetId);
      if (!preset) throw new Error("The preset was not found.");
      return { team: { ...preset.team, preset: { id: preset.id, name: teamTitle(preset.team) } }, source: { kind: "preset", presetId: preset.id } };
    }
    const checked = checkTeam(choice.team);
    if (!checked.ok) throw new Error(checked.errors.join("\n"));
    return { team: checked.team, source: { kind: "inline" } };
  }
  async function setMode(input) {
    const lead = store2.lead(input.terminalId);
    if (!lead) return { ok: false, error: "That session is gone." };
    if (lead.locked) return { ok: false, error: lead.language === "zh" ? `\u672C\u4F1A\u8BDD\u5DF2\u9501\u5B9A\u4E3A${lead.locked === "team" ? "\u56E2\u961F" : "\u59D4\u6D3E"}\u6A21\u5F0F\u3002` : `This session is locked to ${lead.locked} mode.` };
    const { team } = await teamOfLead(orca2, lead);
    const next = input.mode === team.mode ? null : input.mode;
    await store2.setSessionMode(input.terminalId, next);
    const notified = await adapter.sendIfIdle(input.terminalId, promptsFor(lead.language).modeChangedPrompt(next, team.mode));
    return { ok: true, notified };
  }
  async function confirmBrief(input) {
    const lead = store2.lead(input.terminalId);
    if (!lead?.brief) return { ok: false, notified: false };
    await store2.setPendingBrief(input.terminalId, { ...lead.brief, confirmedBy: "panel" });
    const text = lead.language === "zh" ? `${PLUGIN_MESSAGE_PREFIX} \u7528\u6237\u5728\u300C\u667A\u80FD\u4F53\u56E2\u961F\u300D\u9762\u677F\u91CC\u786E\u8BA4\u4E86\u9700\u6C42\u7B80\u62A5\u548C\u4EFB\u52A1\u8BA1\u5212\u3002\u73B0\u5728\u8FD0\u884C agent-team kickoff\uFF0CuserConfirmation \u586B "confirmed in panel"\u3002` : `${PLUGIN_MESSAGE_PREFIX} The user confirmed the brief and task plan in the Ensemble panel. Run agent-team kickoff now, with userConfirmation "confirmed in panel".`;
    const notified = await adapter.send(input.terminalId, text);
    return { ok: true, notified };
  }
  async function openReport(input) {
    const run = store2.get(input.runId);
    const lead = run ? store2.lead(run.leadAgentId) : void 0;
    if (!run || !lead) return { ok: false, error: "The run was not found." };
    const file = await runReportFile(lead, run.id);
    const workspaces = await adapter.listWorkspaces().catch(() => []);
    const ids = [...new Set([workspaces.find((row) => row.path === lead.path)?.id, lead.workspaceId].filter((id) => !!id))];
    for (const workspaceId of ids) {
      try {
        await adapter.openFile(workspaceId, file);
        return { ok: true };
      } catch {
      }
    }
    return { ok: false, error: "Orca could not open the run report." };
  }
  async function openFileAt(root, file) {
    const workspaces = await adapter.listWorkspaces().catch(() => []);
    const row = workspaces.find((entry) => entry.path === root);
    if (!row) return { ok: false, error: "That checkout is not a workspace in Orca." };
    try {
      await adapter.openFile(row.id, file);
      return { ok: true };
    } catch (error2) {
      return { ok: false, error: error2 instanceof Error ? error2.message : String(error2) };
    }
  }
  return {
    state,
    openTeamFile: async ({ root, file }) => openFileAt(root, file),
    /** Starts a planner agent that reads the project and writes a team file, opened in the team editor when done. */
    planTeam: async ({ root, goal, name: name2, language, agent, model }) => {
      const settings = await deps.settings();
      const lang = toLanguage(language, settings.language === "auto" ? languageFromLocale(deps.locale()) : settings.language);
      let file = `${TEAMS_DIR}/${teamFileName(name2 || "team")}`;
      for (let index = 2; existsSync3(join8(root, file)); index += 1) file = `${TEAMS_DIR}/${teamFileName(`${name2 || "team"}-${index}`)}`;
      const launchId = newLaunchId();
      const prompt = plannerPrompt(goal, file, lang);
      await store2.addLaunch({ id: launchId, kind: "planner", prompt, systemPrompt: "", planner: { root, file, goal }, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      const { terminalId } = await adapter.launch({ path: root, agent: agent || "claude", model, prompt: `[ensemble:${launchId}]
${prompt}`, focus: false });
      if (!store2.planner(terminalId)) await store2.setPlanner({ terminalId, root, file, goal, status: "planning", errors: [], startedAt: (/* @__PURE__ */ new Date()).toISOString(), endedAt: null });
      return { terminalId, file };
    },
    createTeam: async ({ root, name: name2, presetId }) => {
      const preset = presetId ? (await readPresets(orca2)).find((entry) => entry.id === presetId) : void 0;
      const team = preset ? { ...structuredClone(preset.team), name: name2.trim() || teamTitle(preset.team), preset: { id: preset.id, name: teamTitle(preset.team) } } : { ...blankTeam(name2.trim()), language: void 0 };
      const file = await saveTeamFile(root, team);
      const opened = await openFileAt(root, file);
      return { file, opened: opened.ok, error: opened.error };
    },
    session: async ({ terminalId }) => {
      const lead = store2.lead(terminalId);
      return lead ? leadView({ ...deps, live: liveState }, lead) : null;
    },
    runDetail: async ({ runId }) => {
      await store2.load();
      const run = store2.get(runId);
      return run ? detailView(run, deps) : null;
    },
    leadRuns: async ({ terminalId }) => store2.allRuns().filter((run) => run.leadAgentId === terminalId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((run) => runView(run, (agentId) => store2.member(agentId))),
    setMode,
    confirmBrief,
    openReport,
    start,
    adopt,
    focus: async ({ terminalId }) => {
      await adapter.focusTerminal(terminalId);
      return { ok: true };
    },
    endSession: async ({ terminalId }) => {
      await store2.patchLead(terminalId, { endedAt: (/* @__PURE__ */ new Date()).toISOString() });
      return { ok: true };
    },
    nudge: async ({ runId }) => {
      await advance(runId);
      return { ok: true };
    },
    // An agent's models for the team editor: Orca's own list, else its CLI's, else suggestions. `wait`: when Orca has no
    // list yet, have it list them (as its model picker does when opened), which runs the agent's CLI.
    agentModels: async ({ agent, wait }) => modelChoices(agent, wait === true, { orca: (name2, waiting) => orcaModels.list(name2, waiting), cli: (name2) => adapter.agentModels(name2) }),
    validateTeam: async ({ team }) => {
      const checked = checkTeam(team);
      return checked.ok ? { ok: true, team: checked.team } : { ok: false, errors: checked.errors };
    },
    saveTeam: async ({ root, team, file }) => ({ file: await saveTeamFile(root, team, file) }),
    teamFiles: async ({ root }) => teamFiles(root),
    presets: async () => readPresets(orca2),
    savePreset: async ({ preset }) => {
      const checked = checkTeam(preset.team);
      if (!checked.ok) return { ok: false, errors: checked.errors };
      const list = await readPresets(orca2);
      const id = preset.id ?? list.find((item) => teamTitle(item.team).toLowerCase() === teamTitle(checked.team).toLowerCase())?.id ?? newPresetId();
      const entry = { id, team: checked.team, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
      await writePresets(orca2, list.some((item) => item.id === id) ? list.map((item) => item.id === id ? entry : item) : [...list, entry]);
      return { ok: true, id };
    },
    renamePreset: async ({ id, name: name2 }) => {
      const title = name2.trim();
      if (!title) return { ok: false, error: "empty" };
      const list = await readPresets(orca2);
      const preset = list.find((item) => item.id === id);
      if (!preset) return { ok: false, error: "missing" };
      if (list.some((item) => item.id !== id && teamTitle(item.team).toLowerCase() === title.toLowerCase())) return { ok: false, error: "taken" };
      await writePresets(orca2, list.map((item) => item.id === id ? { ...item, team: { ...item.team, name: title }, updatedAt: (/* @__PURE__ */ new Date()).toISOString() } : item));
      return { ok: true };
    },
    deletePreset: async ({ id }) => {
      await writePresets(orca2, (await readPresets(orca2)).filter((item) => item.id !== id));
      return { ok: true };
    }
  };
}

// src/worker/hooks.ts
import { join as join9 } from "node:path";
function shellWords(command) {
  const words = [];
  let current = "";
  let has = false;
  let quote = null;
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (quote === "'") {
      if (char === "'") quote = null;
      else current += char;
    } else if (quote === '"') {
      if (char === '"') quote = null;
      else if (char === "\\" && index + 1 < command.length && '"\\$`\n'.includes(command[index + 1])) current += command[++index];
      else current += char;
    } else if (char === "'" || char === '"') {
      quote = char;
      has = true;
    } else if (char === "\\" && index + 1 < command.length) {
      current += command[++index];
      has = true;
    } else if (/\s/.test(char)) {
      if (has || current) words.push(current);
      current = "";
      has = false;
    } else {
      current += char;
      has = true;
    }
  }
  if (has || current) words.push(current);
  return words;
}
function shellQuote(word) {
  return `'${word.replace(/'/g, `'\\''`)}'`;
}
var LAUNCH_MARKER = /^\[ensemble:(L[0-9A-F]{8})\]\n?/;
var TEAM_DIRECTIVE = /^@team(?:[ \t]+([^\n]*))?(?:\n|$)/i;
function parseDirective(prompt) {
  const match = prompt.match(TEAM_DIRECTIVE);
  if (!match) return null;
  const words = (match[1] ?? "").trim().split(/\s+/).filter(Boolean);
  const mode = words.length && isTeamMode(words.at(-1).toLowerCase()) ? words.pop().toLowerCase() : null;
  return { name: words.join(" "), mode, request: prompt.slice(match[0].length).trim() };
}
function workspaceParts(workspaceId) {
  if (!workspaceId) return { projectId: null, path: null };
  const at = workspaceId.indexOf("::");
  return at < 0 ? { projectId: null, path: null } : { projectId: workspaceId.slice(0, at), path: workspaceId.slice(at + 2) };
}
async function nativeLead(deps, input) {
  const settings = await deps.settings();
  const found = await resolveNamedTeam(deps.orca, input.path, input.directive.name, settings.defaultTeam);
  let team;
  let source;
  let note = "";
  if (found) {
    team = found.team;
    source = found.source;
  } else {
    team = { ...blankTeam(input.directive.name || "ad hoc"), lead: { agent: input.agent, model: void 0, effort: void 0 }, candidates: [{ name: input.agent, agent: input.agent, model: void 0, effort: void 0, notes: "" }] };
    source = { kind: "inline" };
    note = input.directive.name ? `No team or preset named "${input.directive.name}" was found; the lead works with one candidate, ${input.agent}.` : "No team was chosen (this project has no single team file and no default team); the lead works with one candidate.";
  }
  const override = input.directive.mode && input.directive.mode !== team.mode ? input.directive.mode : null;
  const language = team.language ?? (settings.language === "zh" || settings.language === "en" ? settings.language : languageFromLocale(deps.locale()));
  const parts = workspaceParts(input.workspaceId);
  const session = {
    terminalId: input.terminalId,
    workspaceId: input.workspaceId,
    path: input.path,
    projectId: parts.projectId,
    projectName: input.path.split("/").pop() ?? "",
    source,
    team,
    language,
    mode: override,
    locked: null,
    roles: [],
    brief: null,
    agentSessionId: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString(),
    endedAt: null
  };
  return { session, note };
}
var sourceText2 = (session) => session.source.kind === "file" ? session.source.file : session.source.kind === "preset" ? `the preset "${teamTitle(session.team)}"` : "the team chosen at start";
async function onAgentLaunch(deps, event) {
  const bin = join9(deps.pluginRoot, "bin");
  const env = { ...event.env, [ENV.socket]: deps.socket, [ENV.bin]: bin, [ENV.node]: deps.nodeBin, PATH: `${bin}:${event.env.PATH ?? process.env.PATH ?? "/usr/local/bin:/usr/bin:/bin"}` };
  let words;
  try {
    words = shellWords(event.command);
  } catch {
    return { ...event, env };
  }
  const promptIndex = words.findIndex((word2, index) => index > 0 && (LAUNCH_MARKER.test(word2) || TEAM_DIRECTIVE.test(word2)));
  if (promptIndex < 0 || !event.terminalId) return { ...event, env };
  const word = words[promptIndex];
  let prompt = word;
  let systemPrompt = "";
  const marker = word.match(LAUNCH_MARKER);
  let cliArgs = [];
  let member = false;
  if (marker) {
    const launch = deps.store.takeLaunch(marker[1]);
    prompt = word.replace(LAUNCH_MARKER, "");
    cliArgs = cliModelArgs(event.agent, launch?.model, launch?.effort) ?? [];
    member = launch?.kind === "member";
    if (launch) {
      systemPrompt = launch.systemPrompt;
      if (launch.kind === "member" && launch.member) await deps.store.setMember({ terminalId: event.terminalId, ...launch.member, createdAt: (/* @__PURE__ */ new Date()).toISOString() });
      if (launch.kind === "lead" && launch.lead) await deps.store.setLead({ terminalId: event.terminalId, ...launch.lead, agentSessionId: null, createdAt: (/* @__PURE__ */ new Date()).toISOString(), endedAt: null });
      if (launch.kind === "planner" && launch.planner) await deps.store.setPlanner({ terminalId: event.terminalId, ...launch.planner, status: "planning", errors: [], startedAt: (/* @__PURE__ */ new Date()).toISOString(), endedAt: null });
    }
  } else {
    const settings = await deps.settings();
    const directive = settings.directive ? parseDirective(word) : null;
    const parts = workspaceParts(event.workspaceId);
    if (directive && parts.path) {
      const made = await nativeLead(deps, { terminalId: event.terminalId, workspaceId: event.workspaceId, path: parts.path, agent: event.agent, directive });
      if (made) {
        await deps.store.setLead(made.session);
        const P = promptsFor(made.session.language);
        prompt = P.leadStartPrompt(made.session.team, sourceText2(made.session), directive.request) + (made.note ? `

${PLUGIN_MESSAGE_PREFIX} ${made.note}` : "");
        systemPrompt = P.orchestratorPrompt(made.session.team, sourceText2(made.session));
      }
    }
  }
  let next = [...words];
  next.splice(promptIndex, 0, ...cliArgs);
  let at = promptIndex + cliArgs.length;
  next[at] = prompt;
  if (member) {
    const full = withFullAccess(event.agent, next, at);
    next = full.words;
    at += full.added;
  }
  if (systemPrompt && event.agent === "claude" && !next.includes("--append-system-prompt")) next.splice(promptIndex, 0, "--append-system-prompt", systemPrompt);
  return { ...event, env, command: next.map((entry, index) => index === 0 && /^[A-Za-z0-9._/-]+$/.test(entry) ? entry : shellQuote(entry)).join(" ") };
}
async function onAgentPrompt(deps, event, lookup) {
  if (deps.store.lead(event.terminalId) || deps.store.member(event.terminalId)) return null;
  const settings = await deps.settings();
  const directive = settings.directive ? parseDirective(event.prompt) : null;
  if (!directive) return null;
  const place = await lookup(event.terminalId);
  if (!place) return null;
  const made = await nativeLead(deps, { terminalId: event.terminalId, workspaceId: place.workspaceId, path: place.path, agent: event.agent ?? "claude", directive });
  if (!made) return null;
  await deps.store.setLead(made.session);
  const P = promptsFor(made.session.language);
  return { ...event, prompt: P.leadStartPrompt(made.session.team, sourceText2(made.session), directive.request) + (made.note ? `

${PLUGIN_MESSAGE_PREFIX} ${made.note}` : "") };
}

// src/worker/main.ts
var pluginRoot = (() => {
  const here = dirname3(fileURLToPath(import.meta.url));
  try {
    return realpathSync(join10(here, ".."));
  } catch {
    return join10(here, "..");
  }
})();
var locale = "en";
var debugStatus = false;
async function activate(orca2) {
  const adapter = new OrcaAdapter(orca2);
  const store2 = new Store(dataDir(pluginRoot));
  await store2.load();
  initCollaboration(adapter, store2, (lead) => teamOfLead(orca2, lead), join10(pluginRoot, "bin", "agent-team"));
  const problems = [];
  if (!adapter.cliPath) problems.push("The orca CLI was not found beside Orca, so members can't be started or messaged in the background.");
  const settings = async () => {
    const read = (await orca2.host.call("settings.get", {}).catch(() => ({ settings: {} }))).settings;
    const language = read.language === "zh" || read.language === "en" ? read.language : "auto";
    return { language, directive: read.nativeDirective !== false, defaultTeam: typeof read.defaultTeam === "string" ? read.defaultTeam : "" };
  };
  const api = createApi({ adapter, store: store2, settings, locale: () => locale, problems: () => problems });
  for (const [name2, handler] of Object.entries(api)) {
    orca2.panels.handle(`api.${name2}`, async (input) => {
      if (input && typeof input.locale === "string") locale = input.locale;
      return toJson(await handler(input ?? {}));
    });
  }
  let pending = null;
  const changed = /* @__PURE__ */ new Set();
  store2.onChange = (runId) => {
    if (runId) changed.add(runId);
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      const runs = [...changed];
      changed.clear();
      try {
        orca2.panels.post("changed", { runs });
      } catch {
      }
      void updateStatusBar();
    }, 400);
  };
  async function updateStatusBar() {
    const active = store2.activeRuns();
    const working = active.reduce((sum, run) => sum + run.members.filter((member) => member.state === "working").length, 0);
    const attention = active.some((run) => run.members.some((member) => member.state === "attention"));
    const briefs = store2.leads().filter((lead) => lead.brief && !lead.endedAt).length;
    const zh = locale.toLowerCase().startsWith("zh");
    const text = active.length ? zh ? `\u56E2\u961F ${active.length} \xB7 ${working} \u5DE5\u4F5C\u4E2D${briefs ? ` \xB7 ${briefs} \u5F85\u786E\u8BA4` : ""}` : `Teams ${active.length} \xB7 ${working} working${briefs ? ` \xB7 ${briefs} to confirm` : ""}` : briefs ? zh ? `\u56E2\u961F \xB7 ${briefs} \u5F85\u786E\u8BA4` : `Teams \xB7 ${briefs} to confirm` : zh ? "\u56E2\u961F" : "Teams";
    await orca2.host.call("statusBar.update", { id: "teams", text, icon: "bot", tone: attention ? "warning" : briefs ? "accent" : working ? "success" : "neutral", tooltip: zh ? "\u667A\u80FD\u4F53\u56E2\u961F\uFF1A\u6253\u5F00\u9762\u677F" : "Ensemble: open the panel", visible: true }).catch(() => void 0);
  }
  void updateStatusBar();
  orca2.events.on("agent.status.changed", (payload) => {
    const terminalId = OrcaAdapter.handleOf(payload) ?? void 0;
    if (process.env.AGENT_TEAM_DEBUG || debugStatus) {
      const role = store2.lead(terminalId) ? "lead" : store2.member(terminalId)?.title ?? "-";
      orca2.log(`status ${role} ${terminalId?.slice(5, 13)} ${payload.state} main=${payload.mainAgent?.state ?? "-"}/${payload.mainAgent?.outcome ?? "-"}`);
    }
    adapter.noteStatus({ ...payload, terminalId });
    void onAgentStatus({ ...payload, terminalId }).catch((error2) => orca2.log(`status: ${String(error2)}`));
  });
  orca2.events.on("workspace.removed", (payload) => {
    void (async () => {
      for (const lead of store2.leads()) if (lead.path === payload.path && !lead.endedAt) await store2.patchLead(lead.terminalId, { endedAt: (/* @__PURE__ */ new Date()).toISOString() });
    })();
  });
  const hookDeps = {
    orca: orca2,
    store: store2,
    pluginRoot,
    socket: socketPath(pluginRoot),
    nodeBin: process.execPath,
    settings: async () => {
      const value = await settings();
      return { directive: value.directive, defaultTeam: value.defaultTeam, language: value.language };
    },
    locale: () => locale
  };
  orca2.hooks.on("agent.launch.before", async (event, next) => next(await onAgentLaunch(hookDeps, event).catch((error2) => {
    orca2.log(`launch hook: ${String(error2)}`);
    return event;
  })));
  orca2.hooks.on("agent.prompt.before", async (event, next) => {
    const changedPrompt = await onAgentPrompt(hookDeps, event, async (terminalId) => {
      const row = adapter.agents.get(terminalId);
      const context = await adapter.focusedWorkspace().catch(() => null);
      const workspaceId = row?.workspaceId ?? context?.workspaceId ?? null;
      const path = workspaceId?.includes("::") ? workspaceId.slice(workspaceId.indexOf("::") + 2) : null;
      return path ? { workspaceId, path } : null;
    }).catch(() => null);
    return next(changedPrompt ?? event);
  });
  orca2.commands.register("ensemble.openLatestReport", async () => {
    const run = store2.allRuns().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
    if (!run) return locale.startsWith("zh") ? "\u8FD8\u6CA1\u6709\u56E2\u961F\u8FD0\u884C\u3002" : "No team run yet.";
    const result = await api.openReport({ runId: run.id });
    return result.ok ? void 0 : result.error;
  });
  orca2.commands.register("ensemble.startHere", async () => {
    await orca2.host.call("commands.run", { action: "sidebar.right.toggle" }).catch(() => void 0);
    return locale.startsWith("zh") ? "\u5728\u53F3\u4FA7\u300C\u667A\u80FD\u4F53\u56E2\u961F\u300D\u9762\u677F\u91CC\u9009\u62E9\u56E2\u961F\u5E76\u5F00\u59CB\u3002\u4E5F\u53EF\u4EE5\u5728\u65B0 agent \u7684\u7B2C\u4E00\u6761\u6D88\u606F\u5F00\u5934\u5199 @team\u3002" : "Pick a team in the Ensemble panel on the right and start. You can also begin a new agent's first prompt with @team.";
  });
  const server = serveShim(socketPath(pluginRoot), (request, caller) => {
    if (request.terminalId) noteAgentWorking(request.terminalId);
    return handleShim(request, caller);
  }, (message) => orca2.log(message));
  const stopSweep = startSweep();
  const liveness = setInterval(() => {
    void (async () => {
      for (const lead of store2.leads().filter((entry) => !entry.endedAt)) {
        const seen = adapter.agents.get(lead.terminalId);
        if (seen && Date.now() - seen.at < 12e4) continue;
        if (!await adapter.terminalAlive(lead.terminalId)) await store2.patchLead(lead.terminalId, { endedAt: (/* @__PURE__ */ new Date()).toISOString() });
      }
      await store2.prune();
    })().catch(() => void 0);
  }, 12e4);
  liveness.unref?.();
  orca2.log(`${PLUGIN_MESSAGE_PREFIX} ready: socket ${socketPath(pluginRoot)}, data ${dataDir(pluginRoot)}, cli ${adapter.cliPath ?? "missing"}`);
  deactivateHandlers.push(() => {
    stopSweep();
    clearInterval(liveness);
    server.close();
  });
}
var deactivateHandlers = [];
function deactivate() {
  for (const handler of deactivateHandlers.splice(0)) handler();
}
function serveShim(path, handle, log) {
  try {
    unlinkSync(path);
  } catch {
  }
  const server = createServer((socket) => {
    let buffer = "";
    let request = null;
    let next = 1;
    let closed = false;
    const pending = /* @__PURE__ */ new Map();
    const settleAll = (error2) => {
      for (const [, entry] of pending) {
        clearTimeout(entry.timer);
        entry.reject(error2);
      }
      pending.clear();
    };
    socket.setEncoding("utf8");
    socket.on("close", () => {
      closed = true;
      settleAll(new Error("The agent-team command went away."));
    });
    socket.on("data", (chunk) => {
      buffer += chunk;
      for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line.trim()) continue;
        if (request) {
          let answer;
          try {
            answer = JSON.parse(line);
          } catch {
            continue;
          }
          const entry = answer?.kind === "exec-result" ? pending.get(answer.id) : void 0;
          if (!entry) continue;
          pending.delete(answer.id);
          clearTimeout(entry.timer);
          if (answer.ok) entry.resolve(answer.result);
          else entry.reject(Object.assign(new Error(answer.error || "orca CLI failed"), { code: answer.code }));
          continue;
        }
        try {
          request = JSON.parse(line);
        } catch {
          socket.end(JSON.stringify({ text: "Malformed request.", isError: true }) + "\n");
          return;
        }
        const live = request;
        const twoWay = (live.protocol ?? 1) >= 2 && !!live.terminalId;
        const caller = twoWay ? {
          handle: live.terminalId,
          exec: (args, timeoutMs = 12e4) => new Promise((resolve, reject) => {
            if (closed) return reject(new Error("The agent-team command went away."));
            const id = next++;
            const timer = setTimeout(() => {
              pending.delete(id);
              reject(new Error(`orca ${args.slice(0, 2).join(" ")} timed out in the agent's shell`));
            }, timeoutMs + 5e3);
            pending.set(id, { resolve, reject, timer });
            const message = { kind: "exec", id, args, timeoutMs };
            socket.write(JSON.stringify(message) + "\n");
          })
        } : null;
        const finish = (response) => {
          settleAll(new Error("The request finished."));
          if (!closed) socket.end(JSON.stringify(twoWay ? { kind: "reply", ...response } : response) + "\n");
        };
        void handle(live, caller).then(finish, (error2) => finish({ text: String(error2), isError: true }));
      }
    });
    socket.on("error", () => void 0);
  });
  server.on("error", (error2) => log(`agent-team socket: ${String(error2)}`));
  server.listen(path);
  return server;
}
export {
  deactivate,
  activate as default
};
