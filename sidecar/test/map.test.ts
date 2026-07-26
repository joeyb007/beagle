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
