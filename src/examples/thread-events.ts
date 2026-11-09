import Anthropic from "@anthropic-ai/sdk";
process.loadEnvFile();
const sessionId = process.env.MANAGED_SESSION_ID;
if (!sessionId || !process.env.ANTHROPIC_API_KEY)
  throw new Error("Set ANTHROPIC_API_KEY and MANAGED_SESSION_ID.");
const client = new Anthropic({ maxRetries: 0 });
let selected: string | undefined;
for await (const thread of client.beta.sessions.threads.list(sessionId, {
  limit: 2,
})) {
  console.log(thread.id, thread.parent_thread_id, thread.status);
  if (
    !selected &&
    thread.parent_thread_id &&
    !thread.archived_at &&
    thread.status !== "terminated"
  )
    selected = thread.id;
}
if (!selected)
  throw new Error(
    "No active child found. Use a session with managed child threads.",
  );
const details = await client.beta.sessions.threads.retrieve(selected, {
  session_id: sessionId,
});
console.log(details);
const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
const stream = await client.beta.sessions.threads.events.stream(
  selected,
  { session_id: sessionId, event_deltas: ["agent.message"] },
  { signal: controller.signal },
);
const seen = new Set<string>();
try {
  for await (const event of client.beta.sessions.threads.events.list(selected, {
    session_id: sessionId,
  })) {
    seen.add(event.id);
    if (event.type !== "agent.thinking") console.log(event.type, event);
  }
  for await (const event of stream) {
    if ("id" in event) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
    }
    if (event.type !== "agent.thinking") console.log(event.type, event);
    if (
      event.type === "session.thread_status_idle" &&
      event.session_thread_id === selected
    )
      break;
  }
} finally {
  stream.controller.abort();
}
// Observation only. This example never sends input, interrupts, or archives.
