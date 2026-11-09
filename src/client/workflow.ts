import { createCodeBlock } from "./formatting.js";
const steps = [
  {
    title: "Choose the parent session",
    owner: "Student / browser",
    text: "Select the configured session before discovering branches. Demo provides two project reviews; live uses an existing managed session.",
    code: "const scope = { sessionId, threadId };\n// Never cache by a display label alone.",
  },
  {
    title: "Validate the scope",
    owner: "Node host",
    text: "Check the mode’s allowed parent and registered thread IDs. Every retrieved response must match both requested identifiers. The API key stays on the host.",
    code: 'if (thread.session_id !== sessionId || thread.id !== threadId) {\n  throw new Error("Parent/thread mismatch");\n}',
  },
  {
    title: "Discover all pages",
    owner: "Managed Agents thread API",
    text: "List primary and child threads. A small page size illustrates that pagination must continue until every returned page has been inspected.",
    code: "for await (const thread of client.beta.sessions.threads.list(\n  sessionId, { limit: 2 },\n)) console.log(thread.id);",
  },
  {
    title: "Select a focused reviewer",
    owner: "Student / browser",
    text: "Identify the primary by parent_thread_id null. Choose a child reviewer and retain its parent session ID alongside the thread ID.",
    code: "const isPrimary = thread.parent_thread_id === null;\nconst cacheKey = JSON.stringify([sessionId, thread.id]);",
  },
  {
    title: "Read details and recorded events",
    owner: "Managed Agents thread API",
    text: "Retrieve thread details and read persisted events for this scoped pair. These calls neither send a prompt nor start work.",
    code: "await client.beta.sessions.threads.retrieve(threadId, { session_id: sessionId });\nfor await (const event of client.beta.sessions.threads.events.list(\n  threadId, { session_id: sessionId },\n)) inspect(event);",
  },
  {
    title: "Compare focused histories",
    owner: "Browser",
    text: "Render two separate scoped snapshots without changing the selected branch. Research, troubleshooting, and drafting content must stay associated with their own IDs.",
    code: "const selected = views[JSON.stringify([sessionId, threadId])];\nconst comparison = views[JSON.stringify([sessionId, comparisonId])];",
  },
  {
    title: "Observe one branch safely",
    owner: "Node ↔ Managed Agents",
    text: "Open the thread stream before history recovery. Deduplicate complete event IDs, replace previews with final content, and inspect the selected thread’s idle reason. Stop closes observation only.",
    code: 'const stream = await client.beta.sessions.threads.events.stream(\n  threadId, { session_id: sessionId, event_deltas: ["agent.message"] },\n);\n// Read history, then tail buffered events.\n// Finally: stream.controller.abort();',
  },
  {
    title: "Archive a completed child deliberately",
    owner: "Student → Node → thread API",
    text: "Retrieve the latest state and require idle plus exact confirmation. This app also protects primary and workflow-run threads. Archival is terminal; history remains inspectable.",
    code: "await client.beta.sessions.threads.archive(threadId, {\n  session_id: sessionId,\n});\n// No automatic archive or delete in the walkthrough.",
  },
] as const;
const architecture = `<svg viewBox="0 0 1040 330" role="img" aria-labelledby="arch-title arch-desc"><title id="arch-title">UML component architecture</title><desc id="arch-desc">Browser calls a local Node host. The host selects a scripted demo provider or the official SDK. Live calls inspect parent-scoped threads and archive a selected idle child deliberately. Credentials stay in Node.</desc><defs><marker id="arch-arrow" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto"><path d="M0 0 L10 4 L0 8 Z"/></marker></defs>${[
  [
    "Browser thread explorer",
    "Branch selection · comparison",
    "Formatted responses · UML",
  ],
  [
    "Node scope host",
    "Parent validation · projection",
    "Scoped cache / official SDK",
  ],
  [
    "Claude Managed Agents",
    "Parent sessions + child threads",
    "Thread history + event streams",
  ],
]
  .map(
    ([title, a, b], i) =>
      `<g class="uml-box"><rect x="${20 + i * 365}" y="55" width="270" height="190" rx="8"/><text x="${155 + i * 365}" y="85" class="uml-stereotype">«${i === 2 ? "external service" : "component"}»</text><text x="${155 + i * 365}" y="120" class="uml-title">${title}</text><text x="${155 + i * 365}" y="160">${a}</text><text x="${155 + i * 365}" y="195">${b}</text><text x="${155 + i * 365}" y="225">${i === 0 ? "No credentials" : i === 1 ? "Server-side API key" : "Managed execution + context"}</text></g>`,
  )
  .join(
    "",
  )}<path class="uml-edge" d="M290 125 H385"/><path class="uml-edge" d="M385 195 H290"/><path class="uml-edge" d="M655 125 H750"/><path class="uml-edge" d="M750 195 H655"/><text class="uml-edge-label" x="338" y="105">HTTP action</text><text class="uml-edge-label" x="703" y="105">HTTPS API</text><text class="uml-caption" x="520" y="295">Demo replays scripted branches. Live inspects existing work without sending input.</text></svg>`;

const xs = [180, 520, 860, 180, 860, 180, 860, 860];
const labels = [
  ["1 · Choose parent session", "Demo project or configured live ID"],
  ["2 · Validate scope", "Check parent + registered thread"],
  ["3 · Discover thread pages", "limit is page size, not total"],
  ["4 · Select reviewer thread", "Keep both identifiers"],
  ["5 · Retrieve details + history", "No input or work started"],
  ["6 · Compare scoped histories", "Separate cached snapshots"],
  ["7 · Watch one thread", "Recover → deduplicate → preview"],
  ["8 · Archive idle child", "Exact confirmation · terminal"],
];
const workflow = `<svg viewBox="0 0 1040 1190" role="img" aria-labelledby="flow-title flow-desc"><title id="flow-title">UML thread inspection workflow</title><desc id="flow-desc">Swimlanes separate student, Node scope host, and managed thread API. Choose a session, validate scope, discover pages, select a branch, read its history, compare snapshots, watch events, then decide whether to archive an idle child or finish inspection. Archived history remains available.</desc><defs><marker id="flow-arrow" markerWidth="9" markerHeight="8" refX="8" refY="4" orient="auto"><path d="M0 0 L9 4 L0 8 Z"/></marker></defs><rect class="uml-lane" x="15" y="15" width="1010" height="1160" rx="10"/><path class="uml-lane-line" d="M345 15 V1175 M690 15 V1175 M15 65 H1025"/><text class="uml-title" x="180" y="47">Student / browser</text><text class="uml-title" x="520" y="47">Node scope host</text><text class="uml-title" x="860" y="47">Managed thread API</text><circle class="uml-start" cx="180" cy="90" r="10"/>${labels
  .map(([a, b], i) => {
    const y = 120 + i * 105 + (i === 7 ? 125 : 0);
    return `<g class="uml-action" data-workflow-step="${i}"><rect x="${xs[i] - 135}" y="${y}" width="270" height="65" rx="14"/><text x="${xs[i]}" y="${y + 26}">${a}</text><text x="${xs[i]}" y="${y + 49}">${b}</text></g>`;
  })
  .join("")}<g class="uml-flow-edges"><path d="M180 100 V120"/>${xs
  .slice(0, 6)
  .map(
    (x, i) =>
      `<path d="M${x} ${185 + i * 105} V${200 + i * 105} H${xs[i + 1]} V${225 + i * 105}"/>`,
  )
  .join(
    "",
  )}<path d="M860 815 V835"/><path d="M860 925 V980"/><path d="M770 880 H710 V572 H725"/><path d="M950 880 H1008 V1080 H520 V1100"/><path d="M860 1045 V1080 H520 V1100"/></g><path class="uml-decision" d="M860 835 L950 880 L860 925 L770 880 Z"/><text class="uml-small" x="860" y="875">Next</text><text class="uml-small" x="860" y="895">action?</text><text class="uml-edge-label" x="655" y="845">Refresh history</text><text class="uml-edge-label" x="995" y="1020">Finish</text><text class="uml-edge-label" x="930" y="960">Archive</text><circle class="uml-final-outer" cx="520" cy="1115" r="15"/><circle class="uml-start" cx="520" cy="1115" r="9"/><text class="uml-caption" x="270" y="1150">Scope errors return to selection. Closing observation does not interrupt work.</text></svg>`;
export function createWorkflowGuide() {
  const section = document.createElement("section");
  section.className = "panel workflow-guide";
  section.innerHTML = `<h3>Follow a scoped reviewer history through the application.</h3><p>The component diagram separates local inspection from managed execution. Select any step for its owner, explanation, and colored code.</p><div class="uml-scroll" tabindex="0" role="region" aria-label="Scrollable component architecture">${architecture}</div><details class="uml-activity"><summary>Explore the full UML thread inspection workflow</summary><p class="note">Rounded boxes show actions; the diamond separates refresh, finish, and deliberate archival. Scroll horizontally on small screens.</p><div class="uml-scroll" tabindex="0" role="region" aria-label="Scrollable thread inspection workflow">${workflow}</div></details><div class="workflow-step-buttons" role="group" aria-label="Inspect a workflow step"></div><article class="workflow-step-detail" aria-live="polite" aria-atomic="true"></article>`;
  const group = section.querySelector(".workflow-step-buttons")!,
    detail = section.querySelector(".workflow-step-detail")!;
  function select(index: number) {
    const step = steps[index];
    group
      .querySelectorAll("button")
      .forEach((b, i) => b.setAttribute("aria-pressed", String(i === index)));
    section
      .querySelectorAll<SVGElement>("[data-workflow-step]")
      .forEach((node) =>
        node.classList.toggle(
          "selected",
          node.dataset.workflowStep === String(index),
        ),
      );
    const h = document.createElement("h4");
    h.textContent = `${index + 1}. ${step.title}`;
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = step.owner;
    const p = document.createElement("p");
    p.textContent = step.text;
    detail.replaceChildren(
      h,
      badge,
      p,
      createCodeBlock(step.code, "typescript"),
    );
  }
  steps.forEach((step, index) => {
    const b = document.createElement("button");
    b.textContent = `${index + 1} · ${step.title}`;
    b.onclick = () => select(index);
    group.append(b);
  });
  select(0);
  return section;
}
