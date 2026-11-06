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
