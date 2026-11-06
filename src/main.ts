import { readFile } from "node:fs/promises";
import { loadConfig, ConfigError } from "./config.ts";
import { createEvccClient } from "./evcc-client.ts";
import { runScheduledCharge } from "./scheduled-charge.ts";
import { createFileStateMarker } from "./state-marker.ts";

const EXIT_CONFIG_ERROR = 2;
const EXIT_TERMINATED = 130;

async function main(argv: string[], env: Record<string, string | undefined>): Promise<number> {
  const configPath = argv[2] ?? env.CONFIG_PATH;
  if (!configPath) {
    console.error("usage: node src/main.ts <config.json>  (or set CONFIG_PATH)");
    return EXIT_CONFIG_ERROR;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(configPath, "utf8"));
  } catch (err) {
    console.error(`config error: cannot read or parse ${configPath}: ${(err as Error).message}`);
    return EXIT_CONFIG_ERROR;
  }

  let cfg;
  try {
    cfg = loadConfig(raw, env);
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`config error: ${err.message}`);
      return EXIT_CONFIG_ERROR;
    }
    throw err;
  }

  // Log settings only. The API key is deliberately excluded.
  console.log(
    `started: evccUrl=${cfg.evccUrl} targetSoc=${cfg.targetSoc} ` +
      `maxDurationMinutes=${cfg.maxDurationMinutes} ` +
      `noProgressTimeoutMinutes=${cfg.noProgressTimeoutMinutes} ` +
      `httpTimeoutMs=${cfg.httpTimeoutMs} dryRun=${cfg.dryRun} statePath=${cfg.statePath}`,
  );
  const client = createEvccClient({
    baseUrl: cfg.evccUrl,
    apiKey: cfg.apiKey,
    timeoutMs: cfg.httpTimeoutMs,
    dryRun: cfg.dryRun,
  });
  const clockOpts = testClockOptions(env);
  if (clockOpts === null) {
    console.error("config error: EVCC_TEST_CLOCK must be an ISO-8601 time");
    return EXIT_CONFIG_ERROR;
  }
  const controller = new AbortController();
  const onSignal = () => controller.abort();
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  try {
    const result = await runScheduledCharge(
      {
        targetSoc: cfg.targetSoc,
        maxDurationMinutes: cfg.maxDurationMinutes,
        noProgressTimeoutMinutes: cfg.noProgressTimeoutMinutes,
      },
      client,
      { ...clockOpts, signal: controller.signal, marker: createFileStateMarker(cfg.statePath) },
    );
    if (result.outcome === "terminated") {
      console.log("info: termination signal received; battery set to normal mode");
      return EXIT_TERMINATED;
    }
    if (result.outcome === "window-ended") {
      console.log("info: tariff window ended at 06:00 before target was reached; battery set to normal mode");
    }
    if (result.outcome === "no-progress") {
      console.error(
        `error: state of charge made no progress for ${cfg.noProgressTimeoutMinutes} minutes; battery set to normal mode`,
      );
      return 1;
    }
    if (result.outcome === "max-duration-reached") {
      console.error(
        `error: charge did not reach target ${cfg.targetSoc}% within ${cfg.maxDurationMinutes} minutes`,
      );
      return 1;
    }
    if (result.outcome === "state-read-failed") {
      console.error("error: could not read state of charge; battery set to normal mode");
      if (result.normalModeError !== undefined) {
        console.error(`error: could not set normal mode: ${result.normalModeError}`);
      }
      return 1;
    }
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 1;
  }
  return 0;
}

/**
 * Test-only seam. When EVCC_TEST_CLOCK is set to an ISO-8601 time, the job uses a
 * virtual clock that starts there, and each sleep advances it instantly.
 * Returns undefined (real clock and real sleep) when unset, or null when invalid.
 */
function testClockOptions(
  env: Record<string, string | undefined>,
): { now: () => number; sleep: (ms: number) => Promise<void> } | undefined | null {
  const start = env.EVCC_TEST_CLOCK;
  if (start === undefined) return undefined;
  const startMs = Date.parse(start);
  if (Number.isNaN(startMs)) return null;
  let virtualNow = startMs;
  return {
    now: () => virtualNow,
    sleep: async (ms: number) => {
      virtualNow += ms;
    },
  };
}

main(process.argv, process.env).then((code) => {
  process.exitCode = code;
});
