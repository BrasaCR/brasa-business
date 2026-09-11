import { queryOpportunities } from './opportunities.js';
import { businessExperience } from './experiences.js';
import { listProviders, reportProvider } from './providers.js';
import { authenticateOperator, listOperatorProviders, createOperatorProvider, actOnProvider, listOperatorReports, resolveOperatorReport } from './provider-operator.js';
import { enforceAuditRetention } from './audit-retention.js';
import { listExperienceProviders } from './experience-providers.js';
import { listExperienceLearning } from './learning.js';
import { listExperiencePreparation } from './preparation.js';
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });
const apiResponse = (value, status = 200, extra = {}) => json(value, status, { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra });
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok: true, service: 'brasa-business', version: 1 });
    if (url.pathname === '/operator-marketplace.html' || url.pathname === '/operator-marketplace') return Response.redirect(new URL('/operator/marketplace', request.url), 302);
    if (url.pathname === '/operator/marketplace') {
      const asset = await env.ASSETS.fetch(new Request(new URL('/operator-marketplace', request.url), request));
      const response = new Response(asset.body, asset); response.headers.set('cache-control', 'no-store'); response.headers.set('x-content-type-options', 'nosniff'); response.headers.set('referrer-policy', 'no-referrer'); response.headers.set('content-security-policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"); return response;
    }
    if (url.pathname.startsWith('/api/operator/v1/')) {
      if (!env.PROVIDERS_DB) return apiResponse({ error: 'provider_registry_unavailable' }, 503, { 'cache-control': 'no-store' });
      if (url.pathname === '/api/operator/v1/session/exchange') {
        if(request.method!=='POST')return apiResponse({error:'method_not_allowed'},405,{allow:'POST'});
        if(!env.IDENTITY)return apiResponse({error:'identity_service_unavailable'},503,{'cache-control':'no-store'});
        return env.IDENTITY.fetch(new Request('https://brasa-identity/api/business/operator/exchange',{method:'POST',headers:{'content-type':'application/json','cf-access-jwt-assertion':request.headers.get('cf-access-jwt-assertion')||''},body:request.body,duplex:'half'}));
      }
      if (url.pathname === '/api/operator/v1/session/logout') {
        if(request.method!=='POST')return apiResponse({error:'method_not_allowed'},405,{allow:'POST'});
        return env.IDENTITY.fetch(new Request('https://brasa-identity/api/business/operator/logout',{method:'POST',headers:{authorization:request.headers.get('authorization')||''}}));
      }
      const access=await authenticateOperator(request,env);if(access.response)return access.response;const role=access.operator.role;
      if(url.pathname==='/api/operator/v1/session/me'&&request.method==='GET')return apiResponse({data:access.operator},200,{'cache-control':'no-store'});
      if (url.pathname === '/api/operator/v1/providers') {
        if (request.method === 'GET') return listOperatorProviders(request, env);
        if (request.method === 'POST' && ['verifier','administrator'].includes(role)) return createOperatorProvider(request, env);
        if (request.method === 'POST') return apiResponse({error:'operator_role_required'},403,{'cache-control':'no-store'});
        return apiResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, POST' });
      }
      if (url.pathname === '/api/operator/v1/reports' && request.method === 'GET') return listOperatorReports(request, env);
      const providerAction = url.pathname.match(/^\/api\/operator\/v1\/providers\/([^/]+)\/actions$/); if (providerAction && request.method === 'POST' && ['verifier','administrator'].includes(role)) return actOnProvider(request, env, decodeURIComponent(providerAction[1]));
      if(providerAction&&request.method==='POST')return apiResponse({error:'operator_role_required'},403,{'cache-control':'no-store'});
      const reportResolution = url.pathname.match(/^\/api\/operator\/v1\/reports\/([^/]+)\/resolve$/); if (reportResolution && request.method === 'POST') return resolveOperatorReport(request, env, decodeURIComponent(reportResolution[1]));
      return apiResponse({ error: 'operator_route_not_found' }, 404, { 'cache-control': 'no-store' });
    }
    if (url.pathname === '/api/v1/opportunities') {
      if (!['GET','HEAD'].includes(request.method)) return apiResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD' });
      const result = queryOpportunities(url.searchParams);
      if (result.error) return apiResponse({ error: result.error }, 400, { 'cache-control': 'no-store' });
      const response = apiResponse(result, 200, { 'cache-control': 'public, max-age=300, stale-while-revalidate=3600' });
      return request.method === 'HEAD' ? new Response(null, response) : response;
    }
    const experienceProviders = url.pathname.match(/^\/api\/v1\/experiences\/([^/]+)\/providers$/);
    if (experienceProviders) {
      if (!['GET','HEAD'].includes(request.method)) return apiResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD' });
      let id; try { id = decodeURIComponent(experienceProviders[1]); } catch { return apiResponse({ error: 'invalid_experience_id' }, 400, { 'cache-control': 'no-store' }); }
      try { const response = await listExperienceProviders(request, env, id); return request.method === 'HEAD' ? new Response(null, response) : response; } catch (error) { console.error(JSON.stringify({ event: 'experience_provider_registry_error', message: error instanceof Error ? error.message : 'unknown' })); return apiResponse({ error: 'provider_registry_unavailable' }, 503, { 'cache-control': 'no-store' }); }
    }
    const experienceLearning = url.pathname.match(/^\/api\/v1\/experiences\/([^/]+)\/learning$/);
    if (experienceLearning) {
      if (!['GET','HEAD'].includes(request.method)) return apiResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD' });
      let id; try { id = decodeURIComponent(experienceLearning[1]); } catch { return apiResponse({ error: 'invalid_experience_id' }, 400, { 'cache-control': 'no-store' }); }
      try { const response = await listExperienceLearning(request, env, id); return request.method === 'HEAD' ? new Response(null, response) : response; } catch (error) { console.error(JSON.stringify({ event: 'experience_learning_error', message: error instanceof Error ? error.message : 'unknown' })); return apiResponse({ error: 'education_service_unavailable' }, 503, { 'cache-control': 'no-store' }); }
    }
    const experiencePreparation = url.pathname.match(/^\/api\/v1\/experiences\/([^/]+)\/preparation$/);
    if (experiencePreparation) {
      if (!['GET','HEAD'].includes(request.method)) return apiResponse({ error: 'method_not_allowed' }, 405, { allow: 'GET, HEAD' });
      let id; try { id = decodeURIComponent(experiencePreparation[1]); } catch { return apiResponse({ error: 'invalid_experience_id' }, 400, { 'cache-control': 'no-store' }); }
      try { const response = await listExperiencePreparation(request, env, id); return request.method === 'HEAD' ? new Response(null, response) : response; } catch (error) { console.error(JSON.stringify({ event: 'experience_government_service_error', message: error instanceof Error ? error.message : 'unknown' })); return apiResponse({ error: 'government_service_unavailable' }, 503, { 'cache-control': 'no-store' }); }
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
  },
  async scheduled(controller, env) {
    try {
      const result = await enforceAuditRetention(env, controller.scheduledTime);
      console.log(JSON.stringify({ event: 'marketplace_audit_retention', ...result }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'marketplace_audit_retention_failed', message: error instanceof Error ? error.message : 'unknown' }));
      throw error;
    }
  }
};
