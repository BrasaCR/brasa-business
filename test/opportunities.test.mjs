import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';
import { OPPORTUNITIES, queryOpportunities } from '../src/opportunities.js';
test('publishes business pathways without personal or learner fields', () => {
  const result = queryOpportunities(new URLSearchParams('capability=safety&countryCode=CR'));
  assert.ok(result.data.length > 0);
  assert.ok(result.data.every((item) => item.capabilities.includes('safety')));
  const serialized = JSON.stringify(OPPORTUNITIES);
  for (const field of ['govId','studentId','progress','credential','schoolId']) assert.equal(serialized.includes(field), false);
});
test('validates filters and caps result size', () => {
  assert.equal(queryOpportunities(new URLSearchParams('countryCode=GLOBAL')).error, 'invalid_country_code');
  assert.equal(queryOpportunities(new URLSearchParams('capability=../../secret')).error, 'invalid_capability');
  assert.equal(queryOpportunities(new URLSearchParams('limit=500')).meta.limit, 50);
});
test('serves API routes and delegates static pages to assets', async () => {
  let delegated = false;
  const env = { ASSETS: { fetch: async () => { delegated = true; return new Response('page'); } } };
  const api = await worker.fetch(new Request('https://brasa.business/api/v1/opportunities?capability=safety'), env);
  assert.equal(api.status, 200); assert.equal(api.headers.get('cache-control').startsWith('public'), true);
  await worker.fetch(new Request('https://brasa.business/marketplace.html'), env); assert.equal(delegated, true);
});
