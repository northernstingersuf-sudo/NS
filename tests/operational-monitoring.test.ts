import { test } from "node:test";
import assert from "node:assert/strict";
import { operationalSignals } from "../lib/operational-monitoring";

const now = Date.parse("2026-11-22T12:00:00Z");
const good = {
  now, lastExpiryRun: new Date(now - 5 * 60_000).toISOString(),
  eligibleExpiredOrders: 0, reportedPayments: 0, failedEmails: 0,
  failedDiscord: 0, lowStockProducts: 0,
};
test("healthy job and zero failures are all green", () => {
  assert.ok(operationalSignals(good).every(s => s.status === "ok"));
});
test("missing, stalled and future-dated cron heartbeats are critical", () => {
  for (const lastExpiryRun of [null, new Date(now - 20 * 60_000).toISOString(), new Date(now + 5 * 60_000).toISOString()])
    assert.equal(operationalSignals({ ...good, lastExpiryRun })[0].status, "critical");
});
test("backlog and failed delivery attempts are visible alerts", () => {
  const statuses = operationalSignals({
    ...good, eligibleExpiredOrders: 3, reportedPayments: 1, failedEmails: 2, failedDiscord: 4, lowStockProducts: 1,
  });
  assert.deepEqual(statuses.slice(1).map(s => s.status), Array(5).fill("warning"));
});
test("unavailable database metrics are never represented as zero", () => {
  const signals = operationalSignals({ ...good, eligibleExpiredOrders: null, failedEmails: null });
  assert.equal(signals[1].value, "—");
  assert.equal(signals[1].status, "critical");
  assert.equal(signals[3].status, "critical");
});
