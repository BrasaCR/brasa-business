import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { createD1Executor, sqlText } from './marketplace-operator.mjs';

export const STAGING_DATABASE = 'brasa-business-marketplace-staging';
export const STAGING_PROVIDERS = Object.freeze([
  { id: 'staging-demo-retail-cr', name: 'BRASA Demo · Retail Cooperative', category: 'retail', description: 'Demonstration listing for testing inventory and sales pathways.', capabilities: ['inventory','sales'], countryCode: 'CR', region: 'San José' },
  { id: 'staging-demo-logistics-cr', name: 'BRASA Demo · Community Delivery', category: 'delivery', description: 'Demonstration listing for testing local logistics pathways.', capabilities: ['logistics','navigation'], countryCode: 'CR', region: 'Alajuela' },
  { id: 'staging-demo-hospitality-cr', name: 'BRASA Demo · Hospitality Network', category: 'hospitality-entertainment', description: 'Demonstration listing for testing hospitality and tourism pathways.', capabilities: ['hospitality','tourism'], countryCode: 'CR', region: 'Guanacaste' },
  { id: 'staging-demo-maintenance-cr', name: 'BRASA Demo · Home Services', category: 'home-maintenance', description: 'Demonstration listing for testing maintenance and safety pathways.', capabilities: ['maintenance','safety'], countryCode: 'CR', region: 'Cartago' }
]);

export function seedSql(now = new Date()) {
  const verifiedAt = now.toISOString(), expiresAt = new Date(now.getTime() + 7 * 86_400_000).toISOString();
  return STAGING_PROVIDERS.flatMap(provider => {
    const website = `https://example.invalid/brasa-staging/${provider.id}`;
    const source = `https://example.invalid/brasa-staging/source/${provider.id}`;
    const upsert = `INSERT INTO provider_records(id,name,category,description,capabilities_json,country_code,region,website_url,provenance_url,source_label,verification_status,verified_at,expires_at) VALUES (${sqlText(provider.id)},${sqlText(provider.name)},${sqlText(provider.category)},${sqlText(provider.description)},${sqlText(JSON.stringify(provider.capabilities))},${sqlText(provider.countryCode)},${sqlText(provider.region)},${sqlText(website)},${sqlText(source)},'BRASA staging fixture — not a real provider','verified',${sqlText(verifiedAt)},${sqlText(expiresAt)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,description=excluded.description,capabilities_json=excluded.capabilities_json,country_code=excluded.country_code,region=excluded.region,website_url=excluded.website_url,provenance_url=excluded.provenance_url,source_label=excluded.source_label,verification_status='verified',verified_at=excluded.verified_at,expires_at=excluded.expires_at,updated_at=datetime('now')`;
    const audit = `INSERT INTO provider_audit_events(id,provider_id,action,reason) VALUES (${sqlText(randomUUID())},${sqlText(provider.id)},'verify','Controlled staging demonstration seed')`;
    return [upsert, audit];
  }).join('; ');
}

export function cleanupSql() {
  const ids = STAGING_PROVIDERS.map(provider => sqlText(provider.id)).join(',');
  return `DELETE FROM provider_reports WHERE provider_id IN (${ids}); DELETE FROM provider_audit_events WHERE provider_id IN (${ids}); DELETE FROM provider_records WHERE id IN (${ids})`;
}

export function run(command, execute = createD1Executor(), now = new Date()) {
  if (command === 'apply') { execute(STAGING_DATABASE, seedSql(now)); return { status: 'seeded', environment: 'staging', records: STAGING_PROVIDERS.length, expiresAt: new Date(now.getTime() + 7 * 86_400_000).toISOString() }; }
  if (command === 'cleanup') { execute(STAGING_DATABASE, cleanupSql()); return { status: 'cleaned', environment: 'staging', records: STAGING_PROVIDERS.length }; }
  throw new Error('Use apply or cleanup. This tool targets staging only.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.stdout.write(`${JSON.stringify(run(process.argv[2]), null, 2)}\n`); }
  catch (error) { process.stderr.write(`Staging provider seed failed: ${error.message}\n`); process.exitCode = 1; }
}
