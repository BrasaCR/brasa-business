import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import worker from '../src/index.js';

const html = await readFile(new URL('../public/operator-marketplace.html', import.meta.url), 'utf8');
const script = await readFile(new URL('../public/operator-marketplace.js', import.meta.url), 'utf8');

test('operator console requires every first-provider approval and has accessible states', () => {
  for (const approval of ['authority','provenance','expiry','consentLegalBasis','responsibleReviewer']) assert.match(html, new RegExp(`name="${approval}" required`));
  assert.match(html, /role="status"/); assert.match(html, /aria-live="polite"/); assert.match(html, /Nothing becomes public until a separate verification decision/);
});

test('operator credential stays in memory and remote content is rendered as text', () => {
  assert.doesNotMatch(script, /localStorage|sessionStorage|document\.cookie|innerHTML|insertAdjacentHTML/); assert.match(script, /credentials:'omit'/); assert.match(script, /textContent/); assert.match(script, /session\/exchange/); assert.match(script, /session\/logout/);
});

test('console document receives no-store and restrictive browser policy', async () => {
  const response = await worker.fetch(new Request('https://brasa.business/operator/marketplace'), { ASSETS: { fetch: async () => new Response(html, { headers: { 'content-type': 'text/html' } }) } });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store'); assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/); assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
});

test('session exchange forwards the Cloudflare Access assertion only to Identity', async () => {
  let forwarded;
  const response = await worker.fetch(new Request('https://brasa.business/api/operator/v1/session/exchange', { method: 'POST', headers: { 'cf-access-jwt-assertion': 'signed.access.assertion' }, body: '{}' }), { PROVIDERS_DB: {}, IDENTITY: { fetch: async request => { forwarded = request.headers.get('cf-access-jwt-assertion'); return new Response('{}', { status: 401 }); } } });
  assert.equal(response.status, 401);
  assert.equal(forwarded, 'signed.access.assertion');
});
