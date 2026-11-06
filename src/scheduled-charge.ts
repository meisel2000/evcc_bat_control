import type { EvccClient } from "./evcc-client.ts";

/** evcc resets external battery mode after 60 s; refresh at half that to keep a margin. */
export const KEEP_ALIVE_INTERVAL_MS = 30_000;

export interface KeepAliveOptions {
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Starts a grid charge when the battery is below the target state of charge.
 * Makes no mode change when the target is already reached.
 * While charging, re-sends the charge mode every keep-alive interval and
 * re-reads the state each cycle. Once the target is reached, sets normal mode and returns.
 */
export async function runScheduledCharge(
  settings: { targetSoc: number },
  client: EvccClient,
  opts: KeepAliveOptions = {},
): Promise<void> {
  const intervalMs = opts.intervalMs ?? KEEP_ALIVE_INTERVAL_MS;
  const sleep = opts.sleep ?? defaultSleep;

  const state = await client.getState();
  if (state.batterySoc >= settings.targetSoc) {
    return;
  }
  await client.setChargeMode();
  for (;;) {
    await sleep(intervalMs);
    const current = await client.getState();
    if (current.batterySoc >= settings.targetSoc) {
      await client.setNormalMode();
      return;
    }
    await client.setChargeMode();
  }
}
