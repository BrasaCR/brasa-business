const MINIMUM_DAYS = 365;
const MAXIMUM_DAYS = 2555;

export async function enforceAuditRetention(env, scheduledTime = Date.now()) {
  if (!env.PROVIDERS_DB) throw new Error('provider_registry_unavailable');
  const policy = await env.PROVIDERS_DB.prepare('SELECT audit_retention_days AS retentionDays FROM marketplace_security_governance WHERE id=1').first();
  if (policy?.retentionDays == null) return { status: 'skipped', reason: 'retention_policy_unset', deleted: 0 };
  const retentionDays = Number(policy.retentionDays);
  if (!Number.isInteger(retentionDays) || retentionDays < MINIMUM_DAYS || retentionDays > MAXIMUM_DAYS) throw new Error('invalid_audit_retention_policy');
  const reference = Number(scheduledTime);
  if (!Number.isFinite(reference)) throw new Error('invalid_scheduled_time');
  const cutoff = new Date(reference - retentionDays * 86_400_000).toISOString();
  const results = await env.PROVIDERS_DB.batch([
    env.PROVIDERS_DB.prepare('DELETE FROM provider_audit_events WHERE created_at < ?').bind(cutoff),
    env.PROVIDERS_DB.prepare('DELETE FROM marketplace_operator_audit_events WHERE created_at < ?').bind(cutoff),
    env.PROVIDERS_DB.prepare('DELETE FROM marketplace_security_audit_events WHERE created_at < ?').bind(cutoff)
  ]);
  const deleted = results.reduce((total, result) => total + Number(result.meta?.changes || 0), 0);
  return { status: 'applied', retentionDays, cutoff, deleted };
}
