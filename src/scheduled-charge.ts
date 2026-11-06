import type { EvccClient } from "./evcc-client.ts";

/** evcc resets external battery mode after 60 s; refresh at half that to keep a margin. */
export const KEEP_ALIVE_INTERVAL_MS = 30_000;

export interface KeepAliveOptions {
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Current time in epoch milliseconds. Defaults to the system clock. */
  now?: () => number;
}

export type ChargeOutcome =
  | "no-charge-needed"
  | "target-reached"
  | "window-ended"
  | "max-duration-reached"
  | "no-progress";

export interface ChargeResult {
  outcome: ChargeOutcome;
}

/**
 * Next 06:00 in process local time strictly after `fromMs`: the end of the tariff
 * window that a charge starting at `fromMs` falls into.
 */
function nextWindowEnd(fromMs: number): number {
  const end = new Date(fromMs);
  end.setHours(6, 0, 0, 0);
  if (end.getTime() <= fromMs) end.setDate(end.getDate() + 1);
  return end.getTime();
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Starts a grid charge when the battery is below the target state of charge.
 * Makes no mode change when the target is already reached.
 * While charging, re-sends the charge mode every keep-alive interval and
 * re-reads the state each cycle. Once the target is reached, sets normal mode and returns
 * "target-reached". Once local time reaches 06:00 without the target being reached, sets
 * normal mode and returns "window-ended". Once the maximum duration has elapsed since the
 * charge started without reaching the target, sets normal mode and returns
 * "max-duration-reached". Each cycle that raises the state of charge restarts the no-progress
 * timer; once the time since the last rise exceeds the no-progress timeout, sets normal mode and
 * returns "no-progress". Checks run in this order: target, no-progress, window end, max duration.
 */
export async function runScheduledCharge(
  settings: { targetSoc: number; maxDurationMinutes: number; noProgressTimeoutMinutes: number },
  client: EvccClient,
  opts: KeepAliveOptions = {},
): Promise<ChargeResult> {
  const intervalMs = opts.intervalMs ?? KEEP_ALIVE_INTERVAL_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const maxDurationMs = settings.maxDurationMinutes * 60_000;
  const noProgressMs = settings.noProgressTimeoutMinutes * 60_000;

  const state = await client.getState();
  if (state.batterySoc >= settings.targetSoc) {
    return { outcome: "no-charge-needed" };
  }
  const chargeStart = now();
  const windowEnd = nextWindowEnd(chargeStart);
  let lastSoc = state.batterySoc;
  let lastRiseAt = chargeStart;
  await client.setChargeMode();
  for (;;) {
    await sleep(intervalMs);
    const current = await client.getState();
    if (current.batterySoc > lastSoc) {
      lastSoc = current.batterySoc;
      lastRiseAt = now();
    }
    if (current.batterySoc >= settings.targetSoc) {
      await client.setNormalMode();
      return { outcome: "target-reached" };
    }
    if (now() - lastRiseAt > noProgressMs) {
      await client.setNormalMode();
      return { outcome: "no-progress" };
    }
    if (now() >= windowEnd) {
      await client.setNormalMode();
      return { outcome: "window-ended" };
    }
    if (now() - chargeStart >= maxDurationMs) {
      await client.setNormalMode();
      return { outcome: "max-duration-reached" };
    }
    await client.setChargeMode();
  }
}
