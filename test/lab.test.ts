import { test } from "node:test";
import assert from "node:assert/strict";
import Anthropic from "@anthropic-ai/sdk";
import {
  Lab,
  DemoProvider,
  LiveProvider,
  DEMO_SESSIONS,
  type Connection,
} from "../src/server/lab.js";
import { scopeKey, type WireEvent } from "../src/shared/lesson.js";
const parent = DEMO_SESSIONS[0].id,
  other = DEMO_SESSIONS[1].id;
async function setup(provider = new DemoProvider()) {
  const lab = new Lab({ demo: provider }, undefined, 10000);
  await lab.list("demo", parent, { limit: 1 });
  return lab;
}
const research = `${parent}_research`;
test("page size one discovers every thread, statuses filter, and invalid options fail", async () => {
  const lab = await setup();
  assert.equal(lab.states.demo.collections[parent].length, 4);
  await assert.rejects(lab.list("demo", parent, { limit: 0 }));
  await assert.rejects(lab.list("demo", parent, { statuses: ["complete"] }));
  await lab.list("demo", parent, { limit: 2, statuses: ["running"] });
  assert.equal(lab.states.demo.collections[parent].length, 0);
});
test("parent/thread pair isolation and independent reviewer snapshots", async () => {
  const lab = await setup();
  await lab.list("demo", other, { limit: 1 });
  await assert.rejects(lab.details("demo", other, research), /registered pair/);
  await assert.rejects(lab.details("live", parent, research), /configured/);
  await lab.history("demo", parent, research);
  await lab.history("demo", parent, `${parent}_troubleshooting`);
  await lab.history("demo", other, `${other}_research`);
  assert.equal(Object.keys(lab.states.demo.views).length, 3);
  assert.match(
    lab.states.demo.views[scopeKey(parent, research)].projection.messages[1]
      .text,
    /Research findings/,
  );
  assert.match(
    lab.states.demo.views[scopeKey(parent, `${parent}_troubleshooting`)]
      .projection.messages[1].text,
    /Troubleshooting/,
  );
  assert.notEqual(scopeKey(parent, research), scopeKey(other, research));
});
test("archive requires an idle child and exact confirmation; retained history remains readable", async () => {
  const lab = await setup();
  await assert.rejects(
    lab.archive(
      "demo",
      parent,
      `${parent}_primary`,
      `ARCHIVE ${parent}_primary`,
    ),
    /protects the primary/,
  );
  await assert.rejects(
    lab.archive("demo", parent, research, "wrong"),
    /Type ARCHIVE/,
  );
  await lab.archive("demo", parent, research, `ARCHIVE ${research}`);
  assert.equal(
    lab.states.demo.collections[parent].find((t) => t.id === research)!.status,
    "terminated",
  );
  await lab.history("demo", parent, research);
  assert.equal(
    lab.states.demo.views[scopeKey(parent, research)].projection.messages
      .length,
    2,
  );
  await assert.rejects(
    lab.archive("demo", parent, research, `ARCHIVE ${research}`),
  );
  lab.resetDemo();
  await lab.list("demo", parent, {});
  assert.equal(
    lab.states.demo.collections[parent].find((t) => t.id === research)!
      .archived_at,
    null,
  );
});
test("running and workflow-run archival guards reject before provider mutation", async () => {
  class Guarded extends DemoProvider {
    guard = "running";
    override async retrieve(s: string, t: string) {
      const row = await super.retrieve(s, t);
      if (row.parent_thread_id) {
        if (this.guard === "running") row.status = "running";
        else row.workflow_run_id = "run_open";
      }
      return row;
    }
  }
  const provider = new Guarded(),
    lab = await setup(provider);
  await assert.rejects(
    lab.archive("demo", parent, research, `ARCHIVE ${research}`),
    /idle/,
  );
  provider.guard = "workflow";
  await assert.rejects(
    lab.archive("demo", parent, research, `ARCHIVE ${research}`),
    /workflow-run/,
  );
});
test("thread live previews replace once; sibling history is unchanged and persisted refresh removes envelopes", async () => {
  const lab = await setup();
  await lab.history("demo", parent, `${parent}_drafting`);
  const before = JSON.stringify(
    lab.states.demo.views[scopeKey(parent, `${parent}_drafting`)],
  );
  await lab.watch("demo", parent, research, () => {});
  const v = lab.states.demo.views[scopeKey(parent, research)];
  assert.equal(v.projection.messages.length, 3);
  assert.equal(v.projection.messages.at(-1)!.state, "complete");
  assert.equal(v.projection.stopReason, "end_turn");
  assert.ok(v.events.some((e) => e.type === "event_delta"));
  assert.equal(
    JSON.stringify(
      lab.states.demo.views[scopeKey(parent, `${parent}_drafting`)],
    ),
    before,
  );
  await lab.history("demo", parent, research);
  assert.ok(
    !lab.states.demo.views[scopeKey(parent, research)].events.some(
      (e) => e.type === "event_delta",
    ),
  );
});
test("stop closes observation only; archive is blocked during watch and timeout releases observer", async () => {
  const lab = await setup();
  let stopped = false;
  let archiveGuard: Promise<void> | undefined;
  await lab.watch("demo", parent, research, (p) => {
    if (
      p.kind === "view" &&
      p.view.events.some((e) => e.type === "event_start") &&
      !stopped
    ) {
      stopped = true;
      archiveGuard = assert.rejects(
        lab.archive("demo", parent, research, `ARCHIVE ${research}`),
      );
      lab.stop("demo", parent, research);
    }
  });
  assert.equal(
    lab.states.demo.views[scopeKey(parent, research)].observation,
    "closed",
  );
  await archiveGuard;
  await lab.details("demo", parent, research);
  assert.equal(
    lab.states.demo.collections[parent].find((t) => t.id === research)!
      .archived_at,
    null,
  );
  const timed = new Lab({ demo: new DemoProvider() }, undefined, 25);
  await timed.list("demo", parent, {});
  await timed.watch("demo", parent, research, () => {});
  assert.equal(
    timed.states.demo.views[scopeKey(parent, research)].observation,
    "closed",
  );
});
test("recovery deduplicates buffered history and strips thinking content; child foreign events are excluded", async () => {
  class Buffered extends DemoProvider {
    override async history(): Promise<WireEvent[]> {
      return [
        {
          type: "agent.message",
          id: "same",
          content: [{ type: "text", text: "answer" }],
        },
        {
          type: "agent.thinking",
          id: "thinking",
          content: [{ type: "thinking", thinking: "private-placeholder" }],
        },
        {
          type: "agent.message",
          id: "wrong",
          session_thread_id: "another_child",
          content: [{ type: "text", text: "wrong branch" }],
        },
      ];
    }
    override async open(): Promise<Connection> {
      return {
        events: (async function* () {
          yield {
            type: "agent.message",
            id: "same",
            content: [{ type: "text", text: "answer" }],
          };
          yield {
            type: "session.thread_status_idle",
            id: "idle",
            session_thread_id: research,
            stop_reason: { type: "end_turn" },
          };
        })(),
        close() {},
      };
    }
  }
  const lab = await setup(new Buffered());
  await lab.watch("demo", parent, research, () => {});
  const v = lab.states.demo.views[scopeKey(parent, research)];
  assert.equal(v.projection.messages.length, 1);
  assert.ok(!JSON.stringify(v).includes("private-placeholder"));
  assert.ok(!JSON.stringify(v).includes("wrong branch"));
});
test("official SDK uses scoped paths, pagination, preview params and beta; reads/watch make no POST", async () => {
  const demo = new DemoProvider(),
    row = await demo.retrieve(parent, research);
  const raw = { ...row, agent: { type: "inline", name: row.label } };
  const calls: {
    path: string;
    method: string;
    beta: string | null;
    body: string;
  }[] = [];
  let threadPage = 0,
    eventPage = 0;
  const client = new Anthropic({
    apiKey: "test-only",
    maxRetries: 0,
    fetch: async (input, init) => {
      const req = new Request(input, init),
        url = new URL(req.url);
      calls.push({
        path: url.pathname + url.search,
        method: req.method,
        beta: req.headers.get("anthropic-beta"),
        body: await req.text(),
      });
      if (url.pathname.endsWith("/stream"))
        return new Response(
          `event: session.thread_status_idle\ndata: ${JSON.stringify({ type: "session.thread_status_idle", id: "idle-live", session_thread_id: research, stop_reason: { type: "end_turn" } })}\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        );
      if (url.pathname.endsWith("/events"))
        return Response.json({
          data: [
            {
              id: `past_${++eventPage}`,
              type: "agent.message",
              content: [{ type: "text", text: "History" }],
            },
          ],
          next_page: eventPage === 1 ? "events-page-2" : null,
        });
      if (url.pathname.endsWith("/threads")) {
        threadPage++;
        return Response.json({
          data: threadPage === 1 ? [raw] : [],
          next_page: threadPage === 1 ? "threads-page-2" : null,
        });
      }
      return Response.json(raw);
    },
  });
  const provider = new LiveProvider(client),
    lab = new Lab({ live: provider }, parent);
  await lab.list("live", parent, { limit: 1, statuses: ["idle"] });
  await lab.watch("live", parent, research, () => {});
  assert.equal(threadPage, 2);
  assert.equal(eventPage, 2);
  assert.ok(calls.every((c) => c.method === "GET"));
  assert.ok(calls.every((c) => c.beta?.includes("managed-agents-2026-04-01")));
  const stream = calls.findIndex((c) => c.path.includes("/stream")),
    history = calls.findIndex((c) => c.path.includes("/events"));
  assert.ok(stream < history);
  assert.match(calls[stream].path, /event_deltas/);
  assert.ok(calls.every((c) => c.path.includes(`/sessions/${parent}/threads`)));
  await provider.archive(parent, research);
  assert.equal(calls.at(-1)!.method, "POST");
  assert.match(calls.at(-1)!.path, new RegExp(`/threads/${research}/archive$`));
  assert.equal(JSON.parse(calls.at(-1)!.body || "{}").session_id, undefined);
});

test("a child termination cross-post does not end primary-thread observation", async () => {
  const primary = `${parent}_primary`;
  class CrossPosted extends DemoProvider {
    override async open(): Promise<Connection> {
      return {
        events: (async function* () {
          yield {
            type: "session.thread_status_terminated",
            id: "child-ended",
            session_thread_id: research,
          };
          yield {
            type: "agent.message",
            id: "primary-answer",
            content: [
              {
                type: "text",
                text: "Coordinator continued after the child ended.",
              },
            ],
          };
          yield {
            type: "session.thread_status_idle",
            id: "primary-idle",
            session_thread_id: primary,
            stop_reason: { type: "end_turn" },
          };
        })(),
        close() {},
      };
    }
  }
  const lab = await setup(new CrossPosted());
  await lab.watch("demo", parent, primary, () => {});
  assert.match(
    lab.states.demo.views[scopeKey(parent, primary)].projection.messages.at(-1)!
      .text,
    /Coordinator continued/,
  );
});
