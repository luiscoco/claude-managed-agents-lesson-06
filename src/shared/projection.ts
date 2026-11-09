import type { Projection, WireEvent } from "./lesson.js";
export function emptyProjection(): Projection {
  return { messages: [], seen: [], stopReason: "", unknownCount: 0 };
}
function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}
export function eventText(e: WireEvent) {
  return Array.isArray(e.content)
    ? e.content
        .filter((b) => obj(b).type === "text")
        .map((b) => String(obj(b).text ?? ""))
        .join("\n")
    : "";
}
export function fold(p: Projection, e: WireEvent) {
  if (e.type === "event_start") {
    const preview = obj(e.event);
    if (
      preview.type === "agent.message" &&
      typeof preview.id === "string" &&
      !p.messages.some((m) => m.id === preview.id)
    )
      p.messages.push({
        id: preview.id,
        role: "assistant",
        parts: {},
        text: "",
        state: "preview",
      });
    return;
  }
  if (e.type === "event_delta") {
    const delta = obj(e.delta),
      content = obj(delta.content);
    const m = p.messages.find(
      (m) => m.id === e.event_id && m.state === "preview",
    );
    if (
      m &&
      delta.type === "content_delta" &&
      content.type === "text" &&
      typeof content.text === "string"
    ) {
      const index = delta.index === undefined ? 0 : delta.index;
      if (
        typeof index === "number" &&
        Number.isInteger(index) &&
        index >= 0 &&
        index < 100
      ) {
        m.parts[index] = (m.parts[index] ?? "") + content.text;
        m.text = Object.keys(m.parts)
          .map(Number)
          .sort((a, b) => a - b)
          .map((i) => m.parts[i])
          .join("\n");
      }
    }
    return;
  }
  if (e.id && p.seen.includes(e.id)) return;
  if (e.id) p.seen.push(e.id);
  if (e.type === "agent.message" || e.type === "user.message") {
    const id = e.id ?? `unidentified_${p.messages.length}`,
      m = p.messages.find((m) => m.id === id);
    const text = eventText(e);
    if (m) Object.assign(m, { text, parts: {}, state: "complete" });
    else
      p.messages.push({
        id,
        role: e.type === "user.message" ? "user" : "assistant",
        parts: {},
        text,
        state: "complete",
      });
  } else if (e.type === "span.model_request_end") {
    for (const m of p.messages)
      if (m.state === "preview") m.state = "incomplete";
  } else if (
    e.type === "session.status_idle" ||
    e.type === "session.thread_status_idle"
  )
    p.stopReason = String(obj(e.stop_reason).type ?? "unknown");
  else if (!knownEvent(e.type)) p.unknownCount++;
}
export function knownEvent(type: string) {
  return (
    [
      "user.message",
      "agent.message",
      "agent.custom_tool_use",
      "user.custom_tool_result",
      "agent.tool_use",
      "agent.mcp_tool_use",
      "user.tool_confirmation",
      "agent.thinking",
      "session.thread_status_running",
      "session.thread_status_idle",
      "session.thread_status_terminated",
      "session.thread_status_rescheduled",
      "session.status_running",
      "session.status_idle",
      "session.status_terminated",
      "session.error",
      "session.usage",
      "event_start",
      "event_delta",
    ].includes(type) || type.startsWith("span.")
  );
}
export function category(type: string) {
  if (type === "event_start" || type === "event_delta") return "preview";
  if (type === "user.message" || type === "agent.message") return "message";
  if (type.includes("tool")) return "tool";
  if (type.startsWith("session.")) return "lifecycle";
  if (type.startsWith("span.") || type === "agent.thinking") return "activity";
  return "unknown";
}
