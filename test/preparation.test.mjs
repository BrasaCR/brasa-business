import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';

const service = {
  id: 'patente-comercial-municipal',
  label: 'Patente Comercial Municipal',
  category: 'business',
  countryCode: 'CR',
  sourceUrl: 'https://example.go.cr/patente',
  sourceStatus: 'unreviewed-existing-index',
  informationalOnly: true,
  internalNotes: 'must not cross the service boundary'
};

test('maps a business pathway to bounded government wayfinding', async () => {
  let requested;
  const env = { GOVERNMENT: { fetch: async request => {
    requested = new URL(request.url);
    return Response.json({ data: [service] });
  } } };
  const response = await worker.fetch(new Request('https://brasa.business/api/v1/experiences/retail/preparation?countryCode=cr'), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /^public/);
  assert.equal(requested.searchParams.get('q'), 'patente comercial');
  assert.equal(requested.searchParams.get('countryCode'), 'CR');
  assert.equal(requested.searchParams.get('limit'), '6');
  assert.deepEqual(body.data[0], {
    schemaVersion: 1,
    id: service.id,
    label: service.label,
    category: service.category,
    countryCode: 'CR',
    sourceUrl: service.sourceUrl,
    sourceStatus: 'unreviewed-existing-index',
    informationalOnly: true
  });
  assert.equal(body.meta.legalAdvice, false);
  assert.equal(body.meta.eligibilityDecision, false);
  for (const field of ['internalNotes', 'accountId', 'identityId', 'application']) assert.doesNotMatch(JSON.stringify(body), new RegExp(`"${field}"\\s*:`));
});

test('returns explicit empty coverage outside the government catalog boundary', async () => {
  let called = false;
  const env = { GOVERNMENT: { fetch: async () => { called = true; return Response.json({ data: [] }); } } };
  const response = await worker.fetch(new Request('https://brasa.business/api/v1/experiences/retail/preparation?countryCode=MX'), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(called, false);
  assert.deepEqual(body.data, []);
  assert.equal(body.meta.coverageAvailable, false);
  assert.equal(body.meta.informationalOnly, true);
});

test('preparation endpoint is read-only', async () => {
  const response = await worker.fetch(new Request('https://brasa.business/api/v1/experiences/retail/preparation', { method: 'POST' }), {});
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});
