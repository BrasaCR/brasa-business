const REPORT_CATEGORIES = new Set(['inaccurate', 'closed', 'unsafe', 'misleading', 'expired', 'other']);
const json = (value, status = 200, extra = {}) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', ...extra } });
export const publicProvider = (row) => ({ schemaVersion: 1, id: row.id, type: 'marketplace-provider', name: row.name, category: row.category, description: row.description, capabilities: JSON.parse(row.capabilitiesJson), countryCode: row.countryCode, region: row.region || null, websiteUrl: row.websiteUrl, provenance: { sourceLabel: row.sourceLabel, sourceUrl: row.provenanceUrl }, verification: { status: 'verified', verifiedAt: row.verifiedAt, expiresAt: row.expiresAt }, reportPath: `/api/v1/providers/${encodeURIComponent(row.id)}/reports` });

export async function listProviders(request, env) {
  if (!env.PROVIDERS_DB) return json({ error: 'provider_registry_unavailable' }, 503, { 'cache-control': 'no-store' });
  const search = new URL(request.url).searchParams, category = (search.get('category') || '').trim().toLowerCase(), capability = (search.get('capability') || '').trim().toLowerCase(), countryCode = (search.get('countryCode') || '').trim().toUpperCase(), rawLimit = search.get('limit') || '20';
  if ((category && !/^[a-z0-9-]{1,80}$/.test(category)) || (capability && !/^[a-z0-9-]{1,80}$/.test(capability)) || (countryCode && !/^[A-Z]{2}$/.test(countryCode)) || !/^\d+$/.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 50) return json({ error: 'invalid_provider_query' }, 400, { 'cache-control': 'no-store' });
  const predicates = ["verification_status = 'verified'", "datetime(expires_at) > datetime('now')"], values = [];
  if (category) { predicates.push('category = ?'); values.push(category); } if (countryCode) { predicates.push('country_code = ?'); values.push(countryCode); } if (capability) { predicates.push('EXISTS (SELECT 1 FROM json_each(capabilities_json) WHERE value = ?)'); values.push(capability); }
  const limit = Number(rawLimit), result = await env.PROVIDERS_DB.prepare(`SELECT id,name,category,description,capabilities_json AS capabilitiesJson,country_code AS countryCode,region,website_url AS websiteUrl,provenance_url AS provenanceUrl,source_label AS sourceLabel,verified_at AS verifiedAt,expires_at AS expiresAt FROM provider_records WHERE ${predicates.join(' AND ')} ORDER BY name LIMIT ?`).bind(...values, limit).all();
  return json({ data: result.results.map(publicProvider), meta: { limit, filters: { category: category || null, capability: capability || null, countryCode: countryCode || null }, notice: 'Verified records are informational listings, not endorsements or guarantees.' } }, 200, { 'cache-control': 'public, max-age=120, stale-while-revalidate=600' });
}

export async function reportProvider(request, env, providerId) {
  if (!env.PROVIDERS_DB) return json({ error: 'provider_registry_unavailable' }, 503, { 'cache-control': 'no-store' });
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(providerId)) return json({ error: 'invalid_provider_id' }, 400, { 'cache-control': 'no-store' });
  const declared = Number(request.headers.get('content-length') || 0); if (declared > 1024) return json({ error: 'request_too_large' }, 413, { 'cache-control': 'no-store' });
  const text = await request.text(); if (text.length > 1024) return json({ error: 'request_too_large' }, 413, { 'cache-control': 'no-store' });
  let input; try { input = JSON.parse(text); } catch { return json({ error: 'invalid_json' }, 400, { 'cache-control': 'no-store' }); }
  const category = String(input.category || ''); if (!REPORT_CATEGORIES.has(category) || Object.keys(input).some((key) => key !== 'category')) return json({ error: 'invalid_provider_report' }, 400, { 'cache-control': 'no-store' });
  const provider = await env.PROVIDERS_DB.prepare("SELECT id FROM provider_records WHERE id=? AND verification_status='verified' AND datetime(expires_at)>datetime('now')").bind(providerId).first(); if (!provider) return json({ error: 'provider_not_found' }, 404, { 'cache-control': 'no-store' });
  await env.PROVIDERS_DB.prepare('INSERT INTO provider_reports (id,provider_id,category) VALUES (?,?,?)').bind(crypto.randomUUID(), providerId, category).run();
  return json({ data: { accepted: true } }, 202, { 'cache-control': 'no-store' });
}
