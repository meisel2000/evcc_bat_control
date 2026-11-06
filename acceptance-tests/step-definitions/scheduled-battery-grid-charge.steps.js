'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
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

Then('the battery is set to normal mode', function () {
  const normalRequests = this.evcc.requests.filter(
    (r) => r.method === 'POST' && r.path === '/batterymode/normal',
  );
  assert.ok(
    normalRequests.length > 0,
    `expected a POST /batterymode/normal to evcc, but none was sent ` +
      `(app exit code ${this.run.exitCode}, stdout: ${this.run.stdout.trim()})`,
  );
});
