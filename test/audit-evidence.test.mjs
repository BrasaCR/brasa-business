import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { canonicalJson, collectEvidence, createContinuity, createRotationAuthorization, createSignedBundle, evidenceDigest, verifySignedBundle } from '../scripts/audit-evidence.mjs';

test('canonical JSON and evidence digests do not depend on object key order', () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  assert.equal(evidenceDigest({ a: 1, b: 2 }), evidenceDigest({ b: 2, a: 1 }));
});

test('collects every governance evidence section with explicit ordered fields', () => {
  const calls = [], evidence = collectEvidence((database, query) => { calls.push({ database, query }); return [{ id: 'event-1' }]; }, '2026-09-11T12:00:00.000Z');
  assert.equal(evidence.format, 'brasa-audit-evidence/v1'); assert.equal(calls.length, 7);
  assert.ok(calls.every(call => call.database === 'brasa-business-marketplace-staging' && call.query.includes('ORDER BY created_at,id')));
  assert.equal(Object.keys(evidence.sections).length, 7);
});

test('verifies an Ed25519-signed export and detects modified evidence', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const bundle = createSignedBundle({ format: 'brasa-audit-evidence/v1', environment: 'staging', createdAt: '2026-09-11T12:00:00.000Z', sections: { operatorAudit: [{ id: 'one', action: 'create' }] } }, privateKey);
  assert.equal(verifySignedBundle(bundle, publicKey).valid, true);
  const tampered = structuredClone(bundle); tampered.sections.operatorAudit[0].action = 'suspend';
  assert.throws(() => verifySignedBundle(tampered, publicKey), /digest mismatch/);
  const other = generateKeyPairSync('ed25519');
  assert.throws(() => verifySignedBundle(bundle, other.publicKey), /signing key mismatch/);
});

test('links consecutive evidence bundles signed by the same key', () => {
  const keys = generateKeyPairSync('ed25519');
  const first = createSignedBundle({ format: 'brasa-audit-evidence/v1', sections: {} }, keys.privateKey);
  const continuity = createContinuity(first, keys.publicKey, keys.publicKey);
  const second = createSignedBundle({ format: 'brasa-audit-evidence/v1', sections: {} }, keys.privateKey, continuity);
  assert.equal(continuity.sequence, 2);
  assert.equal(verifySignedBundle(second, keys.publicKey, first, keys.publicKey).valid, true);
  assert.throws(() => verifySignedBundle(second, keys.publicKey), /Previous bundle/);
});

test('requires the established key to authorize signing-key rotation', () => {
  const previous = generateKeyPairSync('ed25519'), next = generateKeyPairSync('ed25519');
  const first = createSignedBundle({ format: 'brasa-audit-evidence/v1', sections: {} }, previous.privateKey);
  const rotation = createRotationAuthorization(previous.privateKey, next.publicKey, '2026-09-11T12:00:00.000Z', 'Scheduled annual custodian rotation');
  const continuity = createContinuity(first, previous.publicKey, next.publicKey, rotation);
  const second = createSignedBundle({ format: 'brasa-audit-evidence/v1', sections: {} }, next.privateKey, continuity);
  assert.equal(verifySignedBundle(second, next.publicKey, first, previous.publicKey).valid, true);
  const forged = structuredClone(second); forged.continuity.rotation.reason = 'Attacker changed the rotation reason';
  assert.throws(() => verifySignedBundle(forged, next.publicKey, first, previous.publicKey), /digest mismatch/);
  const unauthorized = generateKeyPairSync('ed25519');
  const badRotation = createRotationAuthorization(unauthorized.privateKey, next.publicKey, '2026-09-11T12:00:00.000Z', 'Unauthorized custodian replacement');
  assert.throws(() => createContinuity(first, previous.publicKey, next.publicKey, badRotation), /does not match|invalid/);
});
