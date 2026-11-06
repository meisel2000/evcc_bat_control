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

test("sets charge mode when battery soc is below target", async () => {
  const { client, calls } = fakeClient(40);
  await runScheduledCharge({ targetSoc: 90 }, client);
  assert.deepEqual(calls, ["getState", "setChargeMode"]);
});

test("sends no mode change when battery soc is at target", async () => {
  const { client, calls } = fakeClient(90);
  await runScheduledCharge({ targetSoc: 90 }, client);
  assert.deepEqual(calls, ["getState"]);
});
