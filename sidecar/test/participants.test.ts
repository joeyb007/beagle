// FakePhoton participants bookkeeping (Task 3).
// Run: node --import tsx --test test/participants.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { FakePhoton } from "../src/photon.js";

test("createChat records participants", async () => {
  const fake = new FakePhoton();
  const { id } = await fake.createChat(["+1555", "+1666"]);
  assert.deepEqual(await fake.getParticipants(id), ["+1555", "+1666"]);
});

test("registerGroup registers an externally-created group", async () => {
  const fake = new FakePhoton();
  fake.registerGroup("ext-g1", ["+1555", "+1666", "+1777"]);
  assert.deepEqual(await fake.getParticipants("ext-g1"), ["+1555", "+1666", "+1777"]);
});

test("unknown chat has no participants", async () => {
  const fake = new FakePhoton();
  assert.deepEqual(await fake.getParticipants("nope"), []);
});
