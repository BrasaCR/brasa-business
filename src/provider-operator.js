const STATUSES = new Set(['pending', 'verified', 'suspended', 'expired', 'rejected']);
const ACTIONS = new Set(['verify', 'renew', 'suspend', 'expire', 'reject']);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' } });
const validId = (value) => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value);
const validUrl = (value) => { try { return new URL(value).protocol === 'https:'; } catch { return false; } };

async function sameSecret(candidate, expected) {
  if (!candidate || !expected) return false;
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([crypto.subtle.digest('SHA-256', encoder.encode(candidate)), crypto.subtle.digest('SHA-256', encoder.encode(expected))]);
  const a = new Uint8Array(left), b = new Uint8Array(right); let difference = a.length ^ b.length;
  for (let index = 0; index < a.length; index += 1) difference |= a[index] ^ (b[index] || 0);
  return difference === 0;
}

export async function authorizeOperator(request, env) {
  const header = request.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ') || !(await sameSecret(header.slice(7).trim(), env.MARKETPLACE_OPERATOR_KEY))) return json({ error: 'operator_unauthorized' }, 401);
  return null;
}

async function boundedJson(request) {
  const declared = Number(request.headers.get('content-length') || 0); if (declared > 8192) return { response: json({ error: 'request_too_large' }, 413) };
  const text = await request.text(); if (text.length > 8192) return { response: json({ error: 'request_too_large' }, 413) };
  try { return { value: JSON.parse(text) }; } catch { return { response: json({ error: 'invalid_json' }, 400) }; }
}

export async function listOperatorProviders(request, env) {
  const status = new URL(request.url).searchParams.get('status') || 'pending';
  if (!STATUSES.has(status)) return json({ error: 'invalid_status' }, 400);
  const result = await env.PROVIDERS_DB.prepare('SELECT id,name,category,country_code AS countryCode,source_label AS sourceLabel,provenance_url AS provenanceUrl,verification_status AS status,verified_at AS verifiedAt,expires_at AS expiresAt,updated_at AS updatedAt FROM provider_records WHERE verification_status=? ORDER BY updated_at DESC LIMIT 100').bind(status).all();
  return json({ data: result.results, meta: { status, limit: 100 } });
}

export async function createOperatorProvider(request, env) {
  const parsed = await boundedJson(request); if (parsed.response) return parsed.response; const input = parsed.value || {};
  const allowed = new Set(['id','name','category','description','capabilities','countryCode','region','websiteUrl','provenanceUrl','sourceLabel','reason']);
  if (Object.keys(input).some((key) => !allowed.has(key)) || !validId(input.id) || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 160 || !/^[a-z0-9-]{1,80}$/.test(input.category || '') || typeof input.description !== 'string' || !input.description.trim() || input.description.length > 1000 || !Array.isArray(input.capabilities) || input.capabilities.length > 20 || input.capabilities.some((item) => typeof item !== 'string' || !/^[a-z0-9-]{1,80}$/.test(item)) || !/^[A-Z]{2}$/.test(input.countryCode || '') || (input.region != null && (typeof input.region !== 'string' || input.region.length > 160)) || !validUrl(input.websiteUrl) || !validUrl(input.provenanceUrl) || typeof input.sourceLabel !== 'string' || !input.sourceLabel.trim() || input.sourceLabel.length > 160 || typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 500) return json({ error: 'invalid_provider_record' }, 400);
  const auditId = crypto.randomUUID();
  try {
    await env.PROVIDERS_DB.batch([
      env.PROVIDERS_DB.prepare("INSERT INTO provider_records (id,name,category,description,capabilities_json,country_code,region,website_url,provenance_url,source_label,verification_status,expires_at) VALUES (?,?,?,?,?,?,?,?,?,?,'pending',datetime('now'))").bind(input.id, input.name.trim(), input.category, input.description.trim(), JSON.stringify([...new Set(input.capabilities)]), input.countryCode, input.region?.trim() || null, input.websiteUrl, input.provenanceUrl, input.sourceLabel.trim()),
      env.PROVIDERS_DB.prepare('INSERT INTO provider_audit_events (id,provider_id,action,reason) VALUES (?,?,\'create\',?)').bind(auditId, input.id, input.reason.trim())
    ]);
  } catch { return json({ error: 'provider_conflict' }, 409); }
  return json({ data: { id: input.id, status: 'pending' } }, 201);
}

export async function actOnProvider(request, env, providerId) {
  if (!validId(providerId)) return json({ error: 'invalid_provider_id' }, 400);
  const parsed = await boundedJson(request); if (parsed.response) return parsed.response; const input = parsed.value || {};
  if (Object.keys(input).some((key) => !['action','reason','expiresAt'].includes(key)) || !ACTIONS.has(input.action) || typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 500) return json({ error: 'invalid_provider_action' }, 400);
  const needsExpiry = ['verify','renew'].includes(input.action), expiry = needsExpiry ? Date.parse(input.expiresAt || '') : NaN;
  if (needsExpiry && (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > Date.now() + 366 * 86400000)) return json({ error: 'invalid_verification_expiry' }, 400);
  const status = input.action === 'verify' || input.action === 'renew' ? 'verified' : input.action === 'suspend' ? 'suspended' : input.action === 'expire' ? 'expired' : input.action;
  const existing = await env.PROVIDERS_DB.prepare('SELECT id,verification_status AS status FROM provider_records WHERE id=?').bind(providerId).first(); if (!existing) return json({ error: 'provider_not_found' }, 404);
  if (input.action === 'renew' && existing.status !== 'verified') return json({ error: 'invalid_status_transition' }, 409);
  await env.PROVIDERS_DB.batch([
    env.PROVIDERS_DB.prepare("UPDATE provider_records SET verification_status=?,verified_at=CASE WHEN ?='verified' THEN datetime('now') ELSE verified_at END,expires_at=CASE WHEN ?='verified' THEN ? ELSE expires_at END,updated_at=datetime('now') WHERE id=?").bind(status, status, status, needsExpiry ? new Date(expiry).toISOString() : null, providerId),
    env.PROVIDERS_DB.prepare('INSERT INTO provider_audit_events (id,provider_id,action,reason) VALUES (?,?,?,?)').bind(crypto.randomUUID(), providerId, input.action, input.reason.trim())
  ]);
  return json({ data: { id: providerId, status, expiresAt: needsExpiry ? new Date(expiry).toISOString() : null } });
}

export async function listOperatorReports(request, env) {
  const status = new URL(request.url).searchParams.get('status') || 'open'; if (!['open','reviewed','dismissed','actioned'].includes(status)) return json({ error: 'invalid_status' }, 400);
  const result = await env.PROVIDERS_DB.prepare('SELECT id,provider_id AS providerId,category,status,created_at AS createdAt FROM provider_reports WHERE status=? ORDER BY created_at LIMIT 100').bind(status).all();
  return json({ data: result.results, meta: { status, limit: 100 } });
}

export async function resolveOperatorReport(request, env, reportId) {
  if (!validId(reportId)) return json({ error: 'invalid_report_id' }, 400); const parsed = await boundedJson(request); if (parsed.response) return parsed.response; const input = parsed.value || {};
  if (!['reviewed','dismissed'].includes(input.resolution) || typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 500 || Object.keys(input).some((key) => !['resolution','reason'].includes(key))) return json({ error: 'invalid_report_resolution' }, 400);
  const report = await env.PROVIDERS_DB.prepare("SELECT provider_id AS providerId FROM provider_reports WHERE id=? AND status='open'").bind(reportId).first(); if (!report) return json({ error: 'report_not_found' }, 404);
  await env.PROVIDERS_DB.batch([
    env.PROVIDERS_DB.prepare('UPDATE provider_reports SET status=? WHERE id=?').bind(input.resolution, reportId),
    env.PROVIDERS_DB.prepare('INSERT INTO provider_audit_events (id,provider_id,action,reason) VALUES (?,?,?,?)').bind(crypto.randomUUID(), report.providerId, input.resolution === 'reviewed' ? 'report_reviewed' : 'report_dismissed', input.reason.trim())
  ]);
  return json({ data: { id: reportId, status: input.resolution } });
}
