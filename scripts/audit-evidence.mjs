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

export function bundleDigest(bundle) {
  return createHash('sha256').update(canonicalJson(bundle)).digest('hex');
}

function rotationPayload(from, to, createdAt, reason) {
  if (!reason || reason.trim().length < 8 || reason.trim().length > 240) throw new Error('Rotation reason must be 8-240 characters.');
  return { format: 'brasa-audit-key-rotation/v1', from, to, createdAt, reason: reason.trim() };
}

export function createRotationAuthorization(previousPrivateKey, nextPublicKey, createdAt, reason) {
  const payload = rotationPayload(publicKeyFingerprint(createPublicKey(previousPrivateKey)), publicKeyFingerprint(nextPublicKey), createdAt, reason);
  return { ...payload, signatureAlgorithm: 'Ed25519', signature: sign(null, Buffer.from(canonicalJson(payload)), previousPrivateKey).toString('base64url') };
}

export function verifyRotationAuthorization(rotation, previousPublicKey, nextPublicKey) {
  if (!rotation || rotation.signatureAlgorithm !== 'Ed25519') throw new Error('Missing key-rotation authorization.');
  const { signatureAlgorithm: _algorithm, signature, ...payload } = rotation;
  const expected = rotationPayload(publicKeyFingerprint(previousPublicKey), publicKeyFingerprint(nextPublicKey), rotation.createdAt, rotation.reason);
  if (canonicalJson(payload) !== canonicalJson(expected)) throw new Error('Key-rotation authorization does not match the signing keys.');
  if (!verify(null, Buffer.from(canonicalJson(payload)), previousPublicKey, Buffer.from(signature, 'base64url'))) throw new Error('Key-rotation authorization is invalid.');
  return true;
}

function recoveryPayload(lastTrustedBundle, compromisedPublicKey, successorPublicKey, createdAt, incidentId, reason) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{5,63}$/.test(incidentId || '')) throw new Error('Incident ID must be 6-64 safe characters.');
  if (!reason || reason.trim().length < 12 || reason.trim().length > 240) throw new Error('Recovery reason must be 12-240 characters.');
  verifyBundleSignature(lastTrustedBundle, compromisedPublicKey);
  const compromisedFingerprint = publicKeyFingerprint(compromisedPublicKey);
  if (lastTrustedBundle?.integrity?.publicKeyFingerprint !== compromisedFingerprint) throw new Error('Last trusted bundle does not match the compromised key.');
  return {
    format: 'brasa-audit-recovery/v1', incidentId, createdAt, reason: reason.trim(),
    compromisedKeyFingerprint: compromisedFingerprint,
    successorKeyFingerprint: publicKeyFingerprint(successorPublicKey),
    lastTrustedBundleDigest: bundleDigest(lastTrustedBundle),
    lastTrustedEvidenceDigest: lastTrustedBundle.integrity.digest
  };
}

export function createRecoveryAuthorization(lastTrustedBundle, compromisedPublicKey, successorPublicKey, recoveryPrivateKeys, createdAt, incidentId, reason) {
  if (!Array.isArray(recoveryPrivateKeys) || recoveryPrivateKeys.length !== 2) throw new Error('Exactly two recovery custodians are required.');
  const payload = recoveryPayload(lastTrustedBundle, compromisedPublicKey, successorPublicKey, createdAt, incidentId, reason);
  const approvals = recoveryPrivateKeys.map(privateKey => ({
    publicKeyFingerprint: publicKeyFingerprint(createPublicKey(privateKey)),
    signatureAlgorithm: 'Ed25519',
    signature: sign(null, Buffer.from(canonicalJson(payload)), privateKey).toString('base64url')
  })).sort((a, b) => a.publicKeyFingerprint.localeCompare(b.publicKeyFingerprint));
  if (approvals[0].publicKeyFingerprint === approvals[1].publicKeyFingerprint) throw new Error('Recovery custodians must use distinct keys.');
  return { ...payload, approvals };
}

export function verifyRecoveryAuthorization(recovery, lastTrustedBundle, compromisedPublicKey, successorPublicKey, recoveryPublicKeys) {
  if (!recovery || !Array.isArray(recovery.approvals) || recovery.approvals.length !== 2 || !Array.isArray(recoveryPublicKeys) || recoveryPublicKeys.length !== 2) throw new Error('Exactly two recovery approvals and public keys are required.');
  const { approvals, ...payload } = recovery;
  const expected = recoveryPayload(lastTrustedBundle, compromisedPublicKey, successorPublicKey, recovery.createdAt, recovery.incidentId, recovery.reason);
  if (canonicalJson(payload) !== canonicalJson(expected)) throw new Error('Recovery authorization does not match the trusted evidence boundary.');
  const keys = new Map(recoveryPublicKeys.map(key => [publicKeyFingerprint(key), key]));
  if (keys.size !== 2) throw new Error('Recovery custodian keys must be distinct.');
  for (const approval of approvals) {
    const key = keys.get(approval.publicKeyFingerprint);
    if (!key || approval.signatureAlgorithm !== 'Ed25519' || !verify(null, Buffer.from(canonicalJson(payload)), key, Buffer.from(approval.signature, 'base64url'))) throw new Error('Recovery approval is invalid.');
    keys.delete(approval.publicKeyFingerprint);
  }
  if (keys.size !== 0) throw new Error('Recovery approval set does not match the custodians.');
  return true;
}

export function createRecoveredRoot(evidence, successorPrivateKey, recovery) {
  if (!recovery) throw new Error('Recovery authorization is required.');
  return createSignedBundle({ ...evidence, recovery }, successorPrivateKey);
}

export function verifyRecoveredRoot(bundle, successorPublicKey, lastTrustedBundle, compromisedPublicKey, recoveryPublicKeys) {
  verifySignedBundle(bundle, successorPublicKey);
  verifyRecoveryAuthorization(bundle.recovery, lastTrustedBundle, compromisedPublicKey, successorPublicKey, recoveryPublicKeys);
  return { valid: true, incidentId: bundle.recovery.incidentId, successorKeyFingerprint: bundle.recovery.successorKeyFingerprint };
}

export function createContinuity(previousBundle, previousPublicKey, nextPublicKey, rotation) {
  verifyBundleSignature(previousBundle, previousPublicKey);
  const previousFingerprint = publicKeyFingerprint(previousPublicKey), nextFingerprint = publicKeyFingerprint(nextPublicKey);
  if (previousFingerprint !== nextFingerprint) verifyRotationAuthorization(rotation, previousPublicKey, nextPublicKey);
  else if (rotation) throw new Error('A rotation authorization is not allowed when the signing key is unchanged.');
  return {
    sequence: (previousBundle.continuity?.sequence || 1) + 1,
    previousBundleDigest: bundleDigest(previousBundle),
    previousEvidenceDigest: previousBundle.integrity.digest,
    previousKeyFingerprint: previousBundle.integrity.publicKeyFingerprint,
    ...(rotation ? { rotation } : {})
  };
}


function verifyBundleSignature(bundle, publicKey) {
  const { integrity, ...signedEvidence } = bundle || {};
  if (!integrity || integrity.digestAlgorithm !== 'SHA-256' || integrity.signatureAlgorithm !== 'Ed25519' || !/^[a-f0-9]{64}$/.test(integrity.digest || '')) throw new Error('Invalid evidence integrity metadata.');
  if (publicKeyFingerprint(publicKey) !== integrity.publicKeyFingerprint) throw new Error('Evidence signing key mismatch.');
  const digest = evidenceDigest(signedEvidence);
  if (digest !== integrity.digest) throw new Error('Evidence digest mismatch.');
  if (!verify(null, Buffer.from(digest, 'hex'), publicKey, Buffer.from(integrity.signature, 'base64url'))) throw new Error('Evidence signature is invalid.');
  return digest;
}

export function createSignedBundle(evidence, privateKey, continuity) {
  const signedEvidence = continuity ? { ...evidence, continuity } : evidence;
  const digest = evidenceDigest(signedEvidence), publicKey = createPublicKey(privateKey);
  return {
    ...signedEvidence,
    integrity: {
      digestAlgorithm: 'SHA-256', digest,
      signatureAlgorithm: 'Ed25519',
      publicKeyFingerprint: publicKeyFingerprint(publicKey),
      signature: sign(null, Buffer.from(digest, 'hex'), privateKey).toString('base64url')
    }
  };
}

export function verifySignedBundle(bundle, publicKey, previousBundle, previousPublicKey) {
  const { integrity, continuity, ...evidence } = bundle || {};
  const digest = verifyBundleSignature(bundle, publicKey);
  if (continuity) {
    if (!previousBundle || !previousPublicKey) throw new Error('Previous bundle and public key are required for continuity verification.');
    verifyBundleSignature(previousBundle, previousPublicKey);
    if (continuity.previousBundleDigest !== bundleDigest(previousBundle) || continuity.previousEvidenceDigest !== previousBundle.integrity.digest || continuity.previousKeyFingerprint !== previousBundle.integrity.publicKeyFingerprint) throw new Error('Evidence continuity link is invalid.');
    if (continuity.sequence !== (previousBundle.continuity?.sequence || 1) + 1) throw new Error('Evidence continuity sequence is invalid.');
    if (publicKeyFingerprint(publicKey) !== publicKeyFingerprint(previousPublicKey)) verifyRotationAuthorization(continuity.rotation, previousPublicKey, publicKey);
    else if (continuity.rotation) throw new Error('Unexpected key-rotation authorization.');
  }
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


function optionalArgument(args, name) {
  const index = args.indexOf(`--${name}`), value = index >= 0 ? args[index + 1] : '';
  if (index >= 0 && (!value || value.startsWith('--'))) throw new Error(`--${name} requires a value.`);
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
    const previousPath = optionalArgument(args, 'previous-bundle');
    let continuity;
    if (previousPath) {
      const previousBundle = JSON.parse(readFileSync(resolve(previousPath), 'utf8'));
      const previousPublicKey = readFileSync(resolve(argument(args, 'previous-public-key')), 'utf8');
      const nextPublicKey = createPublicKey(privateKey);
      let rotation;
      if (publicKeyFingerprint(previousPublicKey) !== publicKeyFingerprint(nextPublicKey)) {
        const previousPrivateKey = readFileSync(resolve(argument(args, 'previous-private-key')), 'utf8');
        rotation = createRotationAuthorization(previousPrivateKey, nextPublicKey, new Date().toISOString(), argument(args, 'rotation-reason'));
      }
      continuity = createContinuity(previousBundle, previousPublicKey, nextPublicKey, rotation);
    }
    const bundle = createSignedBundle(collectEvidence(), privateKey, continuity), target = writeExclusive(output, `${JSON.stringify(bundle, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ status: 'exported', path: target, digest: bundle.integrity.digest, publicKeyFingerprint: bundle.integrity.publicKeyFingerprint })}\n`);
  } else if (command === 'verify') {
    const bundle = JSON.parse(readFileSync(resolve(argument(args, 'bundle')), 'utf8')), publicKey = readFileSync(resolve(argument(args, 'public-key')), 'utf8');
    const previousPath = optionalArgument(args, 'previous-bundle');
    const previousBundle = previousPath ? JSON.parse(readFileSync(resolve(previousPath), 'utf8')) : undefined;
    const previousPublicPath = optionalArgument(args, 'previous-public-key');
    const previousPublicKey = previousPublicPath ? readFileSync(resolve(previousPublicPath), 'utf8') : undefined;
    process.stdout.write(`${JSON.stringify({ status: 'verified', ...verifySignedBundle(bundle, publicKey, previousBundle, previousPublicKey) })}\n`);
  } else if (command === 'recover-root') {
    const successorPrivateKey = readFileSync(resolve(argument(args, 'private-key')), 'utf8');
    const successorPublicKey = createPublicKey(successorPrivateKey);
    const lastTrustedBundle = JSON.parse(readFileSync(resolve(argument(args, 'last-trusted-bundle')), 'utf8'));
    const compromisedPublicKey = readFileSync(resolve(argument(args, 'compromised-public-key')), 'utf8');
    const recoveryPrivateKeys = ['recovery-private-key-a', 'recovery-private-key-b'].map(name => readFileSync(resolve(argument(args, name)), 'utf8'));
    const recovery = createRecoveryAuthorization(lastTrustedBundle, compromisedPublicKey, successorPublicKey, recoveryPrivateKeys, new Date().toISOString(), argument(args, 'incident'), argument(args, 'recovery-reason'));
    const bundle = createRecoveredRoot(collectEvidence(), successorPrivateKey, recovery);
    const target = writeExclusive(argument(args, 'output'), `${JSON.stringify(bundle, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ status: 'recovered-root-exported', path: target, incidentId: recovery.incidentId, digest: bundle.integrity.digest, publicKeyFingerprint: bundle.integrity.publicKeyFingerprint })}\n`);
  } else if (command === 'verify-recovery') {
    const bundle = JSON.parse(readFileSync(resolve(argument(args, 'bundle')), 'utf8'));
    const successorPublicKey = readFileSync(resolve(argument(args, 'public-key')), 'utf8');
    const lastTrustedBundle = JSON.parse(readFileSync(resolve(argument(args, 'last-trusted-bundle')), 'utf8'));
    const compromisedPublicKey = readFileSync(resolve(argument(args, 'compromised-public-key')), 'utf8');
    const recoveryPublicKeys = ['recovery-public-key-a', 'recovery-public-key-b'].map(name => readFileSync(resolve(argument(args, name)), 'utf8'));
    process.stdout.write(`${JSON.stringify({ status: 'recovery-verified', ...verifyRecoveredRoot(bundle, successorPublicKey, lastTrustedBundle, compromisedPublicKey, recoveryPublicKeys) })}\n`);
  } else throw new Error('Use export, verify, recover-root, or verify-recovery. Recovery requires two distinct offline custodian keys.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { process.stderr.write(`Audit evidence failed: ${error.message}\n`); process.exitCode = 1; }
}
