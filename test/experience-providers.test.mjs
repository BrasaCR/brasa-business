import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';
import { listExperienceProviders } from '../src/experience-providers.js';

const row = { id: 'provider-1', name: 'Local supplier', category: 'retail', description: 'Verified local support.', capabilitiesJson: '["inventory"]', countryCode: 'CR', region: 'San José', websiteUrl: 'https://example.org', provenanceUrl: 'https://registry.example/1', sourceLabel: 'Public registry', verifiedAt: '2026-09-01', expiresAt: '2027-09-01' };
function database() {
  const calls = [];
  return { calls, prepare: sql => ({ bind: (...values) => ({ all: async () => { calls.push({ sql, values }); return { results: [row] }; } }) }) };
}

test('matches an experience only to current verified providers by category or capability', async () => {
  const DB = database();
  const response = await listExperienceProviders(new Request('https://brasa.business/api/v1/experiences/retail/providers?countryCode=CR&limit=6'), { PROVIDERS_DB: DB }, 'retail');
  const body = await response.json();
  assert.equal(response.status, 200); assert.equal(body.meta.verifiedOnly, true); assert.equal(body.data[0].verification.status, 'verified');
  assert.match(DB.calls[0].sql, /verification_status = 'verified'/); assert.match(DB.calls[0].sql, /datetime\(expires_at\) > datetime\('now'\)/); assert.match(DB.calls[0].sql, /json_each/);
  assert.deepEqual(DB.calls[0].values.slice(0, 5), ['retail', 'customer-service', 'inventory', 'sales', 'digital-commerce']);
  assert.equal(JSON.stringify(body).includes('verifiedBy'), false);
});

test('rejects unknown experiences and unbounded provider requests', async () => {
  assert.equal((await listExperienceProviders(new Request('https://brasa.business/x'), { PROVIDERS_DB: database() }, 'unknown')).status, 404);
  assert.equal((await listExperienceProviders(new Request('https://brasa.business/x?limit=21'), { PROVIDERS_DB: database() }, 'retail')).status, 400);
  assert.equal((await listExperienceProviders(new Request('https://brasa.business/x?countryCode=USA'), { PROVIDERS_DB: database() }, 'retail')).status, 400);
});

test('serves the provider match as a read-only public route', async () => {
  const env = { PROVIDERS_DB: database() };
  const response = await worker.fetch(new Request('https://brasa.business/api/v1/experiences/retail/providers?countryCode=CR'), env);
  assert.equal(response.status, 200); assert.match(response.headers.get('cache-control'), /^public/);
  const denied = await worker.fetch(new Request('https://brasa.business/api/v1/experiences/retail/providers', { method: 'POST' }), env);
  assert.equal(denied.status, 405);
});
