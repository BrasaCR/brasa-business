import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitation, createOperatorAdmin, sqlText, validateDisplayId, validateMinutes, validateReason, validateRole } from '../scripts/marketplace-operator.mjs';

test('validates the bounded operator administration inputs', () => {
  assert.equal(validateDisplayId('bra-operator-ab12cd34'), 'BRA-OPERATOR-AB12CD34');
  assert.equal(validateRole('verifier'), 'verifier');
  assert.equal(validateReason('Reviewed by operations'), 'Reviewed by operations');
  assert.equal(validateMinutes('15'), 15);
  assert.throws(() => validateRole('owner'));
  assert.throws(() => validateMinutes('61'));
  assert.throws(() => validateReason('no'));
});

test('creates opaque invitations and stores a distinct SHA-256 digest', () => {
  const invitation = createInvitation();
  assert.match(invitation.plaintext, /^[A-Za-z0-9_-]{64}$/);
  assert.match(invitation.digest, /^[a-f0-9]{64}$/);
  assert.notEqual(invitation.plaintext, invitation.digest);
});

test('escapes SQL text rather than interpolating apostrophes', () => {
  assert.equal(sqlText("O'Brien"), "'O''Brien'");
});

test('suspends in Business before revoking Identity credentials', () => {
  const calls = [];
  const execute = (database, command) => {
    calls.push({ database, command });
    if (command.startsWith('SELECT display_id')) return [{ display_id: 'BRA-OPERATOR-AB12CD34', name: 'Test', role: 'reviewer', status: 'active' }];
    return [];
  };
  const result = createOperatorAdmin({ execute }).suspend({ displayId: 'BRA-OPERATOR-AB12CD34', reason: 'Access review' });
  assert.equal(result.status, 'suspended');
  assert.equal(calls[1].database, 'brasa-business-marketplace-staging');
  assert.match(calls[1].command, /status='suspended'/);
  assert.equal(calls[2].database, 'brasa-identity-staging');
  assert.match(calls[2].command, /revoked_at=datetime\('now'\)/);
});

test('invitation audit excludes plaintext credentials and contact fields', () => {
  const calls = [];
  const execute = (database, command) => {
    calls.push({ database, command });
    if (command.startsWith('SELECT display_id')) return [{ display_id: 'BRA-OPERATOR-AB12CD34', name: 'Test', role: 'reviewer', status: 'active' }];
    return [];
  };
  const result = createOperatorAdmin({ execute, now: () => new Date('2026-09-11T12:00:00Z') }).invite({ displayId: 'BRA-OPERATOR-AB12CD34', minutes: 10, reason: 'Initial access' });
  const audit = calls.find(call => call.command.includes("'invite'"));
  assert.ok(audit);
  assert.equal(audit.command.includes(result.invitation), false);
  assert.doesNotMatch(audit.command, /email|phone|token/i);
});
