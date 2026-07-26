// Pure event→OutEvent mapping, shaped per the SDK's own .d.ts (v2).
// Run: node --import tsx --test test/map.test.ts
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mapMessageEvent, mapPollEvent, PollOptionIndex } from "../src/photon.js";

test("message.received from someone else becomes an inbound OutEvent", () => {
  const e = {
    type: "message.received",
    chatGuid: "iMessage;-;chat123",
    isFromMe: false,
    actor: { address: "+15550000001", service: "iMessage" },
    occurredAt: new Date(),
    sequence: 7,
    message: {
      guid: "msg-1",
      isFromMe: false,
      sender: { address: "+15550000001", service: "iMessage" },
      chatGuids: ["iMessage;-;chat123"],
      content: { text: "sat works", attachments: [], formatting: [], mentions: [] },
    },
  };
  assert.deepEqual(mapMessageEvent(e as any), {
    type: "message",
    handle: "+15550000001",
    chatId: "iMessage;-;chat123",
    text: "sat works",
  });
});

test("own messages and non-received types are dropped", () => {
  assert.equal(mapMessageEvent({ type: "message.received", isFromMe: true } as any), null);
  assert.equal(mapMessageEvent({ type: "message.read", isFromMe: false } as any), null);
});

test("poll voted delta maps optionIdentifier to the created option index", () => {
  const index = new PollOptionIndex();
  index.remember("poll-guid-1", ["opt-a", "opt-b", "opt-c"]);
  const e = {
    type: "poll.changed",
    chatGuid: "iMessage;-;chat123",
    isFromMe: false,
    actor: { address: "+15550000002", service: "iMessage" },
    pollMessageGuid: "poll-guid-1",
    delta: { type: "voted", optionIdentifier: "opt-b" },
  };
  assert.deepEqual(mapPollEvent(e as any, index), {
    type: "pollVote",
    handle: "+15550000002",
    pollId: "poll-guid-1",
    optionIndex: 1,
  });
});

test("unvoted / created deltas and unknown identifiers are dropped", () => {
  const index = new PollOptionIndex();
  index.remember("p", ["a"]);
  assert.equal(
    mapPollEvent({ type: "poll.changed", pollMessageGuid: "p", delta: { type: "unvoted", optionIdentifier: "a" } } as any, index),
    null
  );
  assert.equal(
    mapPollEvent({ type: "poll.changed", pollMessageGuid: "p", delta: { type: "voted", optionIdentifier: "zzz" }, actor: { address: "+1" } } as any, index),
    null
  );
});

// ---- spectrum-ts mapping (hosted provider path) ----
import { mapSpectrumInbound, PollBySpace } from "../src/photon.js";

const space = { id: "any;-;+15550000001" };

test("spectrum inbound text becomes a message OutEvent", () => {
  const message = {
    direction: "inbound",
    sender: { id: "+15550000001" },
    content: { type: "text", text: "sat works" },
  };
  assert.deepEqual(mapSpectrumInbound(space as any, message as any, new PollBySpace()), {
    type: "message",
    handle: "+15550000001",
    chatId: "any;-;+15550000001",
    text: "sat works",
  });
});

test("spectrum outbound and non-text are dropped", () => {
  assert.equal(
    mapSpectrumInbound(space as any, { direction: "outbound", content: { type: "text", text: "x" } } as any, new PollBySpace()),
    null
  );
  assert.equal(
    mapSpectrumInbound(space as any, { direction: "inbound", content: { type: "reaction" } } as any, new PollBySpace()),
    null
  );
});

test("spectrum poll_option vote maps to index from embedded poll order", () => {
  const polls = new PollBySpace();
  polls.remember("group-1", "poll-msg-9");
  const message = {
    direction: "inbound",
    sender: { id: "+15550000002" },
    content: {
      type: "poll_option",
      selected: true,
      option: { title: "Ebisu Sushi" },
      poll: { type: "poll", title: "where to?", options: [{ title: "Tacos El Rey" }, { title: "Ebisu Sushi" }] },
    },
  };
  assert.deepEqual(mapSpectrumInbound({ id: "group-1" } as any, message as any, polls), {
    type: "pollVote",
    handle: "+15550000002",
    pollId: "poll-msg-9",
    optionIndex: 1,
  });
});

test("spectrum unselect (retracted vote) is dropped", () => {
  const polls = new PollBySpace();
  polls.remember("group-1", "poll-msg-9");
  const message = {
    direction: "inbound",
    sender: { id: "+15550000002" },
    content: { type: "poll_option", selected: false, option: { title: "Ebisu Sushi" }, poll: { options: [{ title: "Ebisu Sushi" }] } },
  };
  assert.equal(mapSpectrumInbound({ id: "group-1" } as any, message as any, polls), null);
});

test("poll_option maps regardless of direction (docs don't gate votes on it)", () => {
  const polls = new PollBySpace();
  polls.remember("group-1", "poll-msg-9");
  for (const direction of ["outbound", undefined]) {
    const message = {
      direction,
      sender: { id: "+15550000002" },
      content: {
        type: "poll_option",
        selected: true,
        option: { title: "works" },
        poll: { options: [{ title: "works" }, { title: "nope" }] },
      },
    };
    assert.deepEqual(mapSpectrumInbound({ id: "group-1" } as any, message as any, polls), {
      type: "pollVote",
      handle: "+15550000002",
      pollId: "poll-msg-9",
      optionIndex: 0,
    }, `direction=${direction}`);
  }
});

test("agent's own poll_option (sender.kind=agent) is dropped", () => {
  const polls = new PollBySpace();
  polls.remember("g", "p");
  const message = {
    direction: "outbound",
    sender: { id: "+16282649335", kind: "agent" },
    content: { type: "poll_option", selected: true, option: { title: "a" }, poll: { options: [{ title: "a" }] } },
  };
  assert.equal(mapSpectrumInbound({ id: "g" } as any, message as any, polls), null);
});
