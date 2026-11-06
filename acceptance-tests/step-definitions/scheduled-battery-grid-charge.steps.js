'use strict';

const assert = require('node:assert/strict');
const { Given, When, Then } = require('@cucumber/cucumber');
const { runApp } = require('../support/app.js');

Given('the configured target state of charge is {int} percent', function (percent) {
  this.targetSoc = percent;
});

Given('the battery state of charge is {int} percent', function (percent) {
  this.evcc.setBatterySoc(percent);
});

When('the scheduled run starts', async function () {
  this.run = await runApp(this.evcc.url, { targetSoc: this.targetSoc });
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
