import { test } from "node:test";
import assert from "node:assert/strict";
import { createEvccClient } from "./evcc-client.ts";

function fakeFetch(calls: Array<{ url: string; init: RequestInit }>, body: unknown = {}) {
  return (async (url: string | URL, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}

test("getState reads battery soc and mode with the API key as bearer token", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = createEvccClient({
    baseUrl: "http://evcc.local:7070",
    apiKey: "evcc_secret",
    timeoutMs: 5000,
    fetch: fakeFetch(calls, { batteryMode: "normal", battery: { soc: 40 } }),
  });

  const state = await client.getState();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://evcc.local:7070/state");
  assert.equal(calls[0].init.method, "GET");
  assert.equal(
    (calls[0].init.headers as Record<string, string>).Authorization,
    "Bearer evcc_secret",
  );
  assert.equal(state.batterySoc, 40);
  assert.equal(state.batteryMode, "normal");
});

test("setChargeMode posts charge mode with the API key as bearer token", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const client = createEvccClient({
    baseUrl: "http://evcc.local:7070/",
    apiKey: "evcc_secret",
    timeoutMs: 5000,
    fetch: fakeFetch(calls),
  });

  await client.setChargeMode();

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://evcc.local:7070/batterymode/charge");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(
    (calls[0].init.headers as Record<string, string>).Authorization,
    "Bearer evcc_secret",
  );
});
