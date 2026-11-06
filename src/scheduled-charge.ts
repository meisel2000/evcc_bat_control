import type { EvccClient } from "./evcc-client.ts";

/** evcc resets external battery mode after 60 s; refresh at half that to keep a margin. */
export const KEEP_ALIVE_INTERVAL_MS = 30_000;

export interface KeepAliveOptions {
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Current time in epoch milliseconds. Defaults to the system clock. */
  now?: () => number;
}

export type ChargeOutcome = "no-charge-needed" | "target-reached" | "max-duration-reached";

export interface ChargeResult {
  outcome: ChargeOutcome;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Starts a grid charge when the battery is below the target state of charge.
 * Makes no mode change when the target is already reached.
 * While charging, re-sends the charge mode every keep-alive interval and
 * re-reads the state each cycle. Once the target is reached, sets normal mode and returns
 * "target-reached". Once the maximum duration has elapsed since the charge started
 * without reaching the target, sets normal mode and returns "max-duration-reached".
 */
export async function runScheduledCharge(
  settings: { targetSoc: number; maxDurationMinutes: number },
  client: EvccClient,
  opts: KeepAliveOptions = {},
): Promise<ChargeResult> {
  const intervalMs = opts.intervalMs ?? KEEP_ALIVE_INTERVAL_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const maxDurationMs = settings.maxDurationMinutes * 60_000;

  const state = await client.getState();
  if (state.batterySoc >= settings.targetSoc) {
    return { outcome: "no-charge-needed" };
  }
  const chargeStart = now();
  await client.setChargeMode();
  for (;;) {
    await sleep(intervalMs);
    const current = await client.getState();
    if (current.batterySoc >= settings.targetSoc) {
      await client.setNormalMode();
      return { outcome: "target-reached" };
    }
    if (now() - chargeStart >= maxDurationMs) {
      await client.setNormalMode();
      return { outcome: "max-duration-reached" };
    }
    await client.setChargeMode();
  }
}
