import { test } from "node:test";
import assert from "node:assert/strict";
import { loadConfig, ConfigError } from "./config.ts";

const validFile = {
  evccUrl: "http://evcc.default.svc.cluster.local:7070",
  targetSoc: 90,
  maxDurationMinutes: 120,
  noProgressTimeoutMinutes: 30,
  httpTimeoutMs: 5000,
  statePath: "/state/state.json",
};

const env = { EVCC_API_KEY: "evcc_test_key" };

test("accepts a valid config and applies defaults", () => {
  const cfg = loadConfig(validFile, env);
  assert.equal(cfg.evccUrl, validFile.evccUrl);
  assert.equal(cfg.targetSoc, 90);
  assert.equal(cfg.maxDurationMinutes, 120);
  assert.equal(cfg.noProgressTimeoutMinutes, 30);
  assert.equal(cfg.httpTimeoutMs, 5000);
  assert.equal(cfg.dryRun, false);
});

test("returns the state marker path", () => {
  const cfg = loadConfig(validFile, env);
  assert.equal(cfg.statePath, "/state/state.json");
});

test("rejects a missing state marker path and names it", () => {
  const { statePath: _omit, ...rest } = validFile;
  assert.throws(
    () => loadConfig(rest, env),
    (err: unknown) =>
      err instanceof ConfigError && /statePath/.test(err.message),
  );
});

test("rejects an empty state marker path", () => {
  assert.throws(
    () => loadConfig({ ...validFile, statePath: "  " }, env),
    (err: unknown) =>
      err instanceof ConfigError && /statePath/.test(err.message),
  );
});

test("reads the API key from the environment only", () => {
  const cfg = loadConfig(validFile, env);
  assert.equal(cfg.apiKey, "evcc_test_key");
  assert.equal("apiKey" in validFile, false);
});

test("rejects a target SoC above 100 and names the target SoC", () => {
  assert.throws(
    () => loadConfig({ ...validFile, targetSoc: 120 }, env),
    (err: unknown) =>
      err instanceof ConfigError && /targetSoc/.test(err.message),
  );
});

test("rejects a target SoC below 0", () => {
  assert.throws(
    () => loadConfig({ ...validFile, targetSoc: -1 }, env),
    ConfigError,
  );
});

test("rejects a maximum duration of zero or less", () => {
  assert.throws(
    () => loadConfig({ ...validFile, maxDurationMinutes: 0 }, env),
    (err: unknown) =>
      err instanceof ConfigError && /maxDurationMinutes/.test(err.message),
  );
});

test("rejects a missing evcc URL", () => {
  const { evccUrl: _omit, ...rest } = validFile;
  assert.throws(
    () => loadConfig(rest, env),
    (err: unknown) =>
      err instanceof ConfigError && /evccUrl/.test(err.message),
  );
});

test("rejects a missing API key without echoing any key value", () => {
  assert.throws(
    () => loadConfig(validFile, {}),
    (err: unknown) =>
      err instanceof ConfigError && /EVCC_API_KEY/.test(err.message),
  );
});
