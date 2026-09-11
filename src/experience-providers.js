import { OPPORTUNITIES } from './opportunities.js';
import { publicProvider } from './providers.js';

const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra } });

export async function listExperienceProviders(request, env, experienceId) {
  if (!env.PROVIDERS_DB) return json({ error: 'provider_registry_unavailable' }, 503, { 'cache-control': 'no-store' });
  if (!/^[a-z0-9-]{1,80}$/.test(experienceId)) return json({ error: 'invalid_experience_id' }, 400, { 'cache-control': 'no-store' });
  const pathway = OPPORTUNITIES.find(item => item.id === experienceId);
  if (!pathway) return json({ error: 'experience_not_found' }, 404, { 'cache-control': 'no-store' });
  const search = new URL(request.url).searchParams;
  const countryCode = (search.get('countryCode') || '').trim().toUpperCase();
  const rawLimit = search.get('limit') || '12';
  if ((countryCode && !/^[A-Z]{2}$/.test(countryCode)) || !/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 20) return json({ error: 'invalid_provider_query' }, 400, { 'cache-control': 'no-store' });
  const capabilitySlots = pathway.capabilities.map(() => '?').join(',');
  const predicates = ["verification_status = 'verified'", "datetime(expires_at) > datetime('now')", `(category = ? OR EXISTS (SELECT 1 FROM json_each(capabilities_json) WHERE value IN (${capabilitySlots})))`];
  const values = [pathway.id, ...pathway.capabilities];
  if (countryCode) { predicates.push('country_code = ?'); values.push(countryCode); }
  const limit = Number(rawLimit);
  const result = await env.PROVIDERS_DB.prepare(`SELECT id,name,category,description,capabilities_json AS capabilitiesJson,country_code AS countryCode,region,website_url AS websiteUrl,provenance_url AS provenanceUrl,source_label AS sourceLabel,verified_at AS verifiedAt,expires_at AS expiresAt FROM provider_records WHERE ${predicates.join(' AND ')} ORDER BY name LIMIT ?`).bind(...values, limit).all();
  return json({ data: result.results.map(publicProvider), meta: { experienceId, countryCode: countryCode || null, limit, verifiedOnly: true, notice: 'Listings are verified records, not endorsements, eligibility decisions, or guarantees.' } }, 200, { 'cache-control': 'public, max-age=120, stale-while-revalidate=600' });
}
