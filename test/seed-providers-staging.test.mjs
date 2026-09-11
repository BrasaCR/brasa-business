import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanupSql, run, seedSql, STAGING_DATABASE, STAGING_PROVIDERS } from '../scripts/seed-providers-staging.mjs';

test('creates only fixed, clearly labeled, short-lived staging demonstration providers', () => {
  const now = new Date('2026-09-11T12:00:00.000Z'), sql = seedSql(now);
  assert.equal(STAGING_PROVIDERS.length, 4);
  assert.ok(STAGING_PROVIDERS.every(provider => provider.id.startsWith('staging-demo-') && provider.name.startsWith('BRASA Demo ·')));
  assert.match(sql, /example\.invalid/); assert.match(sql, /not a real provider/); assert.match(sql, /2026-09-18T12:00:00\.000Z/);
  assert.equal((sql.match(/Controlled staging demonstration seed/g) || []).length, 4);
  assert.doesNotMatch(sql, /production/i);
});

test('seed runner is pinned to the staging database and remains idempotent', () => {
  const calls = [], execute = (database, command) => calls.push({ database, command });
  const result = run('apply', execute, new Date('2026-09-11T12:00:00.000Z'));
  assert.equal(result.status, 'seeded'); assert.equal(calls[0].database, STAGING_DATABASE);
  assert.equal((calls[0].command.match(/ON CONFLICT\(id\) DO UPDATE/g) || []).length, STAGING_PROVIDERS.length);
  assert.throws(() => run('production', execute), /staging only/);
});

test('cleanup targets the exact fixed records and their dependent data', () => {
  const sql = cleanupSql();
  for (const provider of STAGING_PROVIDERS) assert.match(sql, new RegExp(provider.id));
  assert.match(sql, /provider_reports/); assert.match(sql, /provider_audit_events/); assert.match(sql, /provider_records/);
  assert.doesNotMatch(sql, /LIKE|GLOB|verification_status/);
});
