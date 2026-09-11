import test from 'node:test';
import assert from 'node:assert/strict';
import { createInvitation, createOperatorAdmin, sqlText, validateDisplayId, validateMinutes, validateReason, validateRetentionDays, validateRole } from '../scripts/marketplace-operator.mjs';

test('validates the bounded operator administration inputs', () => {
  assert.equal(validateDisplayId('bra-operator-ab12cd34'), 'BRA-OPERATOR-AB12CD34');
  assert.equal(validateRole('verifier'), 'verifier');
  assert.equal(validateReason('Reviewed by operations'), 'Reviewed by operations');
  assert.equal(validateMinutes('15'), 15);
  assert.equal(validateRetentionDays('730'), 730);
  assert.throws(() => validateRole('owner'));
  assert.throws(() => validateMinutes('61'));
  assert.throws(() => validateRetentionDays('364'));
  assert.throws(() => validateReason('no'));
});

test('blocks direct administrator grants', () => {
  const admin = createOperatorAdmin({ execute: () => [] });
  assert.throws(() => admin.create({ name: 'Test operator', role: 'administrator', reason: 'Direct grant attempt' }), /requires request-admin/);
});

test('requires a different second operator to approve administrator access', () => {
  const calls = [], operators = {
    'BRA-OPERATOR-AAA11111': { display_id: 'BRA-OPERATOR-AAA11111', name: 'Target', role: 'verifier', status: 'active' },
    'BRA-OPERATOR-BBB22222': { display_id: 'BRA-OPERATOR-BBB22222', name: 'Approver', role: 'verifier', status: 'active' }
  };
  const execute = (database, command) => {
    calls.push({ database, command });
    if (command.startsWith('SELECT display_id')) return [operators[command.match(/'BRA-OPERATOR-[A-Z0-9]+'/)?.[0]?.slice(1, -1)]].filter(Boolean);
    if (command.startsWith('SELECT id FROM marketplace_admin')) return [];
    if (command.startsWith('SELECT id,target_display_id')) return [{ id: '11111111-1111-4111-8111-111111111111', target_display_id: 'BRA-OPERATOR-AAA11111', requested_by: 'BRA-OPERATOR-AAA11111', status: 'pending', expires_at: '2026-09-12T12:00:00.000Z' }];
    return [];
  };
  const admin = createOperatorAdmin({ execute, now: () => new Date('2026-09-11T12:00:00Z') });
  const request = admin.requestAdmin({ displayId: 'BRA-OPERATOR-AAA11111', requestedBy: 'BRA-OPERATOR-AAA11111', reason: 'Administrative responsibility' });
  assert.equal(request.status, 'pending');
  assert.throws(() => admin.approveAdmin({ requestId: '11111111-1111-4111-8111-111111111111', approvedBy: 'BRA-OPERATOR-AAA11111', reason: 'Self approval' }), /different/);
  const approved = admin.approveAdmin({ requestId: '11111111-1111-4111-8111-111111111111', approvedBy: 'BRA-OPERATOR-BBB22222', reason: 'Independent approval' });
  assert.equal(approved.role, 'administrator');
  assert.match(calls.at(-1).command, /role='administrator'/);
});

test('requires both configured emergency owners and revokes Business before Identity', () => {
  const calls = [], operators = {
    'BRA-OPERATOR-AAA11111': { display_id: 'BRA-OPERATOR-AAA11111', role: 'administrator', status: 'active' },
    'BRA-OPERATOR-BBB22222': { display_id: 'BRA-OPERATOR-BBB22222', role: 'reviewer', status: 'active' },
    'BRA-OPERATOR-CCC33333': { display_id: 'BRA-OPERATOR-CCC33333', role: 'verifier', status: 'active' }
  };
  let pending;
  const execute = (database, command) => {
    calls.push({ database, command });
    if (command.startsWith('SELECT display_id')) return [operators[command.match(/'BRA-OPERATOR-[A-Z0-9]+'/)?.[0]?.slice(1, -1)]].filter(Boolean);
    if (command.startsWith('SELECT emergency_primary')) return [{ primaryId: 'BRA-OPERATOR-AAA11111', backupId: 'BRA-OPERATOR-BBB22222' }];
    if (command.startsWith('SELECT id FROM marketplace_emergency')) return [];
    if (command.startsWith('SELECT id,target_display_id AS targetId')) return [pending];
    return [];
  };
  const admin = createOperatorAdmin({ execute, now: () => new Date('2026-09-11T12:00:00Z') });
  const started = admin.emergencyStart({ displayId: 'BRA-OPERATOR-CCC33333', actor: 'BRA-OPERATOR-AAA11111', reason: 'Suspected compromise' });
  pending = { id: started.requestId, targetId: started.displayId, initiatedBy: 'BRA-OPERATOR-AAA11111', status: 'pending', expiresAt: started.expiresAt };
  assert.throws(() => admin.emergencyConfirm({ requestId: started.requestId, actor: 'BRA-OPERATOR-AAA11111', reason: 'Self confirmation' }), /different/);
  const result = admin.emergencyConfirm({ requestId: started.requestId, actor: 'BRA-OPERATOR-BBB22222', reason: 'Independent confirmation' });
  assert.equal(result.status, 'suspended');
  const businessMutation = calls.find(call => call.command.includes("status='executed'"));
  const identityMutation = calls.find(call => call.database === 'brasa-identity-staging');
  assert.ok(businessMutation); assert.ok(identityMutation);
  assert.ok(calls.indexOf(businessMutation) < calls.indexOf(identityMutation));
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
