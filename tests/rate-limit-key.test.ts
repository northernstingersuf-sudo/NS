import { test } from "node:test";
import assert from "node:assert/strict";
import { rateLimitBucketKey, rateLimitWindowSeconds } from "../lib/rate-limit-key";
const secret = "very-long-internal-test-secret-not-for-production";

test("same request key produces a stable HMAC across server instances", () => {
  assert.equal(rateLimitBucketKey("order:192.0.2.1", secret), rateLimitBucketKey("order:192.0.2.1", secret));
});
test("different request keys and secrets produce separate buckets", () => {
  assert.notEqual(rateLimitBucketKey("order:192.0.2.1", secret), rateLimitBucketKey("report:192.0.2.1", secret));
  assert.notEqual(rateLimitBucketKey("newsletter:foo@example.org", secret), rateLimitBucketKey("newsletter:foo@example.org", secret + "!"));
});
test("never store the raw IP address, email or order token", () => {
  const hash = rateLimitBucketKey("newsletter:foo@example.org", secret);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.ok(!hash.includes("foo@example.org"));
  assert.ok(!hash.includes("newsletter"));
});
test("rejects empty/bad keys and weak or missing secrets", () => {
  assert.throws(() => rateLimitBucketKey("", secret));
  assert.throws(() => rateLimitBucketKey("x".repeat(513), secret));
  assert.throws(() => rateLimitBucketKey("email", "short"));
});
test("rounds windows upward and rejects impossible settings", () => {
  assert.equal(rateLimitWindowSeconds(1), 1);
  assert.equal(rateLimitWindowSeconds(60_001), 61);
  assert.equal(rateLimitWindowSeconds(600_000), 600);
  for (const v of [0, -1, 86_400_001, NaN, Infinity, 1.1])
    assert.throws(() => rateLimitWindowSeconds(v));
});
