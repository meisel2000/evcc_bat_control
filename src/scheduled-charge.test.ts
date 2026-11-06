import { test } from "node:test";
import assert from "node:assert/strict";
import { runScheduledCharge } from "./scheduled-charge.ts";
import type { EvccClient } from "./evcc-client.ts";

/** Fake client whose successive getState calls return `socs`; the last value repeats. */
function fakeClient(...socs: number[]) {
  const calls: string[] = [];
  let next = 0;
  const client: EvccClient = {
    async getState() {
      calls.push("getState");
      const batterySoc = socs[Math.min(next, socs.length - 1)];
      next += 1;
      return { batteryMode: "normal", batterySoc };
    },
    async setChargeMode() {
      calls.push("setChargeMode");
    },
    async setNormalMode() {
      calls.push("setNormalMode");
    },
  };
  return { client, calls };
}

class StopLoop extends Error {}

/** Fixed clock at 12:00 local time, so tests that do not concern time are independent of the wall clock. */
const midday = () => new Date(2026, 0, 10, 12, 0, 0).getTime();

/** Sleep stub that records requested delays and stops the loop after `count` sleeps. */
function fakeSleep(count: number) {
  const delays: number[] = [];
  const sleep = async (ms: number) => {
    delays.push(ms);
    if (delays.length >= count) throw new StopLoop();
  };
  return { sleep, delays };
}

test("sets charge mode when battery soc is below target", async () => {
  const { client, calls } = fakeClient(40);
  const { sleep } = fakeSleep(0);
  await assert.rejects(runScheduledCharge({ targetSoc: 90, maxDurationMinutes: 120, noProgressTimeoutMinutes: 1_000 }, client, { sleep, now: midday }), StopLoop);
  assert.deepEqual(calls, ["getState", "setChargeMode"]);
});

test("re-sends charge mode every 30 seconds while charging", async () => {
  const { client, calls } = fakeClient(40, 40);
  const { sleep, delays } = fakeSleep(2);
  await assert.rejects(runScheduledCharge({ targetSoc: 90, maxDurationMinutes: 120, noProgressTimeoutMinutes: 1_000 }, client, { sleep, now: midday }), StopLoop);
  assert.deepEqual(calls, ["getState", "setChargeMode", "getState", "setChargeMode"]);
  assert.deepEqual(delays, [30_000, 30_000]);
});

test("sends normal mode and stops when battery soc reaches target while charging", async () => {
  const { client, calls } = fakeClient(40, 60, 90);
  const { sleep } = fakeSleep(10);
  await runScheduledCharge({ targetSoc: 90, maxDurationMinutes: 120, noProgressTimeoutMinutes: 1_000 }, client, { sleep, now: midday });
  assert.deepEqual(calls, [
    "getState",
    "setChargeMode",
    "getState",
    "setChargeMode",
    "getState",
    "setNormalMode",
  ]);
});

test("sends no mode change when battery soc is at target", async () => {
  const { client, calls } = fakeClient(90);
  await runScheduledCharge({ targetSoc: 90, maxDurationMinutes: 120, noProgressTimeoutMinutes: 1_000 }, client);
  assert.deepEqual(calls, ["getState"]);
});

test("sets normal mode and reports window end when local time reaches 06:00", async () => {
  const { client, calls } = fakeClient(40);
  let t = new Date(2026, 0, 10, 5, 30, 0).getTime();
  const now = () => t;
  const sleep = async (ms: number) => {
    t += ms;
    if (t > new Date(2026, 0, 10, 7, 0, 0).getTime()) throw new Error("runaway: loop did not stop");
  };
  const result = await runScheduledCharge({ targetSoc: 90, maxDurationMinutes: 120, noProgressTimeoutMinutes: 1_000 }, client, {
    sleep,
    now,
  });
  assert.equal(result.outcome, "window-ended");
  assert.equal(calls.at(-1), "setNormalMode");
  assert.equal(calls.filter((c) => c === "setNormalMode").length, 1);
  assert.equal(t, new Date(2026, 0, 10, 6, 0, 0).getTime());
});

test("sets normal mode and reports no progress when soc does not rise within timeout", async () => {
  const { client, calls } = fakeClient(40);
  const start = midday();
  let t = start;
  const now = () => t;
  const sleep = async (ms: number) => {
    t += ms;
    if (t - start > 10 * 3_600_000) throw new Error("runaway: loop did not stop");
  };
  const result = await runScheduledCharge(
    { targetSoc: 90, maxDurationMinutes: 120, noProgressTimeoutMinutes: 30 },
    client,
    { sleep, now },
  );
  assert.equal(result.outcome, "no-progress");
  assert.equal(calls.at(-1), "setNormalMode");
  assert.equal(calls.filter((c) => c === "setNormalMode").length, 1);
  assert.ok(t - start > 30 * 60_000, "no-progress must not fire before the timeout has elapsed");
  assert.ok(t - start <= 30 * 60_000 + 30_000, "no-progress must fire within one keep-alive interval");
});

test("stops at maximum duration, sets normal mode and reports failure", async () => {
  const { client, calls } = fakeClient(40);
  const start = midday();
  let t = start;
  const now = () => t;
  const sleep = async (ms: number) => {
    t += ms;
    if (t - start > 10 * 3_600_000) throw new Error("runaway: loop did not stop");
  };
  const result = await runScheduledCharge({ targetSoc: 90, maxDurationMinutes: 120, noProgressTimeoutMinutes: 1_000 }, client, {
    sleep,
    now,
  });
  assert.equal(result.outcome, "max-duration-reached");
  assert.equal(calls.at(-1), "setNormalMode");
  assert.equal(calls.filter((c) => c === "setNormalMode").length, 1);
  assert.equal(t - start, 120 * 60_000);
});

test("sends normal mode and returns terminated when aborted while charging", async () => {
  const { client, calls } = fakeClient(40);
  const controller = new AbortController();
  let sleeps = 0;
  const sleep = async () => {
    sleeps += 1;
    if (sleeps > 1) throw new StopLoop();
    controller.abort();
  };
  const result = await runScheduledCharge(
    { targetSoc: 90, maxDurationMinutes: 120, noProgressTimeoutMinutes: 1_000 },
    client,
    { sleep, now: midday, signal: controller.signal },
  );
  assert.deepEqual(result, { outcome: "terminated" });
  assert.deepEqual(calls, ["getState", "setChargeMode", "setNormalMode"]);
});
