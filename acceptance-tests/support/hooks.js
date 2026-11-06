'use strict';

// Suite lifecycle: boots the fake evcc server before the suite and shuts it
// down after. The application under test (src/main.ts) is a one-shot job;
// step definitions run it per scenario through the `app` helper, so this
// hook only owns the long-lived fixtures.

const { BeforeAll, AfterAll, Before } = require('@cucumber/cucumber');
const { FakeEvcc } = require('./fake-evcc.js');

let evcc = null;

BeforeAll(async function () {
  evcc = new FakeEvcc();
  await evcc.start();
});

AfterAll(async function () {
  if (evcc) await evcc.stop();
  evcc = null;
});

Before(function () {
  this.evcc = evcc;
  evcc.reset();
});
