// How Orca runs each agent: as a chat (Orca's own graphical client) or in a terminal, which model ids it takes, and how
// a chat is named. claude, codex, omp and grok work as chats and default to one; opencode can be one; cursor, kimi and
// copilot have a chat client that needs their CLI on the host. pi's chat starts and does nothing, so pi always runs in a
// terminal; gemini, qwen-code, droid and the rest have no chat.

/** Where an agent runs: Orca's chat (graphical) client, or its CLI in a terminal. */
export const SURFACES = ["chat", "terminal"] as const;
export type Surface = (typeof SURFACES)[number];

/**
 * Agents whose chat works: a team runs them as chats unless it says otherwise. A launch Orca refuses as a chat falls
 * back to a terminal.
 */
export const CHAT_AGENTS: ReadonlySet<string> = new Set(["claude", "codex", "omp", "grok", "cursor", "kimi", "copilot"]);

/** Agents whose chat starts but does no work (pi, Orca 1.4.261): always a terminal, whatever a team says. */
export const TERMINAL_ONLY: ReadonlySet<string> = new Set(["pi"]);

export const canChat = (agent: string): boolean => CHAT_AGENTS.has(agent.trim());

/** Agents the editor offers the chat-or-terminal choice for: the ones above, and opencode (a terminal unless chosen). */
export const CHAT_OFFERED: ReadonlySet<string> = new Set([...CHAT_AGENTS, "opencode"]);

/** Where an agent runs: never a chat for a terminal-only agent; else a chat when asked, else a chat when its chat works. */
export function surfaceOf(runtime: { agent: string; surface?: Surface | null }): Surface {
  const agent = runtime.agent.trim();
  if (TERMINAL_ONLY.has(agent)) return "terminal";
  if (runtime.surface === "chat") return "chat";
  if (!canChat(agent)) return "terminal";
  return runtime.surface ?? "chat";
}

// ----- Chats as Orca names them

/** The handle Orca gives a chat: `structured-agent-session-<Orca session id>`. */
export const CHAT_HANDLE_PREFIX = "structured-agent-session-";

export const isChatHandle = (handle: string | null | undefined): boolean => !!handle && handle.startsWith(CHAT_HANDLE_PREFIX);

/** The Orca session id of a chat handle (what its agent's `ORCA_AGENT_SESSION_ID` says). */
export const chatSessionId = (handle: string): string => handle.slice(CHAT_HANDLE_PREFIX.length);

/** A chat's handle from the pane key of its status events (`<handle>:<pane>`); status events of a chat carry no terminal id. */
export function chatHandleFromPaneKey(paneKey: string | null | undefined): string | null {
  if (!paneKey || !paneKey.startsWith(CHAT_HANDLE_PREFIX)) return null;
  const at = paneKey.indexOf(":");
  return at < 0 ? paneKey : paneKey.slice(0, at);
}

/** Who is calling `agent-team`: the terminal it runs in, or the chat whose shell it runs in. */
export function callerHandle(env: Record<string, string | undefined>): string | null {
  if (env.ORCA_TERMINAL_HANDLE) return env.ORCA_TERMINAL_HANDLE;
  if (env.ORCA_AGENT_SESSION_ID) return `${CHAT_HANDLE_PREFIX}${env.ORCA_AGENT_SESSION_ID}`;
  return null;
}

// ----- Models an agent's own command line takes, for an Orca that won't pass one

/**
 * The flags an agent's CLI takes for its model and reasoning effort. Orca 1.4.259 refuses any model for pi ("does not
 * support launch-time model selection"); the plugin then starts pi in a terminal and adds these to its command line.
 */
export const CLI_MODEL_FLAGS: Readonly<Record<string, { model: string; effort?: string }>> = {
  pi: { model: "--model", effort: "--thinking" },
};

/** The words to add to an agent's command line for its model and effort, or null when its CLI flags are unknown. */
export function cliModelArgs(agent: string, model: string | undefined, effort: string | undefined): string[] | null {
  const flags = CLI_MODEL_FLAGS[agent.trim()];
  if (!flags || !model) return null;
  return [flags.model, model, ...(effort && flags.effort ? [flags.effort, effort] : [])];
}

// ----- Members run with full access

/**
 * The arguments that run an agent's CLI with full access, as Orca's own Agent Permissions use them ("Full access").
 * A member the plugin starts in a terminal gets them, so delegated work never stops on a permission prompt. A chat's
 * permission is Orca's per-agent setting (Settings → Agents), which a launch can't change.
 */
export const FULL_ACCESS_ARGS: Readonly<Record<string, string>> = {
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
  copilot: "--yolo",
};

/** Orca's "Auto" arguments, which full access replaces. */
const AUTO_ARGS: Readonly<Record<string, string>> = {
  claude: "--permission-mode auto",
  codex: "--approve-for-me",
};

const wordsOf = (args: string) => args.split(/\s+/).filter(Boolean);
const indexOfRun = (words: readonly string[], run: readonly string[]) => words.findIndex((_, at) => run.every((word, k) => words[at + k] === word));

/**
 * A command's words with the agent's full-access arguments, put before `before` (the prompt): unchanged when they are
 * there already or the agent has none; Orca's Auto arguments for it are taken out.
 */
export function withFullAccess(agent: string, words: readonly string[], before: number): { words: string[]; added: number } {
  const full = FULL_ACCESS_ARGS[agent.trim()];
  if (!full) return { words: [...words], added: 0 };
  const yolo = wordsOf(full);
  if (indexOfRun(words, yolo) >= 0) return { words: [...words], added: 0 };
  let next = [...words];
  let at = before;
  const auto = AUTO_ARGS[agent.trim()] ? wordsOf(AUTO_ARGS[agent.trim()]!) : [];
  const autoAt = auto.length ? indexOfRun(next, auto) : -1;
  if (autoAt > 0) {
    next.splice(autoAt, auto.length);
    if (autoAt < at) at -= auto.length;
  }
  next = [...next.slice(0, at), ...yolo, ...next.slice(at)];
  return { words: next, added: next.length - words.length };
}

// ----- pi's models

/** pi's models as `provider/id`, from the table `pi --list-models` prints. */
export function parsePiModels(output: string): string[] {
  const models: string[] = [];
  for (const line of output.split("\n")) {
    const columns = line.trim().split(/\s{2,}/);
    if (columns.length < 2 || columns[0] === "provider") continue;
    const [provider, model] = columns as [string, string];
    if (!provider || !model || /\s/.test(provider) || /\s/.test(model)) continue;
    models.push(`${provider}/${model}`);
  }
  return [...new Set(models)];
}

/**
 * The model selectors of `omp models --json`, which OMP 19 prints instead of the table `--list-models` gave. Null when
 * the output is not that catalog, so a caller can fall back to the table. Selectors are kept whole: an OMP model id may
 * itself contain a slash (`magpie/codex/gpt-6.2-sol`).
 */
export function parseOmpModels(output: string): string[] | null {
  let catalog: unknown;
  try {
    catalog = JSON.parse(output);
  } catch {
    return null;
  }
  const rows = (catalog as { models?: unknown } | null)?.models;
  if (!Array.isArray(rows)) return null;
  const selectors = new Set<string>();
  for (const row of rows) {
    const selector = (row as { selector?: unknown } | null)?.selector;
    if (typeof selector === "string" && selector.trim()) selectors.add(selector.trim());
  }
  return [...selectors];
}

export type PiModelChoice = { ok: true; model: string } | { ok: false; error: string; matches: string[] };

/**
 * The `provider/id` model pi should run for what a team says. Orca (1.4.261) passes pi only a `provider/id` model, while
 * a team may name just the model (`deepseek-v4.1-flash`): a model id that one provider has is completed to that provider.
 * `known` empty (pi's list unreadable) leaves the model as it is.
 */
export function resolvePiModel(model: string, known: readonly string[]): PiModelChoice {
  const wanted = model.trim();
  if (!known.length) return { ok: true, model: wanted };
  const lower = wanted.toLowerCase();
  const exact = known.find((entry) => entry.toLowerCase() === lower);
  if (exact) return { ok: true, model: exact };
  const byId = known.filter((entry) => entry.slice(entry.indexOf("/") + 1).toLowerCase() === lower);
  if (byId.length === 1) return { ok: true, model: byId[0]! };
  if (byId.length > 1) return { ok: false, error: "ambiguous", matches: byId };
  // A provider/id pi doesn't list may still be one it reaches (a provider added since): let pi decide.
  if (wanted.includes("/")) return { ok: true, model: wanted };
  const near = known.filter((entry) => entry.toLowerCase().includes(lower)).slice(0, 8);
  return { ok: false, error: "unknown", matches: near };
}
