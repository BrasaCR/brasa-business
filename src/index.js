import { queryOpportunities } from './opportunities.js';
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'brasa-business', version: 1 });
    if (url.pathname === '/api/v1/opportunities') {
      if (!['GET','HEAD'].includes(request.method)) return json({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD' });
      const result = queryOpportunities(url.searchParams);
      if (result.error) return json({ error: result.error }, 400, { 'cache-control': 'no-store' });
      const response = json(result, 200, { 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' });
      return request.method === 'HEAD' ? new Response(null, response) : response;
    }
    return env.ASSETS.fetch(request);
  }
};
