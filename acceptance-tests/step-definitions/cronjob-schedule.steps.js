'use strict';

const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { Given, When, Then } = require('@cucumber/cucumber');
const YAML = require('yaml');

const CRONJOB_MANIFEST = path.resolve(__dirname, '../../deploy/k8s/cronjob.yaml');

const MONTHS = { January: 1, February: 2, March: 3, November: 11, December: 12 };

// Parses one cron field (minute, hour, month) into the set of matching values.
// Supports '*', numbers, comma lists, ranges (a-b) and steps (*/n, a-b/n).
function parseCronField(field, min, max) {
  const values = new Set();
  for (const part of field.split(',')) {
    const [range, stepText] = part.split('/');
    const step = stepText === undefined ? 1 : Number(stepText);
    assert.ok(Number.isInteger(step) && step > 0, `invalid cron step in "${part}"`);
    let from;
    let to;
    if (range === '*') {
      from = min;
      to = max;
    } else if (range.includes('-')) {
      [from, to] = range.split('-').map(Number);
    } else {
      from = Number(range);
      to = stepText === undefined ? from : max;
    }
    assert.ok(Number.isInteger(from) && Number.isInteger(to), `invalid cron field "${part}"`);
    assert.ok(from >= min && to <= max && from <= to, `cron value out of range in "${part}"`);
    for (let v = from; v <= to; v += step) values.add(v);
  }
  return values;
}

// Parses the 5-field schedule of the CronJob manifest. Day-of-month and
// day-of-week must be '*' because these steps only model month, hour and minute.
function parseSchedule(schedule) {
  const [minute, hour, dom, month, dow] = schedule.trim().split(/\s+/);
  assert.ok(dom === '*' && dow === '*', `unsupported day constraint in schedule "${schedule}"`);
  return {
    minutes: parseCronField(minute, 0, 59),
    hours: parseCronField(hour, 0, 23),
    months: parseCronField(month, 1, 12),
  };
}

function loadSchedule() {
  const manifest = YAML.parse(readFileSync(CRONJOB_MANIFEST, 'utf8'));
  return parseSchedule(manifest.spec.schedule);
}

Given(/^the current date is in (January|March|February|November|December)$/, function (monthName) {
  this.currentMonth = MONTHS[monthName];
});

Given(/^the CronJob start time is (\d{2}):(\d{2})$/, function (hh, mm) {
  this.startHour = Number(hh);
  this.startMinute = Number(mm);
});

// Without a Given start time, the manifest's own hour/minute are used as the scheduled time.
function evaluateSchedule(world) {
  const schedule = loadSchedule();
  const hour = world.startHour ?? [...schedule.hours][0];
  const minute = world.startMinute ?? [...schedule.minutes][0];
  world.started =
    schedule.months.has(world.currentMonth) &&
    schedule.hours.has(hour) &&
    schedule.minutes.has(minute);
}

When('the CronJob schedule is evaluated', function () {
  evaluateSchedule(this);
});

When('the scheduled time is reached', function () {
  evaluateSchedule(this);
});

Then('no job is started', function () {
  assert.equal(this.started, false, 'expected the CronJob schedule not to fire');
});

Then('a job is started', function () {
  assert.equal(this.started, true, 'expected the CronJob schedule to fire');
});
