import type { EvccClient } from "./evcc-client.ts";

/**
 * Starts a grid charge when the battery is below the target state of charge.
 * Makes no mode change when the target is already reached.
 */
export async function runScheduledCharge(
  settings: { targetSoc: number },
  client: EvccClient,
): Promise<void> {
  const state = await client.getState();
  if (state.batterySoc < settings.targetSoc) {
    await client.setChargeMode();
  }
}
