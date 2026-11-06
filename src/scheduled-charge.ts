import type { EvccClient } from "./evcc-client.ts";
import type { StateMarker } from "./state-marker.ts";

/** evcc resets external battery mode after 60 s; refresh at half that to keep a margin. */
export const KEEP_ALIVE_INTERVAL_MS = 30_000;

export interface KeepAliveOptions {
  intervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Current time in epoch milliseconds. Defaults to the system clock. */
  now?: () => number;
  /** Aborting ends the run: the sleep wakes early and normal mode is set. */
  signal?: AbortSignal;
  /** Records ownership of a started charge. Omitted means no ownership record. */
  marker?: StateMarker;
}

export type ChargeOutcome =
  | "no-charge-needed"
  | "target-reached"
  | "window-ended"
  | "max-duration-reached"
  "no-progress"
  | "state-read-failed"
  | "terminated";

export interface ChargeResult {
  outcome: ChargeOutcome;
  /** Set when normal mode could not be restored after a state read failure. */
  normalModeError?: string;
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

/** Resolves after `ms`, or as soon as `signal` aborts. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

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
 * returns "no-progress". Once `signal` aborts, sets normal mode and returns "terminated". If the state of charge cannot be read while charging, attempts normal mode (a failure there is reported via `normalModeError`, and the marker is kept) and returns "state-read-failed". Checks run in this order: target, no-progress, window end, max duration.
 */
export async function runScheduledCharge(
  settings: { targetSoc: number; maxDurationMinutes: number; noProgressTimeoutMinutes: number },
  client: EvccClient,
  opts: KeepAliveOptions = {},
): Promise<ChargeResult> {
  const intervalMs = opts.intervalMs ?? KEEP_ALIVE_INTERVAL_MS;
  const signal = opts.signal;
  const sleep = opts.sleep ?? ((ms: number) => abortableSleep(ms, signal));
  const now = opts.now ?? Date.now;
  const maxDurationMs = settings.maxDurationMinutes * 60_000;
  const noProgressMs = settings.noProgressTimeoutMinutes * 60_000;

  const marker = opts.marker;
  const restoreNormal = async () => {
    await client.setNormalMode();
    await marker?.clear();
  };

  const state = await client.getState();
  if (state.batteryMode === "charge" && marker && (await marker.read())) {
    await restoreNormal();
  }
  if (state.batterySoc >= settings.targetSoc) {
    return { outcome: "no-charge-needed" };
  }
  const chargeStart = now();
  const windowEnd = nextWindowEnd(chargeStart);
  let lastSoc = state.batterySoc;
  let lastRiseAt = chargeStart;
  await marker?.write(new Date(chargeStart).toISOString());
  await client.setChargeMode();
  for (;;) {
    await sleep(intervalMs);
    if (signal?.aborted) {
      await restoreNormal();
      return { outcome: "terminated" };
    }
    let current;
    try {
      current = await client.getState();
    } catch {
      try {
        await restoreNormal();
        return { outcome: "state-read-failed" };
      } catch (err) {
        return { outcome: "state-read-failed", normalModeError: (err as Error).message };
      }
    }
    if (current.batterySoc > lastSoc) {
      lastSoc = current.batterySoc;
      lastRiseAt = now();
    }
    if (current.batterySoc >= settings.targetSoc) {
      await restoreNormal();
      return { outcome: "target-reached" };
    }
    if (now() - lastRiseAt > noProgressMs) {
      await restoreNormal();
      return { outcome: "no-progress" };
    }
    if (now() >= windowEnd) {
      await restoreNormal();
      return { outcome: "window-ended" };
    }
    if (now() - chargeStart >= maxDurationMs) {
      await restoreNormal();
      return { outcome: "max-duration-reached" };
    }
    await client.setChargeMode();
  }
}
