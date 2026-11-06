import { test } from "node:test";
import assert from "node:assert/strict";
import { runScheduledCharge } from "./scheduled-charge.ts";
import type { EvccClient } from "./evcc-client.ts";

function fakeClient(batterySoc: number) {
  const calls: string[] = [];
  const client: EvccClient = {
    async getState() {
      calls.push("getState");
      return { batteryMode: "normal", batterySoc };
    },
    async setChargeMode() {
      calls.push("setChargeMode");
    },
  };
  return { client, calls };
}

class StopLoop extends Error {}

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
  await assert.rejects(runScheduledCharge({ targetSoc: 90 }, client, { sleep }), StopLoop);
  assert.deepEqual(calls, ["getState", "setChargeMode"]);
});

test("re-sends charge mode every 30 seconds while charging", async () => {
  const { client, calls } = fakeClient(40);
  const { sleep, delays } = fakeSleep(2);
  await assert.rejects(runScheduledCharge({ targetSoc: 90 }, client, { sleep }), StopLoop);
  assert.deepEqual(calls, ["getState", "setChargeMode", "setChargeMode"]);
  assert.deepEqual(delays, [30_000, 30_000]);
});

test("sends no mode change when battery soc is at target", async () => {
  const { client, calls } = fakeClient(90);
  await runScheduledCharge({ targetSoc: 90 }, client);
  assert.deepEqual(calls, ["getState"]);
});
