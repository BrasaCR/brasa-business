import { createHash, createPublicKey, sign, verify } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createD1Executor } from './marketplace-operator.mjs';

export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function evidenceDigest(evidence) {
  return createHash('sha256').update(canonicalJson(evidence)).digest('hex');
}

export function publicKeyFingerprint(publicKey) {
  const key = publicKey?.type === 'public' ? publicKey : createPublicKey(publicKey);
  const der = key.export({ type: 'spki', format: 'der' });
  return `SHA256:${createHash('sha256').update(der).digest('base64url')}`;
}

export function createSignedBundle(evidence, privateKey) {
  const digest = evidenceDigest(evidence), publicKey = createPublicKey(privateKey);
  return {
    ...evidence,
    integrity: {
      digestAlgorithm: 'SHA-256', digest,
      signatureAlgorithm: 'Ed25519',
      publicKeyFingerprint: publicKeyFingerprint(publicKey),
      signature: sign(null, Buffer.from(digest, 'hex'), privateKey).toString('base64url')
    }
  };
}

export function verifySignedBundle(bundle, publicKey) {
  const { integrity, ...evidence } = bundle || {};
  if (!integrity || integrity.digestAlgorithm !== 'SHA-256' || integrity.signatureAlgorithm !== 'Ed25519' || !/^[a-f0-9]{64}$/.test(integrity.digest || '')) throw new Error('Invalid evidence integrity metadata.');
  const digest = evidenceDigest(evidence);
  if (digest !== integrity.digest) throw new Error('Evidence digest mismatch.');
  if (publicKeyFingerprint(publicKey) !== integrity.publicKeyFingerprint) throw new Error('Evidence signing key mismatch.');
  if (!verify(null, Buffer.from(digest, 'hex'), publicKey, Buffer.from(integrity.signature, 'base64url'))) throw new Error('Evidence signature is invalid.');
  return { valid: true, digest, publicKeyFingerprint: integrity.publicKeyFingerprint, records: Object.values(evidence.sections || {}).reduce((count, rows) => count + rows.length, 0) };
}

export function collectEvidence(execute = createD1Executor(), createdAt = new Date().toISOString()) {
  const queries = {
    providerAudit: 'SELECT id,provider_id,action,reason,created_at FROM provider_audit_events ORDER BY created_at,id',
    operatorAudit: 'SELECT id,display_id,action,reason,details_json,actor,created_at FROM marketplace_operator_audit_events ORDER BY created_at,id',
    securityAudit: 'SELECT id,action,subject_id,actor_display_id,reason,details_json,created_at FROM marketplace_security_audit_events ORDER BY created_at,id',
    emergencyEvents: 'SELECT id,request_id,target_display_id,action,actor_display_id,reason,created_at FROM marketplace_emergency_revocation_events ORDER BY created_at,id',
    adminRequests: 'SELECT id,target_display_id,requested_by,approved_by,status,reason,expires_at,created_at,approved_at FROM marketplace_admin_role_requests ORDER BY created_at,id',
    emergencyRequests: 'SELECT id,target_display_id,initiated_by,confirmed_by,status,reason,confirmation_reason,expires_at,created_at,executed_at FROM marketplace_emergency_revocations ORDER BY created_at,id',
    governancePolicy: 'SELECT id,audit_retention_days,emergency_primary_display_id,emergency_backup_display_id,policy_reason,reviewed_at,updated_at AS created_at FROM marketplace_security_governance ORDER BY created_at,id'
  };
  return { format: 'brasa-audit-evidence/v1', environment: 'staging', createdAt, sections: Object.fromEntries(Object.entries(queries).map(([name, query]) => [name, execute('brasa-business-marketplace-staging', query)])) };
}

function argument(args, name) {
  const index = args.indexOf(`--${name}`), value = index >= 0 ? args[index + 1] : '';
  if (!value || value.startsWith('--')) throw new Error(`--${name} is required.`);
  return value;
}

function writeExclusive(path, contents) {
  const target = resolve(path);
  if (existsSync(target)) throw new Error(`Refusing to overwrite existing evidence: ${target}`);
  mkdirSync(dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.tmp`;
  writeFileSync(temporary, contents, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
  renameSync(temporary, target);
  return target;
}

export function main(args = process.argv.slice(2)) {
  const [command] = args;
  if (command === 'export') {
    const output = argument(args, 'output'), privateKey = readFileSync(resolve(argument(args, 'private-key')), 'utf8');
    const bundle = createSignedBundle(collectEvidence(), privateKey), target = writeExclusive(output, `${JSON.stringify(bundle, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ status: 'exported', path: target, digest: bundle.integrity.digest, publicKeyFingerprint: bundle.integrity.publicKeyFingerprint })}\n`);
  } else if (command === 'verify') {
    const bundle = JSON.parse(readFileSync(resolve(argument(args, 'bundle')), 'utf8')), publicKey = readFileSync(resolve(argument(args, 'public-key')), 'utf8');
    process.stdout.write(`${JSON.stringify({ status: 'verified', ...verifySignedBundle(bundle, publicKey) })}\n`);
  } else throw new Error('Use: export --output FILE --private-key FILE, or verify --bundle FILE --public-key FILE.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { process.stderr.write(`Audit evidence failed: ${error.message}\n`); process.exitCode = 1; }
}
