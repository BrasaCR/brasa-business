import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const baseUrl = String(process.env.STAGING_BASE_URL || '').replace(/\/$/, ''), key = process.env.MARKETPLACE_OPERATOR_KEY || '';
if (!/^https:\/\//.test(baseUrl) || key.length < 32) throw new Error('staging URL and operator key are required');
const id = `smoke-${randomUUID()}`, headers = { authorization: `Bearer ${key}`, 'content-type': 'application/json' };
const request = async (path, options = {}, expected = 200) => { for (let attempt = 0; attempt < 6; attempt += 1) { const response = await fetch(`${baseUrl}${path}`, { ...options, headers: { ...headers, ...(options.headers || {}) }, signal: AbortSignal.timeout(10000) }); const text = await response.text(); let body; try { body = JSON.parse(text); } catch { throw new Error(`${path} returned non-JSON (${response.status})`); } if (response.status === expected) return body; if (response.status !== 401 || attempt === 5) throw new Error(`${path} failed (${response.status})`); await new Promise((resolve) => setTimeout(resolve, 1500)); } };
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));
const execute = (sql) => execFileSync(process.execPath, [wrangler,'d1','execute','brasa-business-marketplace-staging','--remote','--env','staging','--command',sql], { stdio: 'ignore' });
try {
  await request('/api/operator/v1/providers', { method: 'POST', body: JSON.stringify({ id, name: 'Automated staging fixture', category: 'retail', description: 'Temporary verification workflow fixture.', capabilities: ['sales'], countryCode: 'CR', websiteUrl: 'https://example.invalid/provider', provenanceUrl: 'https://example.invalid/source', sourceLabel: 'Automated fixture', reason: 'Exercise staging workflow' }) }, 201);
  const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
  await request(`/api/operator/v1/providers/${id}/actions`, { method: 'POST', body: JSON.stringify({ action: 'verify', reason: 'Automated source verification', expiresAt }) });
  const publicList = await request(`/api/v1/providers?countryCode=CR&limit=50`, { headers: { accept: 'application/json' } }); if (!publicList.data.some((item) => item.id === id)) throw new Error('verified fixture was not public');
  await request(`/api/v1/providers/${id}/reports`, { method: 'POST', body: JSON.stringify({ category: 'inaccurate' }) }, 202);
  const reports = await request('/api/operator/v1/reports?status=open'); const report = reports.data.find((item) => item.providerId === id); if (!report) throw new Error('report was not queued');
  await request(`/api/operator/v1/reports/${report.id}/resolve`, { method: 'POST', body: JSON.stringify({ resolution: 'reviewed', reason: 'Automated workflow review' }) });
  await request(`/api/operator/v1/providers/${id}/actions`, { method: 'POST', body: JSON.stringify({ action: 'suspend', reason: 'End automated verification' }) });
  const hidden = await request(`/api/v1/providers?countryCode=CR&limit=50`, { headers: { accept: 'application/json' } }); if (hidden.data.some((item) => item.id === id)) throw new Error('suspended fixture remained public');
  console.log(JSON.stringify({ workflow: 'provider-governance', status: 'passed' }));
} finally {
  execute(`DELETE FROM provider_reports WHERE provider_id='${id}'; DELETE FROM provider_audit_events WHERE provider_id='${id}'; DELETE FROM provider_records WHERE id='${id}'`);
}
