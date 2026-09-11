import assert from 'node:assert/strict';
import test from 'node:test';
import { enforceAuditRetention } from '../src/audit-retention.js';

function database(retentionDays, changes = [2, 3, 4]) {
  const statements = [], batches = [];
  return {
    statements, batches,
    prepare(sql) {
      const statement = { sql, values: [], bind(...values) { this.values = values; return this; }, first: async () => ({ retentionDays }) };
      statements.push(statement); return statement;
    },
    async batch(input) { batches.push(input); return changes.map(value => ({ meta: { changes: value } })); }
  };
}

test('does nothing when no retention policy is approved', async () => {
  const db = database(null), result = await enforceAuditRetention({ PROVIDERS_DB: db }, Date.parse('2026-09-11T00:00:00Z'));
  assert.deepEqual(result, { status: 'skipped', reason: 'retention_policy_unset', deleted: 0 });
  assert.equal(db.batches.length, 0);
});

test('deletes only audit events older than the approved cutoff', async () => {
  const db = database(365), result = await enforceAuditRetention({ PROVIDERS_DB: db }, Date.parse('2026-09-11T00:00:00Z'));
  assert.equal(result.status, 'applied'); assert.equal(result.cutoff, '2025-09-11T00:00:00.000Z'); assert.equal(result.deleted, 9);
  assert.equal(db.batches[0].length, 3);
  for (const statement of db.batches[0]) { assert.match(statement.sql, /^DELETE FROM .*_audit_events WHERE created_at < \?$/); assert.deepEqual(statement.values, [result.cutoff]); }
});

test('fails closed for an invalid retention policy', async () => {
  const db = database(30);
  await assert.rejects(() => enforceAuditRetention({ PROVIDERS_DB: db }), /invalid_audit_retention_policy/);
  assert.equal(db.batches.length, 0);
});
