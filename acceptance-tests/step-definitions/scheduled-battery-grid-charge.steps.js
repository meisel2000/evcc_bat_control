'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { mkdtemp, writeFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { startApp } = require('../support/app.js');

const CHARGE_WINDOW_MS = 90 * 1000;
const CHARGE_WINDOW_TIMEOUT_MS = CHARGE_WINDOW_MS + 30 * 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

Given('the configured target state of charge is {int} percent', function (percent) {
  this.targetSoc = percent;
});

Given('the battery is charging from the grid', function () {
  this.targetSoc = 90;
  this.evcc.setBatterySoc(40);
});

Given('the maximum duration is {int} hours', function (hours) {
  this.maxDurationMinutes = hours * 60;
});

// Virtual clock start for time-based stops (see design: injectable clock).
const TEST_CLOCK_START = '2026-01-10T02:00:00Z';
const MAX_DURATION_EXIT_TIMEOUT_MS = 30 * 1000;

When('the charge has run for {int} hours without reaching the target', { timeout: MAX_DURATION_EXIT_TIMEOUT_MS + 15 * 1000 }, async function (hours) {
  const settings = { targetSoc: this.targetSoc };
  if (this.maxDurationMinutes !== undefined) {
    settings.maxDurationMinutes = this.maxDurationMinutes;
  }
  const { child, result } = await startApp(this.evcc.url, settings, {
    env: { EVCC_TEST_CLOCK: TEST_CLOCK_START },
  });
  const deadline = Date.now() + MAX_DURATION_EXIT_TIMEOUT_MS;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    await sleep(50);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    this.run = await result;
    assert.fail(
      `expected app to stop after ${hours} hours of charging within ` +
        `${MAX_DURATION_EXIT_TIMEOUT_MS / 1000} s, but it kept running ` +
        `(stdout: ${this.run.stdout.trim()}, stderr: ${this.run.stderr.trim()})`,
    );
  }
  this.run = await result;
});

Then('the run exits with an error', function () {
  assert.notEqual(
    this.run.exitCode,
    0,
    `expected app to exit with an error, got exit code ${this.run.exitCode} ` +
      `(stdout: ${this.run.stdout.trim()})`,
  );
});

When('90 seconds have passed', { timeout: CHARGE_WINDOW_TIMEOUT_MS }, async function () {
  const { child, result } = await startApp(this.evcc.url, { targetSoc: this.targetSoc });
  await sleep(CHARGE_WINDOW_MS);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
  }
  this.run = await result;
});

Then('charge mode has been sent at least 3 times during the charge', function () {
  const chargeRequests = this.evcc.requests.filter(
    (r) => r.method === 'POST' && r.path === '/batterymode/charge',
  );
  assert.ok(
    chargeRequests.length >= 3,
    `expected at least 3 POST /batterymode/charge during the charge, got ${chargeRequests.length} ` +
      `(app exit code ${this.run.exitCode}, stderr: ${this.run.stderr.trim()})`,
  );
});

Given('the battery state of charge is {int} percent', function (percent) {
  this.evcc.setBatterySoc(percent);
});

const SCHEDULED_RUN_OBSERVE_MS = 5 * 1000;
const SCHEDULED_RUN_POLL_MS = 50;

// The app keeps re-sending charge mode until stopped. Start it, wait until it
// either exits on its own (e.g. battery already at target) or has sent a
// charge request / the observation window elapses, then SIGTERM it if still
// running and record the result.
When('the scheduled run starts', async function () {
  const { child, result } = await startApp(this.evcc.url, { targetSoc: this.targetSoc });
  const isRunning = () => child.exitCode === null && child.signalCode === null;
  const chargeSent = () =>
    this.evcc.requests.some((r) => r.method === 'POST' && r.path === '/batterymode/charge');
  const deadline = Date.now() + SCHEDULED_RUN_OBSERVE_MS;
  while (isRunning() && !chargeSent() && Date.now() < deadline) {
    await sleep(SCHEDULED_RUN_POLL_MS);
  }
  if (isRunning()) {
    child.kill('SIGTERM');
  }
  this.run = await result;
});

Then('the battery is set to charge mode', function () {
  const chargeRequests = this.evcc.requests.filter(
    (r) => r.method === 'POST' && r.path === '/batterymode/charge',
  );
  assert.ok(
    chargeRequests.length > 0,
    `expected a POST /batterymode/charge to evcc, but none was sent ` +
      `(app exit code ${this.run.exitCode}, stdout: ${this.run.stdout.trim()})`,
  );
});

Then('no battery mode change is sent', function () {
  const modeRequests = this.evcc.requests.filter(
    (r) => r.method === 'POST' && r.path.startsWith('/batterymode/'),
  );
  assert.equal(
    modeRequests.length,
    0,
    `expected no POST /batterymode/* to evcc, but ${modeRequests.length} were sent ` +
      `(${modeRequests.map((r) => r.path).join(', ')})`,
  );
});

Then('the run exits successfully', function () {
  assert.equal(
    this.run.exitCode,
    0,
    `expected app exit code 0, got ${this.run.exitCode} (stderr: ${this.run.stderr.trim()})`,
  );
});

const TARGET_REACHED_EXIT_TIMEOUT_MS = 35 * 1000;

When('the battery state of charge reaches the configured target', { timeout: TARGET_REACHED_EXIT_TIMEOUT_MS + 15 * 1000 }, async function () {
  const { child, result } = await startApp(this.evcc.url, { targetSoc: this.targetSoc });
  const isRunning = () => child.exitCode === null && child.signalCode === null;
  const chargeSent = () =>
    this.evcc.requests.some((r) => r.method === 'POST' && r.path === '/batterymode/charge');
  // Only raise the SoC once the app is charging, so the target is reached mid-charge.
  const chargeDeadline = Date.now() + SCHEDULED_RUN_OBSERVE_MS;
  while (isRunning() && !chargeSent() && Date.now() < chargeDeadline) {
    await sleep(SCHEDULED_RUN_POLL_MS);
  }
  this.evcc.setBatterySoc(this.targetSoc);
  const deadline = Date.now() + TARGET_REACHED_EXIT_TIMEOUT_MS;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    await sleep(50);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    this.run = await result;
    assert.fail(
      `expected app to exit after reaching target SoC ${this.targetSoc}% within ` +
        `${TARGET_REACHED_EXIT_TIMEOUT_MS / 1000} s, but it kept running ` +
        `(stdout: ${this.run.stdout.trim()}, stderr: ${this.run.stderr.trim()})`,
    );
  }
  this.run = await result;
});

const TERMINATION_CHARGE_WAIT_MS = 10 * 1000;
const TERMINATION_EXIT_TIMEOUT_MS = 10 * 1000;

const countNormalRequests = (evcc) =>
  evcc.requests.filter((r) => r.method === 'POST' && r.path === '/batterymode/normal').length;

// Starts the real app (real clock), waits until it is charging, then sends
// SIGTERM and records how many normal-mode POSTs existed before the signal.
When('the job receives a termination signal', { timeout: TERMINATION_CHARGE_WAIT_MS + TERMINATION_EXIT_TIMEOUT_MS + 15 * 1000 }, async function () {
  const { child, result } = await startApp(this.evcc.url, { targetSoc: this.targetSoc });
  const isRunning = () => child.exitCode === null && child.signalCode === null;
  const chargeSent = () =>
    this.evcc.requests.some((r) => r.method === 'POST' && r.path === '/batterymode/charge');
  const chargeDeadline = Date.now() + TERMINATION_CHARGE_WAIT_MS;
  while (isRunning() && !chargeSent() && Date.now() < chargeDeadline) {
    await sleep(50);
  }
  this.normalCountBeforeSignal = countNormalRequests(this.evcc);
  this.signalSent = true;
  if (isRunning()) {
    child.kill('SIGTERM');
  }
  const exitDeadline = Date.now() + TERMINATION_EXIT_TIMEOUT_MS;
  let timer;
  const timedOut = new Promise((resolve) => {
    timer = setTimeout(() => resolve(false), Math.max(0, exitDeadline - Date.now()));
  });
  const exited = await Promise.race([result.then(() => true), timedOut]);
  clearTimeout(timer);
  if (!exited) {
    child.kill('SIGKILL');
  }
  this.run = await result;
  this.terminationExited = exited;
});

Then('the battery is set to normal mode', function () {
  const normalRequests = this.evcc.requests.filter(
    (r) => r.method === 'POST' && r.path === '/batterymode/normal',
  );
  if (this.signalSent) {
    // Termination scenario: the normal-mode POST must be sent after SIGTERM.
    assert.equal(
      this.normalCountBeforeSignal,
      0,
      `expected no POST /batterymode/normal before the termination signal, got ${this.normalCountBeforeSignal}`,
    );
    assert.ok(
      normalRequests.length > this.normalCountBeforeSignal,
      `expected a POST /batterymode/normal after SIGTERM, but none was sent ` +
        `(app exited: ${this.terminationExited}, exit code ${this.run.exitCode}, ` +
        `signal ${this.run.signal ?? 'none'}, stdout: ${this.run.stdout.trim()}, stderr: ${this.run.stderr.trim()})`,
    );
    return;
  }
  assert.ok(
    normalRequests.length > 0,
    `expected a POST /batterymode/normal to evcc, but none was sent ` +
      `(app exit code ${this.run.exitCode}, stdout: ${this.run.stdout.trim()})`,
  );
});

// Tariff window ends at 06:00 local time. The app's process local time is UTC
// (the harness sets TZ=UTC), so the virtual clock starts 30 minutes before it.
const TARIFF_WINDOW_CLOCK_START = '2026-01-10T05:30:00Z';
const TARIFF_WINDOW_EXIT_TIMEOUT_MS = 30 * 1000;

When('the time reaches 06:00', function () {
  this.tariffWindowClockStart = TARIFF_WINDOW_CLOCK_START;
});

When('the target state of charge has not been reached', { timeout: TARIFF_WINDOW_EXIT_TIMEOUT_MS + 15 * 1000 }, async function () {
  const { child, result } = await startApp(
    this.evcc.url,
    { targetSoc: this.targetSoc },
    { env: { EVCC_TEST_CLOCK: this.tariffWindowClockStart, TZ: 'UTC' } },
  );
  const deadline = Date.now() + TARIFF_WINDOW_EXIT_TIMEOUT_MS;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    await sleep(50);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    this.run = await result;
    assert.fail(
      `expected app to stop at the end of the tariff window (06:00) within ` +
        `${TARIFF_WINDOW_EXIT_TIMEOUT_MS / 1000} s, but it kept running ` +
        `(stdout: ${this.run.stdout.trim()}, stderr: ${this.run.stderr.trim()})`,
    );
  }
  this.run = await result;
});

// No-progress timeout (default 30 minutes, see src/config.ts). The fake evcc
// holds the battery SoC flat, so the job never observes a rise.
const NO_PROGRESS_EXIT_TIMEOUT_MS = 30 * 1000;

Given('the configured no-progress timeout has passed without a rise in state of charge', function () {
  // Intent recorded: the flat SoC set by "the battery is charging from the grid"
  // means no rise is ever observed. Ensure it stays flat.
  this.noProgressExpected = true;
  this.evcc.setBatterySoc(40);
});

When('the no-progress timeout is reached', { timeout: NO_PROGRESS_EXIT_TIMEOUT_MS + 15 * 1000 }, async function () {
  const { child, result } = await startApp(
    this.evcc.url,
    { targetSoc: this.targetSoc },
    { env: { EVCC_TEST_CLOCK: TEST_CLOCK_START, TZ: 'UTC' } },
  );
  const deadline = Date.now() + NO_PROGRESS_EXIT_TIMEOUT_MS;
  while (child.exitCode === null && child.signalCode === null && Date.now() < deadline) {
    await sleep(50);
  }
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGTERM');
    this.run = await result;
    assert.fail(
      `expected app to stop on no progress within ${NO_PROGRESS_EXIT_TIMEOUT_MS / 1000} s, ` +
        `but it kept running (stdout: ${this.run.stdout.trim()}, stderr: ${this.run.stderr.trim()})`,
    );
  }
  this.run = await result;
  const output = `${this.run.stdout}\n${this.run.stderr}`;
  assert.match(
    output,
    /no progress/i,
    `expected app output to mention "no progress" (no-progress stop), ` +
      `got stdout: ${this.run.stdout.trim()}, stderr: ${this.run.stderr.trim()}`,
  );
});

// Startup recovery of own charge session (spec: "Stale charge from a previous
// failed run is cleared"). The state marker lives in a per-scenario temp dir.
const statePathFor = async (world) => {
  if (world.statePath === undefined) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'evcc-state-'));
    world.statePath = path.join(dir, 'state.json');
  }
  return world.statePath;
};

Given('the battery mode is charge', function () {
  this.evcc.setBatteryMode('charge');
});

Given('the state marker shows that a previous run of this job started the charge', async function () {
  const statePath = await statePathFor(this);
  await writeFile(
    statePath,
    JSON.stringify({ startedAt: new Date(Date.now() - 60 * 1000).toISOString() }),
  );
});

// Real clock. SoC is set to 92 (above target 90) so the job does not start a
// new charge after recovery; any normal-mode POST is therefore recovery.
const STARTUP_EXIT_TIMEOUT_MS = 30 * 1000;

When('the job starts', { timeout: STARTUP_EXIT_TIMEOUT_MS + 15 * 1000 }, async function () {
  this.evcc.setBatterySoc(92);
  const statePath = await statePathFor(this);
  const { child, result } = await startApp(this.evcc.url, { targetSoc: 90 }, { statePath });
  const isRunning = () => child.exitCode === null && child.signalCode === null;
  const deadline = Date.now() + STARTUP_EXIT_TIMEOUT_MS;
  while (isRunning() && Date.now() < deadline) {
    await sleep(50);
  }
  if (isRunning()) {
    child.kill('SIGTERM');
  }
  this.run = await result;
});

