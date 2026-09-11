import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../src/index.js';
import { businessExperience } from '../src/experiences.js';

test('builds a bounded multilingual experience from an existing pathway', () => {
  const english = businessExperience('retail', 'en').data, spanish = businessExperience('retail', 'es-CR').data;
  assert.equal(english.pathwayUrl, '/Retail.html'); assert.equal(english.steps.length, 4); assert.equal(spanish.locale, 'es'); assert.notEqual(spanish.steps[0].title, english.steps[0].title); assert.match(spanish.disclaimer, /no promete/);
  for (const item of [english, spanish]) { const serialized = JSON.stringify(item); for (const field of ['govId', 'learnerId', 'progress', 'eligibility']) assert.equal(new RegExp(`"${field}"\\s*:`).test(serialized), false); }
});
test('rejects invalid or unknown experiences and locales', () => {
  assert.equal(businessExperience('../private').status, 400); assert.equal(businessExperience('unknown').status, 404); assert.equal(businessExperience('retail', '../../es').status, 400);
});
test('serves read-only experience responses with security and cache headers', async () => {
  const response = await worker.fetch(new Request('https://brasa.business/api/v1/experiences/retail?locale=es'), {}); assert.equal(response.status, 200); assert.equal(response.headers.get('x-content-type-options'), 'nosniff'); assert.match(response.headers.get('cache-control'), /^public/);
  const denied = await worker.fetch(new Request('https://brasa.business/api/v1/experiences/retail', { method: 'POST' }), {}); assert.equal(denied.status, 405);
});
