import "./style.css";
import {
  createCodeBlock,
  highlightCodeElements,
  renderResponse,
} from "./formatting.js";
import { createWorkflowGuide } from "./workflow.js";
import { readPackets } from "./stream.js";
import exampleCode from "../examples/thread-events.ts?raw";
import {
  BETA,
  SDK_VERSION,
  METHODS,
  FIELDS,
  QUESTIONS,
  scopeKey,
  type Mode,
  type LabState,
  type Packet,
} from "../shared/lesson.js";
const $ = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
document.querySelector("#app")!.innerHTML = `
<a class="skip" href="#main">Skip to lesson</a><header class="top"><a class="brand" href="/" aria-label="Project Review Explorer home"><span class="brand-mark">&lt;/&gt;</span><span>Claude Managed Agents<small>Practical course · Lesson 06</small></span></a><div class="header-actions"><span class="badge">TypeScript SDK ${SDK_VERSION}</span><a class="source" href="https://github.com/luiscoco/claude-managed-agents-lesson-06" target="_blank" rel="noreferrer">Source ↗</a><div class="size" role="group" aria-label="Text size"><button id="comfortable" aria-pressed="true">Comfortable</button><button id="larger" aria-pressed="false">Larger</button></div></div></header>
<main id="main" class="container"><section class="hero"><div><p class="eyebrow">LESSON 06 / THREADS & THREAD EVENTS</p><h1>One project.<br><em>Focused reviewer histories.</em></h1><p class="intro">Discover a session’s threads. Compare focused review histories, observe one branch, and keep every update tied to its correct parent.</p><div class="chips"><span>① Discover</span><span>② Inspect</span><span>③ Compare</span><span>④ Observe</span></div></div><figure class="mascot"><img src="/course-astronaut.png" width="220" height="287" alt="Course astronaut mascot"><figcaption>Parent scope.<br>Focused histories.</figcaption></figure></section>
<details class="focus"><summary>Lesson focus & author <span>What you will learn</span></summary><div><p>List and retrieve session threads, inspect recorded or live branch events, preserve scope, and archive a completed child deliberately.</p><p>Practical companion by <strong>Luis Coco Enríquez</strong>. All live AI work uses Claude Managed Agents through the official Anthropic SDK.</p></div></details>
<nav class="tabs" role="tablist" aria-label="Lesson activities"><button role="tab" id="tab-lab" aria-controls="panel-lab" aria-selected="true">01 · Thread lab</button><button role="tab" id="tab-map" aria-controls="panel-map" aria-selected="false" tabindex="-1">02 · API & configuration</button><button role="tab" id="tab-how" aria-controls="panel-how" aria-selected="false" tabindex="-1">03 · How it works</button><button role="tab" id="tab-quiz" aria-controls="panel-quiz" aria-selected="false" tabindex="-1">04 · Check understanding</button></nav>


<section role="tabpanel" id="panel-lab" aria-labelledby="tab-lab"><div class="section-heading"><div><p class="eyebrow">THE PRACTICAL EXAMPLE</p><h2>Project Review Explorer</h2><p>Research, troubleshooting, and drafting reviewers examine the same project. Discover their threads and compare what belongs to each focused history.</p></div><span class="lesson-number">06</span></div><div class="flow">${[
  ["discover", "Discover", "Follow all cursor pages"],
  ["inspect", "Inspect", "Keep the parent scope"],
  ["compare", "Compare", "Separate reviewer histories"],
  ["observe", "Observe", "One branch’s live updates"],
]
  .map(
    ([id, title, desc], i) =>
      `<div id="stage-${id}" class="flow-card"><span>${i + 1}</span><strong>${title}</strong><small>${desc}</small></div>`,
  )
  .join("")}</div>
<div class="workspace"><aside class="panel controls"><h3>Choose the parent and branch</h3><label for="mode">Execution mode</label><select id="mode"><option value="demo">Guided demo · simulated API</option><option value="live" disabled>Live · checking configuration</option></select><p id="mode-note" class="note">Scripted reviewer histories and live-event replay. No cloud calls or managed execution.</p><button id="walkthrough" class="primary">Run guided walkthrough</button><button id="reset-demo">Reset demo fixtures</button><label for="parent-session">Parent session</label><select id="parent-session"></select><label for="status-filter">Thread status filter</label><select id="status-filter"><option value="all">All statuses</option><option value="idle">Idle</option><option value="running">Running</option><option value="rescheduling">Rescheduling</option><option value="terminated">Terminated</option></select><label for="page-size">Requested page size · not total limit</label><input id="page-size" type="number" min="1" max="50" step="1" value="2"><button id="list-threads" class="primary">List threads across all pages</button><label for="thread-select">Selected thread</label><select id="thread-select"><option value="">List threads first</option></select><div class="button-row"><button id="retrieve">Retrieve thread details</button><button id="history">Read branch history</button></div><button id="watch" class="primary">Watch selected thread</button><button id="stop" class="danger" disabled>Stop observation only</button><p class="note">Live observation sends no input and starts no new work. Stop closes the local stream only. Reopen to recover persisted events before following new activity.</p><p id="status" class="status" role="status" aria-live="polite">Ready to explore.</p></aside><div class="results"><section class="panel"><div class="panel-heading"><h3>Discovered threads</h3><span id="thread-count" class="badge">0 threads</span></div><p id="discovery-note" class="note">The primary thread has no parent_thread_id. Children belong to the same session.</p><div id="thread-tree" class="thread-tree"></div></section><section class="panel"><div class="panel-heading"><h3>Selected scope & details</h3><span id="thread-status" class="badge">No thread</span></div><p id="identity" class="note">Select a discovered thread.</p><div id="details"></div></section><section class="panel"><div class="panel-heading"><h3>Focused conversation</h3><span id="observation" class="badge">No snapshot</span></div><div id="conversation"></div><p id="stop-reason" class="note">A branch outcome does not determine the parent session’s outcome.</p><details><summary>Inspect scoped event JSON</summary><div id="event-json"></div></details></section></div></div>
<section class="panel version-comparison"><div class="panel-heading"><h3>Compare reviewer histories</h3><span class="badge">Two scoped snapshots</span></div><p>Compare the selected thread with a different reviewer. Loading this snapshot does not change the selected branch.</p><label for="compare-thread">Comparison thread</label><select id="compare-thread"></select><button id="load-comparison">Load comparison history</button><div id="comparison" class="two-columns"></div></section>
<section class="panel"><div class="panel-heading"><h3>Request timeline</h3><span id="trace-count" class="badge">0 operations</span></div><ol id="timeline" class="timeline"></ol></section>
<details class="panel archive-panel"><summary>Archive a completed child thread</summary><p>Archive is terminal and requires an idle thread. This explorer additionally protects the primary thread and workflow-run threads. It offers no delete operation. Close observation first, retrieve the latest state, and archive deliberately.</p><label for="archive-name">Type ARCHIVE followed by the exact selected thread ID</label><input id="archive-name" autocomplete="off"><button id="archive" class="danger">Archive selected child</button><p id="archive-note" class="note">The walkthrough never archives a thread.</p></details><div class="teaching-callout"><strong>Try this next</strong><p>Switch to the second demo parent, list its threads, and inspect a reviewer. Explain why its cached history must use both IDs. Then filter to Idle with a page size of one and verify that pagination still discovers every matching thread.</p></div></section>
<section role="tabpanel" id="panel-map" aria-labelledby="tab-map" hidden><div class="section-heading"><div><p class="eyebrow">METHODS & PARAMETERS</p><h2>Every branch keeps its parent.</h2><p>All cards include expandable colored TypeScript examples. Inspecting them does not execute requests.</p></div></div><div id="method-grid" class="namespace-grid"></div><h2 class="fields-heading">Read the scope and lifecycle correctly.</h2><div id="field-grid" class="namespace-grid"></div><div class="teaching-callout"><strong>Current contract, explicit boundaries</strong><p>The application pins SDK ${SDK_VERSION}. Its managed methods send <code>${BETA}</code>. Thread list supports <code>statuses</code> and <code>limit</code>; thread event list supports pagination without an invented order parameter. Live threads come from managed execution, not a Create branch button.</p></div></section>
<section role="tabpanel" id="panel-how" aria-labelledby="tab-how" hidden><div class="section-heading"><div><p class="eyebrow">UML / ARCHITECTURE & WORKFLOW</p><h2>Follow the scoped inspection workflow.</h2><p>Separate thread discovery, persisted history, live observation, and archival.</p></div></div><div id="workflow-guide"></div><div class="two-columns"><article class="panel"><h3>1. Start locally</h3><pre><code id="setup-code"></code></pre><p>Open <code>http://127.0.0.1:4326</code>. Demo needs no key. Live inspection uses this repository’s <code>ANTHROPIC_API_KEY</code> and <code>MANAGED_SESSION_ID</code>; restart after changing <code>.env</code>.</p></article><article class="panel"><h3>2. Inspect existing managed work</h3><p>Use an existing session with child threads from multiagent execution or a workflow run. A simple session may show only its primary thread. This explorer creates no agents, environments, sessions, threads, or model requests.</p><p>Live streaming waits for future activity. Use Stop observation when finished; the session’s work can continue elsewhere.</p></article></div><div class="two-columns"><article class="panel"><h3>Scope-aware recovery</h3><p>Each cache entry uses the pair of parent session ID and thread ID. Watching opens the stream first, reads persisted history, then processes buffered events while deduplicating complete IDs.</p><p>Partial text is indexed by event ID and content block. The complete message replaces its preview. Thinking content is omitted; unfamiliar activity remains inspectable.</p></article><article class="panel"><h3>Lifecycle is not scheduling</h3><p>A thread organizes one execution history. One child going idle does not finish its siblings or parent. The session aggregates broader activity and shares its budget across threads.</p><p>Archival is an explicit lifecycle action. The API requires idle; this app also blocks primary and workflow-run archival. Read retained history after archival.</p></article></div><article class="panel code-example"><h3>3. Read the TypeScript example</h3><p>The standalone example lists threads and observes one existing branch. It never archives automatically and sends no input.</p><pre><code id="example-code"></code></pre></article><p class="source-links">Official references: <a href="https://platform.claude.com/docs/en/managed-agents/session-threads" target="_blank" rel="noreferrer">Session threads ↗</a> · <a href="https://platform.claude.com/docs/en/managed-agents/event-deltas" target="_blank" rel="noreferrer">Event deltas ↗</a></p></section>
<section role="tabpanel" id="panel-quiz" aria-labelledby="tab-quiz" hidden><div class="section-heading"><div><p class="eyebrow">RETRIEVE, THEN APPLY</p><h2>Can you explain the thread’s scope?</h2><p>Six questions connect parent context, pagination, observation, and archival.</p></div><span id="score" class="badge">0 / 6 correct</span></div><div id="quiz"></div><div class="teaching-callout"><h3>Your practical challenge</h3><ol><li>Discover every demo thread with page size one.</li><li>Identify the primary thread and its child reviewers.</li><li>Compare research and troubleshooting without mixing their histories.</li><li>Watch one thread and distinguish its outcome from parent completion.</li><li>In demo, archive an idle child with the exact confirmation phrase and read its retained history.</li></ol></div></section><footer><span>Claude Managed Agents · Lesson 06</span><span>Luis Coco Enríquez · Learn by inspecting.</span></footer></main>`;
function card(
  name: string,
  path: string,
  description: string,
  snippet: string,
) {
  const a = document.createElement("article");
  a.className = "panel namespace current";
  const h = document.createElement("h3"),
    c = document.createElement("code"),
    p = document.createElement("p"),
    d = document.createElement("details"),
    s = document.createElement("summary");
  h.textContent = name;
  c.textContent = path;
  p.textContent = description;
  s.textContent = "Inspect the code example";
  d.append(s, createCodeBlock(snippet, "typescript"));
  a.append(h, c, p, d);
  return a;
}
for (const m of METHODS)
  $("method-grid").append(card(m.name, m.path, m.description, m.snippet));
for (const f of FIELDS)
  $("field-grid").append(card(f.name, f.role, f.description, f.snippet));
$("workflow-guide").append(createWorkflowGuide());
$("setup-code").textContent =
  "npm ci\nCopy-Item .env.example .env\n# Set ANTHROPIC_API_KEY and MANAGED_SESSION_ID for live inspection\nnpm run dev";
$("setup-code").dataset.language = "powershell";
$("example-code").textContent = exampleCode;
$("example-code").dataset.language = "typescript";
highlightCodeElements(document);
const tabs = [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')];
function activate(tab: HTMLButtonElement) {
  tabs.forEach((t) => {
    const active = t === tab;
    t.setAttribute("aria-selected", String(active));
    t.tabIndex = active ? 0 : -1;
    $(t.getAttribute("aria-controls")!).hidden = !active;
  });
}
tabs.forEach((t, i) => {
  t.onclick = () => activate(t);
  t.onkeydown = (e) => {
    let n: number | undefined;
    if (e.key === "ArrowRight") n = (i + 1) % 4;
    if (e.key === "ArrowLeft") n = (i + 3) % 4;
    if (e.key === "Home") n = 0;
    if (e.key === "End") n = 3;
    if (n !== undefined) {
      e.preventDefault();
      activate(tabs[n]);
      tabs[n].focus();
    }
  };
});
function setSize(size: string) {
  document.documentElement.dataset.text = size;
  for (const id of ["comfortable", "larger"])
    $(id).setAttribute("aria-pressed", String(size === id));
  try {
    localStorage.setItem("lesson-text-size", size);
  } catch {}
}
try {
  setSize(
    localStorage.getItem("lesson-text-size") === "larger"
      ? "larger"
      : "comfortable",
  );
} catch {}
$("comfortable").onclick = () => setSize("comfortable");
$("larger").onclick = () => setSize("larger");
const answers = new Map<number, boolean>();
QUESTIONS.forEach((q, i) => {
  const field = document.createElement("fieldset"),
    legend = document.createElement("legend"),
    feedback = document.createElement("p");
  field.className = "panel question";
  legend.textContent = `${i + 1}. ${q.question}`;
  feedback.className = "feedback";
  feedback.setAttribute("aria-live", "polite");
  field.append(legend);
  q.answers.forEach((answer, j) => {
    const label = document.createElement("label"),
      radio = document.createElement("input");
    radio.type = "radio";
    radio.name = `q-${i}`;
    label.append(radio, document.createTextNode(answer));
    radio.onchange = () => {
      const correct = j === q.correct;
      answers.set(i, correct);
      feedback.textContent = `${correct ? "Correct." : "Try again."} ${q.explanation}`;
      feedback.classList.toggle("correct", correct);
      $("score").textContent =
        `${[...answers.values()].filter(Boolean).length} / 6 correct`;
    };
    field.append(label);
  });
  field.append(feedback);
  $("quiz").append(field);
});

let mode: Mode = "demo",
  sessionId = "",
  threadId = "",
  compareId = "",
  busy = false,
  observing = false;
let state: LabState = {
  mode: "demo",
  sessions: [],
  collections: {},
  views: {},
  traces: [],
};
const val = (id: string) => $<HTMLInputElement>(id).value;
const rows = () => state.collections[sessionId] ?? [];
const current = () => rows().find((t) => t.id === threadId);
const view = (id = threadId) => state.views[scopeKey(sessionId, id)];
function status(t: string) {
  $("status").textContent = t;
}
function content(label: string, text: string) {
  const a = document.createElement("article"),
    h = document.createElement("h4");
  a.className = "case-message";
  h.textContent = label;
  a.append(h, renderResponse(text));
  return a;
}
function render() {
  const parent = $<HTMLSelectElement>("parent-session");
  parent.replaceChildren();
  for (const s of state.sessions) parent.add(new Option(s.label, s.id));
  parent.value = sessionId;
  const selected = $<HTMLSelectElement>("thread-select");
  selected.replaceChildren(
    new Option(rows().length ? "Choose a thread" : "List threads first", ""),
  );
  for (const t of rows())
    selected.add(
      new Option(
        `${t.label} · ${t.parent_thread_id === null ? "primary" : "child"} · ${t.status}`,
        t.id,
      ),
    );
  selected.value = threadId;
  const t = current(),
    v = view();
  $("thread-count").textContent = `${rows().length} threads`;
  $("discovery-note").textContent =
    rows().length === 1
      ? "One thread discovered. A simple managed session may have only a primary thread."
      : rows().length
        ? "All returned pages are represented. Primary: parent_thread_id null. Children keep the parent session."
        : "List threads under the selected parent. An empty result can also mean no threads match the status filter.";
  $("thread-tree").replaceChildren();
  for (const row of rows()) {
    const button = document.createElement("button"),
      strong = document.createElement("strong"),
      small = document.createElement("small");
    button.className = `thread-node ${row.parent_thread_id === null ? "primary-node" : "child-node"}`;
    button.setAttribute("aria-pressed", String(row.id === threadId));
    button.disabled = busy;
    strong.textContent = row.label;
    small.textContent = `${row.parent_thread_id === null ? "Primary" : "Child"} · ${row.status}${row.archived_at ? " · archived" : ""}`;
    button.append(strong, small);
    button.onclick = () => void action(() => select(row.id));
    $("thread-tree").append(button);
  }
  $("thread-status").textContent = t
    ? `${t.status}${t.archived_at ? " · archived" : ""}`
    : "No thread";
  $("identity").textContent = t
    ? `Parent ${sessionId} · Thread ${threadId}`
    : "Select a discovered thread.";
  $("details").replaceChildren(
    ...(t ? [createCodeBlock(JSON.stringify(t, null, 2), "json")] : []),
  );
  $("observation").textContent = v?.observation ?? "No snapshot";
  $("conversation").replaceChildren();
  for (const m of v?.projection.messages ?? []) {
    if (m.role === "assistant")
      $("conversation").append(
        content(
          `Reviewer${m.state === "preview" ? " · live preview" : m.state === "incomplete" ? " · incomplete preview" : ""}`,
          m.text || "Waiting for text…",
        ),
      );
    else {
      const a = document.createElement("article"),
        h = document.createElement("h4"),
        p = document.createElement("p");
      a.className = "case-message";
      h.textContent = "Review request";
      p.textContent = m.text;
      a.append(h, p);
      $("conversation").append(a);
    }
  }
  $("stop-reason").textContent =
    `Last observed branch stop reason: ${v?.projection.stopReason || "none"}. Parent and sibling completion are separate. ${v?.projection.unknownCount ?? 0} unhandled activity events.`;
  $("event-json").replaceChildren(
    createCodeBlock(JSON.stringify(v?.events ?? [], null, 2), "json"),
  );
  const comparison = $<HTMLSelectElement>("compare-thread");
  const others = rows().filter((row) => row.id !== threadId);
  if (!others.some((row) => row.id === compareId))
    compareId = others[0]?.id ?? "";
  comparison.replaceChildren(new Option("Choose another reviewer", ""));
  for (const row of others)
    comparison.add(new Option(`${row.label} · ${row.id}`, row.id));
  comparison.value = compareId;
  $("comparison").replaceChildren();
  for (const [id, label] of [
    [threadId, "Selected reviewer"],
    [compareId, "Comparison reviewer"],
  ]) {
    const a = document.createElement("article"),
      h = document.createElement("h4"),
      p = document.createElement("p");
    h.textContent = rows().find((row) => row.id === id)?.label ?? label;
    p.className = "note";
    p.textContent = id
      ? `Parent ${sessionId} · Thread ${id}`
      : "Choose a reviewer.";
    a.append(h, p);
    const snapshot = view(id);
    if (snapshot) {
      const answer = snapshot.projection.messages
        .filter((m) => m.role === "assistant")
        .map((m) => m.text)
        .join("\n\n");
      a.append(
        renderResponse(answer || "No assistant messages in this history."),
      );
    } else {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "Load this scoped history to compare.";
      a.append(empty);
    }
    $("comparison").append(a);
  }
  $("timeline").replaceChildren();
  const traces = state.traces.filter(
    (trace) => trace.scope.sessionId === sessionId,
  );
  for (const trace of [...traces].reverse()) {
    const li = document.createElement("li"),
      h = document.createElement("strong"),
      p = document.createElement("p"),
      d = document.createElement("details"),
      summary = document.createElement("summary");
    h.textContent = trace.action;
    p.textContent = trace.explanation;
    summary.textContent = "Inspect scoped request and response";
    d.append(
      summary,
      createCodeBlock(
        JSON.stringify(
          {
            scope: trace.scope,
            request: trace.request,
            response: trace.response,
          },
          null,
          2,
        ),
        "json",
      ),
    );
    li.append(h, p, d);
    $("timeline").append(li);
  }
  $("trace-count").textContent = `${traces.length} operations`;
  for (const id of [
    "mode",
    "parent-session",
    "status-filter",
    "page-size",
    "thread-select",
    "compare-thread",
    "walkthrough",
  ])
    $<HTMLButtonElement>(id).disabled = busy;
  $<HTMLButtonElement>("list-threads").disabled = busy || !sessionId;
  for (const id of ["retrieve", "history"])
    $<HTMLButtonElement>(id).disabled = busy || !t;
  $<HTMLButtonElement>("watch").disabled =
    busy || !t || Boolean(t.archived_at) || t.status === "terminated";
  $<HTMLButtonElement>("stop").disabled = !observing;
  $<HTMLButtonElement>("load-comparison").disabled = busy || !compareId;
  $<HTMLButtonElement>("reset-demo").disabled = busy || mode !== "demo";
  const archivable = Boolean(
    t &&
    t.parent_thread_id !== null &&
    !t.workflow_run_id &&
    t.status === "idle" &&
    !t.archived_at,
  );
  $<HTMLButtonElement>("archive").disabled =
    busy || !archivable || val("archive-name") !== `ARCHIVE ${threadId}`;
  $("archive-note").textContent =
    t?.parent_thread_id === null
      ? "Primary thread protected by this application."
      : t?.workflow_run_id
        ? "Workflow-run thread protected by this application."
        : t?.archived_at
          ? "Archived: terminal, retained history is still inspectable."
          : "Only an idle child can be archived. The walkthrough never archives.";
  for (const [stage, ready] of [
    ["discover", rows().length > 0],
    ["inspect", Boolean(v)],
    ["compare", Boolean(v && view(compareId) && compareId !== threadId)],
    ["observe", Boolean(v?.events.some((e) => e.type === "event_delta"))],
  ] as const)
    $(`stage-${stage}`).classList.toggle("ready", ready);
}
async function api(path: string, data?: Record<string, unknown>) {
  const r = await fetch(
    path,
    data
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode, sessionId, threadId, ...data }),
        }
      : undefined,
  );
  const result = await r.json();
  if (!r.ok) throw new Error(result.error ?? "Request failed.");
  return result;
}
async function refresh() {
  state = await api(`/api/state?mode=${mode}`);
  if (!state.sessions.some((s) => s.id === sessionId))
    sessionId = state.sessions[0]?.id ?? "";
  render();
}
async function perform(action: string, extra: Record<string, unknown> = {}) {
  state = await api("/api/action", { action, ...extra });
  render();
}
async function action(work: () => Promise<void>) {
  if (busy) return;
  busy = true;
  render();
  try {
    await work();
  } catch (e) {
    status(e instanceof Error ? e.message : "Operation failed.");
  } finally {
    busy = false;
    observing = false;
    render();
  }
}
async function list() {
  await perform("list", {
    limit: Number(val("page-size")),
    ...(val("status-filter") === "all"
      ? {}
      : { statuses: [val("status-filter")] }),
  });
  if (!rows().some((t) => t.id === threadId)) threadId = rows()[0]?.id ?? "";
  render();
  status(`Discovered ${rows().length} threads across all returned pages.`);
}
async function select(id: string) {
  threadId = id;
  render();
  if (id) {
    await perform("retrieve");
    await perform("history");
  }
  status("Scoped details and history loaded. No input was sent.");
}
async function watch() {
  observing = true;
  render();
  status(
    mode === "demo"
      ? "Watching a scripted thread update…"
      : "Watching future branch events. This does not start managed work.",
  );
  const response = await fetch("/api/watch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode, sessionId, threadId }),
  });
  if (!response.ok) {
    const e = await response.json();
    throw new Error(e.error ?? "Observation failed");
  }
  await readPackets(response, (packet: Packet) => {
    if (packet.kind === "view") {
      state.views[scopeKey(packet.view.sessionId, packet.view.threadId)] =
        packet.view;
      render();
    } else if (packet.kind === "done") {
      observing = false;
      status(packet.text);
      render();
    }
  });
  await refresh();
}
$("walkthrough").onclick = () =>
  void action(async () => {
    $<HTMLSelectElement>("status-filter").value = "all";
    $<HTMLInputElement>("page-size").value = "2";
    await list();
    const target =
      rows().find((t) => t.label.toLowerCase().includes("research")) ??
      rows().find((t) => t.parent_thread_id !== null) ??
      rows()[0];
    if (!target) {
      status(
        "No threads discovered. Use an existing session with available threads.",
      );
      return;
    }
    await select(target.id);
    compareId =
      rows().find((t) => t.id !== threadId && t.parent_thread_id !== null)
        ?.id ??
      rows().find((t) => t.id !== threadId)?.id ??
      "";
    if (compareId) await perform("history", { threadId: compareId });
    await watch();
  });
$("reset-demo").onclick = () =>
  void action(async () => {
    state = await api("/api/reset-demo", {});
    sessionId = state.sessions[0]?.id ?? "";
    threadId = "";
    compareId = "";
    render();
    status("Demo fixtures reset. Live data is unaffected.");
  });
$("list-threads").onclick = () => void action(list);
$("retrieve").onclick = () =>
  void action(async () => {
    await perform("retrieve");
    status("Thread details retrieved. No input or new work was sent.");
  });
$("history").onclick = () =>
  void action(async () => {
    await perform("history");
    status("Persisted history loaded for this exact parent/thread pair.");
  });
$("watch").onclick = () => void action(watch);
$("stop").onclick = () => {
  if (observing) {
    status("Closing observation only…");
    void api("/api/stop", {}).catch((e) => status(e.message));
  }
};
$("thread-select").onchange = () => {
  const chosenThreadId = val("thread-select");
  void action(() => select(chosenThreadId));
};
$("compare-thread").onchange = () => {
  compareId = val("compare-thread");
  render();
};
$("load-comparison").onclick = () =>
  void action(async () => {
    await perform("history", { threadId: compareId });
    status("Comparison history loaded. The selected scope is unchanged.");
  });
$("archive-name").oninput = render;
$("archive").onclick = () =>
  void action(async () => {
    await perform("archive", { confirm: val("archive-name") });
    status("Child thread archived. Its retained history can still be read.");
  });
$("parent-session").onchange = () => {
  sessionId = val("parent-session");
  threadId = "";
  compareId = "";
  render();
  status("Parent changed. List or select only this session’s scoped threads.");
};
$("mode").onchange = () => {
  mode = val("mode") as Mode;
  sessionId = "";
  threadId = "";
  compareId = "";
  $("mode-note").textContent =
    mode === "demo"
      ? "Scripted reviewer histories and live-event replay. No cloud calls or managed execution."
      : "Inspect an existing managed session. Reads and observation send no model input; archival changes the selected child deliberately.";
  void refresh().catch((e) => status(e.message));
};
render();
void api("/api/lesson")
  .then(async (info) => {
    const option = $<HTMLSelectElement>("mode").options[1];
    option.disabled = !info.liveReady;
    option.textContent = info.liveReady
      ? "Live · configured managed session"
      : "Live · configure server key + session ID";
    await refresh();
  })
  .catch((e) => status(e.message));
