import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateOperator, createOperatorProvider, actOnProvider, resolveOperatorReport } from '../src/provider-operator.js';

function database({ provider = { id: 'provider-1', status: 'pending' }, report = { providerId: 'provider-1' } } = {}) {
  const batches = [];
  return { batches, prepare(sql) { return { bind(...values) { return { sql, values, first: async () => sql.includes('provider_reports') ? report : provider, all: async () => ({ results: [] }), run: async () => ({ success: true }) }; } }; }, async batch(statements) { batches.push(statements); return statements.map(() => ({ success: true })); } };
}
const env = (db = database()) => ({ PROVIDERS_DB: db, IDENTITY:{fetch:async()=>new Response(JSON.stringify({display_id:'BRA-OPERATOR-1001'}),{status:200})} });

test('operator authorization requires Identity plus an active named member', async () => {
  const missing = await authenticateOperator(new Request('https://brasa.business/api/operator/v1/providers'), env()); assert.equal(missing.response.status, 401);
  const DB=database();DB.prepare=()=>({bind:()=>({first:async()=>({displayId:'BRA-OPERATOR-1001',name:'Staging reviewer',role:'reviewer'})})});const access=await authenticateOperator(new Request('https://brasa.business/api/operator/v1/providers',{headers:{authorization:'Bearer '+ 'a'.repeat(64)}}),env(DB));assert.equal(access.operator.role,'reviewer');assert.equal(access.operator.name,'Staging reviewer');
});

test('creates only pending provider records with provenance and audit evidence', async () => {
  const db = database(), response = await createOperatorProvider(new Request('https://brasa.business/api/operator/v1/providers', { method: 'POST', body: JSON.stringify({ id: 'provider-1', name: 'Example provider', category: 'retail', description: 'An operator-reviewed staging record.', capabilities: ['sales'], countryCode: 'CR', websiteUrl: 'https://example.invalid/provider', provenanceUrl: 'https://example.invalid/source', sourceLabel: 'Public source', reason: 'Initial source review', approvals: { authority: true, provenance: true, expiry: true, consentLegalBasis: true, responsibleReviewer: true } }) }), env(db));
  assert.equal(response.status, 201); assert.equal((await response.json()).data.status, 'pending'); assert.equal(db.batches.length, 1); assert.match(db.batches[0][0].sql, /'pending'/); assert.match(db.batches[0][1].sql, /provider_audit_events/);
});

test('rejects drafts without every first-provider approval', async () => {
  const response = await createOperatorProvider(new Request('https://brasa.business/api/operator/v1/providers', { method: 'POST', body: JSON.stringify({ id: 'provider-1', approvals: { authority: true } }) }), env()); assert.equal(response.status, 400);
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
