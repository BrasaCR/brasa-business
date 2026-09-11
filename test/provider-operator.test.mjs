import assert from 'node:assert/strict';
import test from 'node:test';
import { authorizeOperator, createOperatorProvider, actOnProvider, resolveOperatorReport } from '../src/provider-operator.js';

function database({ provider = { id: 'provider-1', status: 'pending' }, report = { providerId: 'provider-1' } } = {}) {
  const batches = [];
  return { batches, prepare(sql) { return { bind(...values) { return { sql, values, first: async () => sql.includes('provider_reports') ? report : provider, all: async () => ({ results: [] }), run: async () => ({ success: true }) }; } }; }, async batch(statements) { batches.push(statements); return statements.map(() => ({ success: true })); } };
}
const env = (db = database()) => ({ PROVIDERS_DB: db, MARKETPLACE_OPERATOR_KEY: 'correct-secret-value' });

test('operator authorization fails closed without exposing the secret', async () => {
  const missing = await authorizeOperator(new Request('https://brasa.business/api/operator/v1/providers'), env()); assert.equal(missing.status, 401);
  const wrong = await authorizeOperator(new Request('https://brasa.business/api/operator/v1/providers', { headers: { authorization: 'Bearer wrong-secret-value' } }), env()); assert.equal(wrong.status, 401); assert.equal(JSON.stringify(await wrong.json()).includes('correct-secret-value'), false);
  assert.equal(await authorizeOperator(new Request('https://brasa.business/api/operator/v1/providers', { headers: { authorization: 'Bearer correct-secret-value' } }), env()), null);
});

test('creates only pending provider records with provenance and audit evidence', async () => {
  const db = database(), response = await createOperatorProvider(new Request('https://brasa.business/api/operator/v1/providers', { method: 'POST', body: JSON.stringify({ id: 'provider-1', name: 'Example provider', category: 'retail', description: 'An operator-reviewed staging record.', capabilities: ['sales'], countryCode: 'CR', websiteUrl: 'https://example.invalid/provider', provenanceUrl: 'https://example.invalid/source', sourceLabel: 'Public source', reason: 'Initial source review' }) }), env(db));
  assert.equal(response.status, 201); assert.equal((await response.json()).data.status, 'pending'); assert.equal(db.batches.length, 1); assert.match(db.batches[0][0].sql, /'pending'/); assert.match(db.batches[0][1].sql, /provider_audit_events/);
});

test('verification requires a bounded future expiry and renewal requires verified state', async () => {
  const invalid = await actOnProvider(new Request('https://brasa.business/action', { method: 'POST', body: JSON.stringify({ action: 'verify', reason: 'Source checked', expiresAt: '2020-01-01' }) }), env(), 'provider-1'); assert.equal(invalid.status, 400);
  const expiresAt = new Date(Date.now() + 30 * 86400000).toISOString(), db = database();
  const verified = await actOnProvider(new Request('https://brasa.business/action', { method: 'POST', body: JSON.stringify({ action: 'verify', reason: 'Source checked', expiresAt }) }), env(db), 'provider-1'); assert.equal(verified.status, 200); assert.equal((await verified.json()).data.status, 'verified'); assert.equal(db.batches.length, 1);
  const renewal = await actOnProvider(new Request('https://brasa.business/action', { method: 'POST', body: JSON.stringify({ action: 'renew', reason: 'Source checked again', expiresAt }) }), env(database(),), 'provider-1'); assert.equal(renewal.status, 409);
});

test('report resolution records an audit event without narrative reporter data', async () => {
  const db = database(), response = await resolveOperatorReport(new Request('https://brasa.business/report', { method: 'POST', body: JSON.stringify({ resolution: 'reviewed', reason: 'Source confirms correction is needed' }) }), env(db), 'report-1');
  assert.equal(response.status, 200); assert.equal(db.batches.length, 1); assert.equal(db.batches[0].some((statement) => JSON.stringify(statement.values).includes('email')), false);
});

test('suspension uses the persisted suspended state', async () => {
  const db = database({ provider: { id: 'provider-1', status: 'verified' } }), response = await actOnProvider(new Request('https://brasa.business/action', { method: 'POST', body: JSON.stringify({ action: 'suspend', reason: 'Safety review required' }) }), env(db), 'provider-1');
  assert.equal(response.status, 200); assert.equal((await response.json()).data.status, 'suspended'); assert.equal(db.batches[0][0].values[0], 'suspended');
});
