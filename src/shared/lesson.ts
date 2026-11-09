import type { BetaManagedAgentsSessionThread } from "@anthropic-ai/sdk/resources/beta/sessions/threads/threads";
export const SDK_VERSION = "1.6.0",
  BETA = "managed-agents-2026-04-01";
export type Mode = "demo" | "live";
export type Status = BetaManagedAgentsSessionThread["status"];
export type Thread = Pick<
  BetaManagedAgentsSessionThread,
  | "id"
  | "session_id"
  | "parent_thread_id"
  | "status"
  | "archived_at"
  | "workflow_run_id"
  | "created_at"
  | "updated_at"
> & { label: string };
export type WireEvent = { type: string; id?: string; [key: string]: unknown };
export interface Message {
  id: string;
  role: "user" | "assistant";
  parts: Record<number, string>;
  text: string;
  state: "preview" | "complete" | "incomplete";
}
export interface Projection {
  messages: Message[];
  seen: string[];
  stopReason: string;
  unknownCount: number;
}
export interface ThreadView {
  sessionId: string;
  threadId: string;
  events: WireEvent[];
  projection: Projection;
  observation: "snapshot" | "watching" | "closed" | "error";
}
export interface Trace {
  action: string;
  scope: { sessionId: string; threadId?: string };
  request: unknown;
  response: unknown;
  explanation: string;
}
export interface LabState {
  mode: Mode;
  sessions: { id: string; label: string }[];
  collections: Record<string, Thread[]>;
  views: Record<string, ThreadView>;
  traces: Trace[];
}
export type Packet =
  | { kind: "view"; view: ThreadView }
  | {
      kind: "done";
      outcome: "idle" | "paused" | "closed" | "error";
      text: string;
    };
export function scopeKey(sessionId: string, threadId: string) {
  return JSON.stringify([sessionId, threadId]);
}
export const METHODS = [
  {
    name: "Discover threads",
    path: "client.beta.sessions.threads.list",
    description:
      "List the primary thread and children under one session. Async iteration follows every cursor page; limit controls a page, not the total result.",
    snippet:
      'for await (const thread of client.beta.sessions.threads.list(\n  sessionId, { limit: 2, statuses: ["idle", "running"] },\n)) {\n  console.log(thread.id, thread.parent_thread_id);\n}',
  },
  {
    name: "Retrieve one thread",
    path: "client.beta.sessions.threads.retrieve",
    description:
      "Supply the thread ID first and the parent session_id in the parameter object. Retrieving details does not create work or send input.",
    snippet:
      "const thread = await client.beta.sessions.threads.retrieve(\n  threadId, { session_id: sessionId },\n);\nconsole.log(thread.status, thread.archived_at);",
  },
  {
    name: "Read thread history",
    path: "client.beta.sessions.threads.events.list",
    description:
      "Inspect persisted events for one scoped branch. The pinned SDK accepts session_id and pagination; it does not expose order or event-type filters on this method.",
    snippet:
      "for await (const event of client.beta.sessions.threads.events.list(\n  threadId, { session_id: sessionId, limit: 20 },\n)) {\n  console.log(event.type, event.id);\n}",
  },
  {
    name: "Watch live events",
    path: "client.beta.sessions.threads.events.stream",
    description:
      "Observe one branch, optionally requesting message previews. Recovery opens the stream first, reads history, then deduplicates buffered complete events.",
    snippet:
      'const stream = await client.beta.sessions.threads.events.stream(\n  threadId, { session_id: sessionId, event_deltas: ["agent.message"] },\n);\ntry {\n  for await (const event of stream) route(event);\n} finally { stream.controller.abort(); }',
  },
  {
    name: "Archive a child",
    path: "client.beta.sessions.threads.archive",
    description:
      "Archive is terminal and requires idle. This explorer additionally protects the primary thread and all workflow-run threads. It has no delete control.",
    snippet:
      "// Deliberate action, outside the walkthrough:\nconst archived = await client.beta.sessions.threads.archive(\n  threadId, { session_id: sessionId },\n);\nconsole.log(archived.status, archived.archived_at);",
  },
] as const;
export const FIELDS = [
  {
    name: "session_id + threadId",
    role: "One inseparable scope",
    description:
      "Keep both IDs together in requests and local caches. The host validates that the returned thread belongs to its configured parent.",
    snippet:
      "const scope = { sessionId, threadId };\nconst cacheKey = JSON.stringify([scope.sessionId, scope.threadId]);",
  },
  {
    name: "Primary and child threads",
    role: "Discover the relationship",
    description:
      "A primary thread has parent_thread_id null. Managed multiagent work or workflow runs can produce children; the app does not manufacture live branches.",
    snippet:
      'const isPrimary = thread.parent_thread_id === null;\nconsole.log(isPrimary ? "Primary" : "Child", thread.session_id);',
  },
  {
    name: "statuses + limit",
    role: "Filter and paginate",
    description:
      "Thread list supports statuses and cursor pagination. This app limits requested page size to 1–50. No descending-order parameter is invented from the slides.",
    snippet:
      'client.beta.sessions.threads.list(sessionId, {\n  statuses: ["idle"], limit: 2,\n});\n// Iterate all pages, not just the first response.',
  },
  {
    name: "event_deltas",
    role: "Transient preview envelopes",
    description:
      "Accumulate event_delta text by event_id and content index. A final agent.message replaces its preview; previews do not appear in persisted history.",
    snippet:
      '{ session_id: sessionId, event_deltas: ["agent.message"] }\n// event_start.event.id → event_delta.event_id → final event.id',
  },
  {
    name: "Thread status vs session status",
    role: "Different scopes",
    description:
      "One branch going idle does not prove its siblings or the parent session are finished. Inspect this thread’s stop reason and parent progress separately.",
    snippet:
      'if (event.type === "session.thread_status_idle" &&\n    event.session_thread_id === threadId) {\n  console.log(event.stop_reason);\n}',
  },
  {
    name: "Observation vs execution",
    role: "Close a view deliberately",
    description:
      "Stop observation closes the local stream only. It sends no user.interrupt and makes no claim that managed work stopped. Reopen with history to recover.",
    snippet:
      "stream.controller.abort();\n// Observation closed. Managed work may continue.\n// Recover: stream first → history → deduplicate complete IDs.",
  },
  {
    name: "Thread API boundaries",
    role: "Inspect existing execution",
    description:
      "The pinned thread resource exposes list, retrieve, and archive; thread events expose list and stream. This app sends no prompts, approvals, or tool results.",
    snippet:
      "const threads = client.beta.sessions.threads;\n// threads.list / retrieve / archive\n// threads.events.list / stream\n// No manual thread create, delete, or thread-events send here.",
  },
] as const;
export const QUESTIONS = [
  {
    question: "Which identifiers must stay together?",
    answers: [
      "Session ID and thread ID",
      "Only the thread label",
      "Only the model name",
    ],
    correct: 0,
    explanation:
      "Thread calls and cached views must preserve their parent scope.",
  },
  {
    question: "How do you identify the primary thread?",
    answers: [
      "It is always last in the list",
      "parent_thread_id is null",
      "It has the highest cost",
    ],
    correct: 1,
    explanation: "Children have a parent thread reference.",
  },
  {
    question: "Does limit: 2 mean the session has at most two threads?",
    answers: [
      "Yes",
      "Only in demo",
      "No, it controls a page; follow pagination",
    ],
    correct: 2,
    explanation:
      "Async iteration follows next_page until all results are read.",
  },
  {
    question: "What does stopping observation do in this app?",
    answers: [
      "Archives every child",
      "Closes the local stream only",
      "Deletes the session",
    ],
    correct: 1,
    explanation:
      "Managed execution can continue; this control sends no interrupt.",
  },
  {
    question: "Does one child becoming idle prove the parent is complete?",
    answers: [
      "No; siblings or workflow work may remain",
      "Yes, always",
      "Only after retrieve",
    ],
    correct: 0,
    explanation: "Thread and session lifecycle have different scopes.",
  },
  {
    question: "What does archival require in the current API?",
    answers: ["A running thread", "A new API key", "An idle thread"],
    correct: 2,
    explanation:
      "Archival is terminal. This app also protects primary and workflow-run threads as an additional guard.",
  },
] as const;
