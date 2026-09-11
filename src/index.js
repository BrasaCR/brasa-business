import { queryOpportunities } from './opportunities.js';
import { businessExperience } from './experiences.js';
import { listProviders, reportProvider } from './providers.js';
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });
const apiResponse = (value, status = 200, extra = {}) => json(value, status, { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'brasa-business', version: 1 });
    if (url.pathname === '/api/v1/opportunities') {
      if (!['GET','HEAD'].includes(request.method)) return apiResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD' });
      const result = queryOpportunities(url.searchParams);
      if (result.error) return apiResponse({ error: result.error }, 400, { 'cache-control': 'no-store' });
      const response = apiResponse(result, 200, { 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' });
      return request.method === 'HEAD' ? new Response(null, response) : response;
    }
    if (url.pathname.startsWith('/api/v1/experiences/')) {
      if (!['GET','HEAD'].includes(request.method)) return apiResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD' });
      let id; try { id = decodeURIComponent(url.pathname.slice('/api/v1/experiences/'.length)); } catch { return apiResponse({ error: 'invalid_experience_id' }, 400, { 'cache-control': 'no-store' }); }
      const result = businessExperience(id, url.searchParams.get('locale') || 'en');
      if (result.error) return apiResponse({ error: result.error }, result.status, { 'cache-control': 'no-store' });
      const response = apiResponse(result, 200, { 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' });
      return request.method === 'HEAD' ? new Response(null, response) : response;
    }
    if (url.pathname === '/api/v1/providers') {
      if (!['GET','HEAD'].includes(request.method)) return apiResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD' });
      try { const response = await listProviders(request, env); return request.method === 'HEAD' ? new Response(null, response) : response; } catch (error) { console.error(JSON.stringify({ event: 'provider_registry_error', message: error instanceof Error ? error.message : 'unknown' })); return apiResponse({ error: 'provider_registry_unavailable' }, 503, { 'cache-control': 'no-store' }); }
    }
    const reportMatch = url.pathname.match(/^\/api\/v1\/providers\/([^/]+)\/reports$/);
    if (reportMatch) {
      if (request.method !== 'POST') return apiResponse({ error: 'method_not_allowed' }, 405, { allow: 'POST' });
      let providerId; try { providerId = decodeURIComponent(reportMatch[1]); } catch { return apiResponse({ error: 'invalid_provider_id' }, 400, { 'cache-control': 'no-store' }); }
      try { return await reportProvider(request, env, providerId); } catch (error) { console.error(JSON.stringify({ event: 'provider_report_error', message: error instanceof Error ? error.message : 'unknown' })); return apiResponse({ error: 'provider_report_unavailable' }, 503, { 'cache-control': 'no-store' }); }
    }
    return env.ASSETS.fetch(request);
  }
};
