import Anthropic from "@anthropic-ai/sdk";
import type { BetaManagedAgentsSessionThread } from "@anthropic-ai/sdk/resources/beta/sessions/threads/threads";
import { emptyProjection, fold } from "../shared/projection.js";
import {
  scopeKey,
  type Mode,
  type Status,
  type Thread,
  type WireEvent,
  type LabState,
  type ThreadView,
  type Packet,
} from "../shared/lesson.js";
export class LabError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function safeError(e: unknown) {
  return e instanceof LabError
    ? e.message
    : "The operation failed. Check the parent session, thread state, credentials, and Managed Agents access; then refresh.";
}
export interface ListOptions {
  limit: number;
  statuses?: Status[];
}
export interface Connection {
  events: AsyncIterable<WireEvent>;
  close(): void;
}
export interface Provider {
  list(sessionId: string, options: ListOptions): Promise<Thread[]>;
  retrieve(sessionId: string, threadId: string): Promise<Thread>;
  history(sessionId: string, threadId: string): Promise<WireEvent[]>;
  open(
    sessionId: string,
    threadId: string,
    signal: AbortSignal,
  ): Promise<Connection>;
  archive(sessionId: string, threadId: string): Promise<Thread>;
}
function normalize(t: BetaManagedAgentsSessionThread): Thread {
  return {
    id: t.id,
    session_id: t.session_id,
    parent_thread_id: t.parent_thread_id,
    status: t.status,
    archived_at: t.archived_at,
    workflow_run_id: t.workflow_run_id,
    created_at: t.created_at,
    updated_at: t.updated_at,
    label: "name" in t.agent ? t.agent.name : t.agent.type,
  };
}
export class LiveProvider implements Provider {
  constructor(private client: Anthropic) {}
  async list(sessionId: string, options: ListOptions) {
    const threads: Thread[] = [];
    for await (const t of this.client.beta.sessions.threads.list(
      sessionId,
      options,
    ))
      threads.push(normalize(t));
    return threads;
  }
  async retrieve(sessionId: string, threadId: string) {
    return normalize(
      await this.client.beta.sessions.threads.retrieve(threadId, {
        session_id: sessionId,
      }),
    );
  }
  async history(sessionId: string, threadId: string) {
    const result: WireEvent[] = [];
    for await (const e of this.client.beta.sessions.threads.events.list(
      threadId,
      { session_id: sessionId, limit: 50 },
    )) {
      result.push(e as unknown as WireEvent);
      if (result.length > 10000)
        throw new LabError(
          "History exceeds the 10000-event teaching limit. Use the SDK for a larger export.",
        );
    }
    return result;
  }
  async open(sessionId: string, threadId: string, signal: AbortSignal) {
    const stream = await this.client.beta.sessions.threads.events.stream(
      threadId,
      { session_id: sessionId, event_deltas: ["agent.message"] },
      { signal },
    );
    return {
      events: stream as unknown as AsyncIterable<WireEvent>,
      close: () => stream.controller.abort(),
    };
  }
  async archive(sessionId: string, threadId: string) {
    return normalize(
      await this.client.beta.sessions.threads.archive(threadId, {
        session_id: sessionId,
      }),
    );
  }
}
export const DEMO_SESSIONS = [
  { id: "demo_session_launch", label: "Project launch review" },
  { id: "demo_session_api", label: "API design review" },
];
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const finish = () => {
        signal.removeEventListener("abort", abort);
        resolve();
      },
      timer = setTimeout(finish, ms),
      abort = () => {
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        reject(new LabError("Observation closed."));
      };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}
export class DemoProvider implements Provider {
  private rows = new Map<string, Thread>();
  private logs = new Map<string, WireEvent[]>();
  private serial = 0;
  constructor() {
    for (const parent of DEMO_SESSIONS) {
      const primary = `${parent.id}_primary`;
      for (const role of [
        "primary",
        "research",
        "troubleshooting",
        "drafting",
      ]) {
        const id = `${parent.id}_${role}`,
          now = new Date().toISOString();
        const label =
          role === "primary"
            ? "Project coordinator"
            : role === "research"
              ? "Research reviewer"
              : role === "troubleshooting"
                ? "Troubleshooting reviewer"
                : "Drafting reviewer";
        this.rows.set(scopeKey(parent.id, id), {
          id,
          session_id: parent.id,
          parent_thread_id: role === "primary" ? null : primary,
          label,
          status: "idle",
          archived_at: null,
          workflow_run_id: null,
          created_at: now,
          updated_at: now,
        });
        const text =
          role === "research"
            ? "### Research findings\n\nKeep the parent session and thread IDs together. Each reviewer has a focused history.\n\n```typescript\nconst key = JSON.stringify([sessionId, threadId]);\n```"
            : role === "troubleshooting"
              ? "### Troubleshooting findings\n\nA mismatched parent must be rejected. This branch examines scope validation, not the research notes."
              : role === "drafting"
                ? "### Drafting findings\n\nThe student-facing explanation should distinguish history from live observation. This is a separate reviewer history."
                : "### Coordinator overview\n\nThe primary thread provides a condensed overview. Inspect each child for its focused activity.";
        this.logs.set(scopeKey(parent.id, id), [
          {
            type: "user.message",
            id: `${id}_input`,
            content: [
              {
                type: "text",
                text: `Review ${parent.label.toLowerCase()} from the ${role} perspective.`,
              },
            ],
          },
          {
            type: "agent.message",
            id: `${id}_answer`,
            content: [{ type: "text", text }],
          },
          {
            type: "session.thread_status_idle",
            id: `${id}_idle`,
            session_thread_id: id,
            agent_name: label,
            stop_reason: { type: "end_turn" },
          },
        ]);
      }
    }
  }
  async list(sessionId: string, options: ListOptions) {
    const rows = [...this.rows.values()].filter(
      (t) =>
        t.session_id === sessionId &&
        (!options.statuses || options.statuses.includes(t.status)),
    );
    const result: Thread[] = [];
    for (let i = 0; i < rows.length; i += options.limit)
      result.push(...rows.slice(i, i + options.limit));
    return structuredClone(result);
  }
  async retrieve(sessionId: string, threadId: string) {
    const t = this.rows.get(scopeKey(sessionId, threadId));
    if (!t)
      throw new LabError("Thread does not belong to this parent session.");
    return structuredClone(t);
  }
  async history(sessionId: string, threadId: string) {
    await this.retrieve(sessionId, threadId);
    return structuredClone(this.logs.get(scopeKey(sessionId, threadId))!);
  }
  async open(
    sessionId: string,
    threadId: string,
    signal: AbortSignal,
  ): Promise<Connection> {
    const t = await this.retrieve(sessionId, threadId),
      self = this;
    const controller = new AbortController();
    const close = () => controller.abort();
    signal.addEventListener("abort", close, { once: true });
    if (signal.aborted) close();
    return {
      events: (async function* () {
        const key = scopeKey(sessionId, threadId),
          id = `${threadId}_live_${++self.serial}`;
        const answer = `### ${t.label}: live update\n\nThis scripted update belongs only to **${t.label}** in **${sessionId}**. The completed message replaces its preview.\n\n\`\`\`typescript\nawait client.beta.sessions.threads.retrieve(threadId, {\n  session_id: sessionId,\n});\n\`\`\``;
        const events: WireEvent[] = [
          {
            type: "session.thread_status_running",
            id: `${id}_running`,
            session_thread_id: threadId,
          },
          { type: "event_start", event: { id, type: "agent.message" } },
          ...(answer.match(/[\s\S]{1,65}/g) ?? []).map((text) => ({
            type: "event_delta",
            event_id: id,
            delta: {
              type: "content_delta",
              index: 0,
              content: { type: "text", text },
            },
          })),
          {
            type: "agent.message",
            id,
            content: [{ type: "text", text: answer }],
          },
          {
            type: "session.thread_status_idle",
            id: `${id}_idle`,
            session_thread_id: threadId,
            stop_reason: { type: "end_turn" },
          },
        ];
        for (const e of events) {
          await pause(140, controller.signal);
          if (e.type !== "event_start" && e.type !== "event_delta")
            self.logs.get(key)!.push(e);
          yield e;
        }
      })(),
      close: () => {
        signal.removeEventListener("abort", close);
        controller.abort();
      },
    };
  }
  async archive(sessionId: string, threadId: string) {
    const t = await this.retrieve(sessionId, threadId);
    t.status = "terminated";
    t.archived_at = new Date().toISOString();
    t.updated_at = t.archived_at;
    this.rows.set(scopeKey(sessionId, threadId), t);
    return structuredClone(t);
  }
}
export class Lab {
  readonly states: Record<Mode, LabState>;
  private registered: Record<Mode, Map<string, Set<string>>> = {
    demo: new Map(),
    live: new Map(),
  };
  private active = new Map<string, AbortController>();
  private mutations = new Set<string>();
  constructor(
    private providers: Partial<Record<Mode, Provider>>,
    liveSessionId?: string,
    private timeoutMs = 90000,
  ) {
    this.states = {
      demo: {
        mode: "demo",
        sessions: DEMO_SESSIONS,
        collections: {},
        views: {},
        traces: [],
      },
      live: {
        mode: "live",
        sessions: liveSessionId
          ? [{ id: liveSessionId, label: "Configured managed session" }]
          : [],
        collections: {},
        views: {},
        traces: [],
      },
    };
  }
  private p(mode: Mode) {
    const p = this.providers[mode];
    if (!p)
      throw new LabError(
        "Live mode requires ANTHROPIC_API_KEY and MANAGED_SESSION_ID on the server.",
      );
    return p;
  }
  private parent(mode: Mode, sessionId: string) {
    if (!this.states[mode].sessions.some((s) => s.id === sessionId))
      throw new LabError("Choose a parent session configured for this mode.");
    return this.p(mode);
  }
  private key(mode: Mode, sessionId: string, threadId: string) {
    return `${mode}:${scopeKey(sessionId, threadId)}`;
  }
  private trace(
    mode: Mode,
    action: string,
    sessionId: string,
    threadId: string | undefined,
    request: unknown,
    response: unknown,
    explanation: string,
  ) {
    const rows = this.states[mode].traces;
    rows.push({
      action,
      scope: { sessionId, threadId },
      request,
      response,
      explanation,
    });
    this.states[mode].traces = rows.slice(-30);
  }
  private put(mode: Mode, t: Thread) {
    const rows = this.states[mode].collections[t.session_id] ?? [];
    const i = rows.findIndex((r) => r.id === t.id);
    if (i < 0) rows.push(t);
    else rows[i] = t;
    this.states[mode].collections[t.session_id] = rows;
  }
  async list(mode: Mode, sessionId: string, data: Record<string, unknown>) {
    const p = this.parent(mode, sessionId);
    const limit = data.limit ?? 2;
    if (
      typeof limit !== "number" ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 50
    )
      throw new LabError("Page size must be a whole number from 1 to 50.");
    const statuses = data.statuses;
    if (
      statuses !== undefined &&
      (!Array.isArray(statuses) ||
        !statuses.length ||
        !statuses.every((s) =>
          ["running", "idle", "rescheduling", "terminated"].includes(String(s)),
        ))
    )
      throw new LabError("Choose supported thread statuses.");
    const options: ListOptions = {
      limit,
      ...(statuses ? { statuses: statuses as Status[] } : {}),
    };
    const rows = await p.list(sessionId, options);
    if (rows.some((t) => t.session_id !== sessionId))
      throw new LabError("The provider returned a mismatched parent scope.");
    this.states[mode].collections[sessionId] = rows;
    const ids = this.registered[mode].get(sessionId) ?? new Set<string>();
    for (const t of rows) ids.add(t.id);
    this.registered[mode].set(sessionId, ids);
    this.trace(
      mode,
      "list",
      sessionId,
      undefined,
      { sessionId, ...options },
      rows,
      "Discovered threads under this parent and followed pagination. The page size does not cap the total result.",
    );
    return structuredClone(this.states[mode]);
  }
  async retrieve(mode: Mode, sessionId: string, threadId: string) {
    const p = this.parent(mode, sessionId);
    if (!this.registered[mode].get(sessionId)?.has(threadId))
      throw new LabError(
        "List this parent’s threads before selecting a registered pair.",
      );
    const t = await p.retrieve(sessionId, threadId);
    if (t.session_id !== sessionId || t.id !== threadId)
      throw new LabError("Thread and parent session do not match.");
    this.put(mode, t);
    return t;
  }
  async details(mode: Mode, sessionId: string, threadId: string) {
    const t = await this.retrieve(mode, sessionId, threadId);
    this.trace(
      mode,
      "retrieve",
      sessionId,
      threadId,
      { threadId, session_id: sessionId },
      t,
      "Read one thread without sending input or starting managed work.",
    );
    return structuredClone(this.states[mode]);
  }
  private view(mode: Mode, sessionId: string, threadId: string) {
    const v: ThreadView = {
      sessionId,
      threadId,
      events: [],
      projection: emptyProjection(),
      observation: "snapshot",
    };
    this.states[mode].views[scopeKey(sessionId, threadId)] = v;
    return v;
  }
  private ingest(v: ThreadView, t: Thread, e: WireEvent) {
    if (
      t.parent_thread_id !== null &&
      typeof e.session_thread_id === "string" &&
      e.session_thread_id !== t.id
    )
      return false;
    if (e.type === "agent.thinking")
      e = {
        type: e.type,
        id: e.id,
        notice: "Progress signal; thinking content omitted.",
      };
    if (
      e.type !== "event_start" &&
      e.type !== "event_delta" &&
      e.id &&
      v.projection.seen.includes(e.id)
    )
      return false;
    fold(v.projection, e);
    v.events.push(e);
    v.events = v.events.slice(-400);
    return true;
  }
  async history(mode: Mode, sessionId: string, threadId: string) {
    const key = this.key(mode, sessionId, threadId);
    if (this.active.has(key))
      throw new LabError("Close observation before replacing this snapshot.");
    const t = await this.retrieve(mode, sessionId, threadId),
      v = this.view(mode, sessionId, threadId);
    for (const e of await this.p(mode).history(sessionId, threadId))
      this.ingest(v, t, e);
    this.trace(
      mode,
      "history",
      sessionId,
      threadId,
      { threadId, session_id: sessionId },
      v.events,
      "Loaded this scoped branch’s persisted events; preview envelopes are not part of history.",
    );
    return structuredClone(this.states[mode]);
  }
  stop(mode: Mode, sessionId: string, threadId: string) {
    this.parent(mode, sessionId);
    this.active.get(this.key(mode, sessionId, threadId))?.abort();
  }
  async watch(
    mode: Mode,
    sessionId: string,
    threadId: string,
    emit: (p: Packet) => void,
  ) {
    const key = this.key(mode, sessionId, threadId);
    if (this.active.has(key) || this.mutations.has(key))
      throw new LabError("This thread already has an active operation.");
    const controller = new AbortController();
    this.active.set(key, controller);
    let connection: Connection | undefined, v: ThreadView | undefined;
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const done = (
      outcome: "idle" | "paused" | "closed" | "error",
      text: string,
    ) => {
      if (v) {
        for (const m of v.projection.messages)
          if (m.state === "preview") m.state = "incomplete";
        v.observation = outcome === "error" ? "error" : "closed";
        emit({ kind: "view", view: structuredClone(v) });
      }
      emit({ kind: "done", outcome, text });
    };
    try {
      const t = await this.retrieve(mode, sessionId, threadId);
      if (t.archived_at || t.status === "terminated")
        throw new LabError(
          "This thread is terminal. Read its retained history instead.",
        );
      const p = this.p(mode);
      connection = await p.open(sessionId, threadId, controller.signal);
      v = this.view(mode, sessionId, threadId);
      v.observation = "watching";
      for (const e of await p.history(sessionId, threadId))
        this.ingest(v, t, e);
      emit({ kind: "view", view: structuredClone(v) });
      this.trace(
        mode,
        "watch",
        sessionId,
        threadId,
        { threadId, session_id: sessionId, event_deltas: ["agent.message"] },
        { observation: "connected" },
        "Opened stream before history, then deduplicated complete event IDs. No user input or tool result was sent.",
      );
      for await (const e of connection.events) {
        if (!this.ingest(v, t, e)) continue;
        emit({ kind: "view", view: structuredClone(v) });
        if (
          e.type === "session.thread_status_idle" &&
          e.session_thread_id === threadId
        ) {
          const reason = (e.stop_reason as { type?: string })?.type;
          done(
            reason === "end_turn" ? "idle" : "paused",
            `Selected thread paused: ${reason ?? "unknown"}. Sibling and parent completion are separate.`,
          );
          return;
        }
        if (
          (e.type === "session.thread_status_terminated" &&
            e.session_thread_id === threadId) ||
          e.type === "session.error"
        ) {
          done(
            "paused",
            `Selected thread reported ${e.type}. Inspect its retained history.`,
          );
          return;
        }
      }
      done(
        controller.signal.aborted ? "closed" : "error",
        controller.signal.aborted
          ? "Observation closed. Managed work was not interrupted."
          : "Stream ended without a thread outcome. Reopen observation to recover history.",
      );
    } catch (e) {
      done(
        controller.signal.aborted ? "closed" : "error",
        controller.signal.aborted
          ? "Observation closed. Managed work was not interrupted."
          : safeError(e),
      );
    } finally {
      clearTimeout(timer);
      connection?.close();
      this.active.delete(key);
    }
  }
  resetDemo() {
    if ([...this.active.keys()].some((key) => key.startsWith("demo:")))
      throw new LabError("Close demo observation before resetting.");
    this.providers.demo = new DemoProvider();
    this.registered.demo.clear();
    this.states.demo = {
      mode: "demo",
      sessions: DEMO_SESSIONS,
      collections: {},
      views: {},
      traces: [],
    };
    return structuredClone(this.states.demo);
  }
  async archive(
    mode: Mode,
    sessionId: string,
    threadId: string,
    confirm: unknown,
  ) {
    const key = this.key(mode, sessionId, threadId);
    if (this.active.has(key) || this.mutations.has(key))
      throw new LabError("Close observation before archiving.");
    this.mutations.add(key);
    try {
      const t = await this.retrieve(mode, sessionId, threadId);
      if (t.parent_thread_id === null)
        throw new LabError("This explorer protects the primary thread.");
      if (t.workflow_run_id)
        throw new LabError(
          "This explorer protects workflow-run threads; manage their lifecycle through the workflow.",
        );
      if (t.status !== "idle" || t.archived_at)
        throw new LabError(
          "Only an idle, unarchived child can be archived here.",
        );
      if (confirm !== `ARCHIVE ${threadId}`)
        throw new LabError("Type ARCHIVE followed by the exact thread ID.");
      const result = await this.p(mode).archive(sessionId, threadId);
      if (result.session_id !== sessionId || result.id !== threadId)
        throw new LabError("Archive response scope did not match.");
      this.put(mode, result);
      this.trace(
        mode,
        "archive",
        sessionId,
        threadId,
        { threadId, session_id: sessionId },
        result,
        "Archived this child deliberately. Its history remains inspectable; no delete operation is offered.",
      );
      return structuredClone(this.states[mode]);
    } finally {
      this.mutations.delete(key);
    }
  }
}
