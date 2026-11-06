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
