const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadTs } = require('./load-ts.cjs');
const { timelineReportRange } = loadTs('src/services/reports/timelineReportRange.ts');

test('India daily range is independent of host timezone', () => {
  const range = timelineReportRange('daily', '2026-09-01');
  assert.equal(range.from, '2026-08-31T18:30:00.000Z');
  assert.equal(range.to, '2026-09-01T18:30:00.000Z');
});

test('weekly and monthly ranges use local calendar boundaries', () => {
  assert.deepEqual(
    (({from,to})=>({from,to}))(timelineReportRange('weekly', '2026-09-03')),
    { from: '2026-08-30T18:30:00.000Z', to: '2026-09-06T18:30:00.000Z' },
  );
  assert.deepEqual(
    (({from,to})=>({from,to}))(timelineReportRange('monthly', '2026-09-19')),
    { from: '2026-08-31T18:30:00.000Z', to: '2026-09-30T18:30:00.000Z' },
  );
});
