import { randomUUID } from 'node:crypto';
import { createD1Executor, createOperatorAdmin, sqlText } from './marketplace-operator.mjs';

const execute = createD1Executor();
const admin = createOperatorAdmin({ execute });
let displayId;

try {
  const created = admin.create({ name: 'Automated staging administrator fixture', role: 'reviewer', reason: 'Verify operator lifecycle tooling' });
  displayId = created.displayId;
  const invited = admin.invite({ displayId, minutes: 5, reason: 'Verify one-time invitation creation' });
  if (!invited.invitation || invited.invitation.length < 60) throw new Error('Invitation was not created.');

  execute('brasa-identity-staging', `INSERT INTO business_operator_sessions(id,token_hash,display_id,expires_at) VALUES (${sqlText(randomUUID())},${sqlText('a'.repeat(64))},${sqlText(displayId)},${sqlText(new Date(Date.now() + 900_000).toISOString())})`);
  admin.role({ displayId, role: 'verifier', reason: 'Verify role transition' });
  admin.suspend({ displayId, reason: 'Verify fail-closed suspension' });

  const blocked = admin.list().find(item => item.display_id === displayId);
  if (blocked?.status !== 'suspended' || blocked?.role !== 'verifier') throw new Error('Business authorization state was not suspended.');
  const identity = execute('brasa-identity-staging', `SELECT (SELECT count(*) FROM business_operator_sessions WHERE display_id=${sqlText(displayId)} AND revoked_at IS NULL) active_sessions,(SELECT count(*) FROM business_operator_invitations WHERE display_id=${sqlText(displayId)} AND consumed_at IS NULL) unused_invitations`)[0];
  if (identity?.active_sessions !== 0 || identity?.unused_invitations !== 0) throw new Error('Identity credentials remained active after suspension.');

  admin.resume({ displayId, reason: 'Complete automated lifecycle verification' });
  const actions = admin.audit({ displayId }).map(item => item.action);
  for (const action of ['create', 'invite', 'role_change', 'suspend', 'resume']) if (!actions.includes(action)) throw new Error(`Missing ${action} audit event.`);
  if (JSON.stringify(admin.audit({ displayId })).includes(invited.invitation)) throw new Error('Audit trail contained a plaintext invitation.');

  process.stdout.write(`${JSON.stringify({ workflow: 'operator-administration', actions: actions.length, credentialsRevoked: true, status: 'passed' })}\n`);
} finally {
  if (displayId) {
    execute('brasa-identity-staging', `DELETE FROM business_operator_sessions WHERE display_id=${sqlText(displayId)}; DELETE FROM business_operator_invitations WHERE display_id=${sqlText(displayId)}`);
    execute('brasa-business-marketplace-staging', `DELETE FROM marketplace_operator_audit_events WHERE display_id=${sqlText(displayId)}; DELETE FROM marketplace_operators WHERE display_id=${sqlText(displayId)}`);
  }
}
