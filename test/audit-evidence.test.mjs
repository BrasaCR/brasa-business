import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import test from 'node:test';
import { canonicalJson, collectEvidence, createSignedBundle, evidenceDigest, verifySignedBundle } from '../scripts/audit-evidence.mjs';

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
