import { readFile } from "node:fs/promises";
import { loadConfig, ConfigError } from "./config.ts";
import { createEvccClient } from "./evcc-client.ts";
import { runScheduledCharge } from "./scheduled-charge.ts";

const EXIT_CONFIG_ERROR = 2;

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
      `httpTimeoutMs=${cfg.httpTimeoutMs} dryRun=${cfg.dryRun}`,
  );
  const client = createEvccClient({
    baseUrl: cfg.evccUrl,
    apiKey: cfg.apiKey,
    timeoutMs: cfg.httpTimeoutMs,
  });
  try {
    await runScheduledCharge({ targetSoc: cfg.targetSoc }, client);
  } catch (err) {
    console.error(`error: ${(err as Error).message}`);
    return 1;
  }
  return 0;
}

main(process.argv, process.env).then((code) => {
  process.exitCode = code;
});
