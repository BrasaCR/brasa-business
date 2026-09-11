import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROLES = Object.freeze(['reviewer', 'verifier', 'administrator']);
const DISPLAY_ID = /^BRA-OPERATOR-[A-Z0-9-]{4,30}$/;
const BUSINESS_DB = 'brasa-business-marketplace-staging';
const IDENTITY_DB = 'brasa-identity-staging';
const wrangler = fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url));

export function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function validateDisplayId(value) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!DISPLAY_ID.test(normalized)) throw new Error('Display ID must look like BRA-OPERATOR-AB12CD34.');
  return normalized;
}

export function validateRole(value) {
  if (!ROLES.includes(value)) throw new Error(`Role must be one of: ${ROLES.join(', ')}.`);
  return value;
}

export function validateReason(value) {
  const normalized = String(value || '').trim();
  if (normalized.length < 3 || normalized.length > 500) throw new Error('Reason must contain 3–500 characters.');
  return normalized;
}

export function validateName(value) {
  const normalized = String(value || '').trim();
  if (normalized.length < 2 || normalized.length > 160) throw new Error('Name must contain 2–160 characters.');
  return normalized;
}

export function validateMinutes(value = '10') {
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 60) throw new Error('Invitation lifetime must be 5–60 minutes.');
  return minutes;
}

export function validateRetentionDays(value) {
  const days = Number(value);
  if (!Number.isInteger(days) || days < 365 || days > 2555) throw new Error('Audit retention must be 365–2555 days.');
  return days;
}

export function createInvitation() {
  const plaintext = randomBytes(48).toString('base64url');
  return { plaintext, digest: createHash('sha256').update(plaintext).digest('hex') };
}

export function createDisplayId() {
  return `BRA-OPERATOR-${randomUUID().slice(0, 8).toUpperCase()}`;
}

function parseResult(stdout) {
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed) || parsed.some(item => item.success === false)) throw new Error('Cloudflare rejected the database operation.');
  return parsed.flatMap(item => item.results || []);
}

export function createD1Executor({ run = execFileSync } = {}) {
  return (database, command) => parseResult(run(process.execPath, [wrangler, 'd1', 'execute', database, '--remote', '--json', '--command', command], { encoding: 'utf8' }));
}

function option(args, name, required = true) {
  const index = args.indexOf(`--${name}`);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (required && (!value || value.startsWith('--'))) throw new Error(`--${name} is required.`);
  return value;
}

function positional(args) {
  return args.find((value, index) => index > 0 && !value.startsWith('--') && !args[index - 1]?.startsWith('--'));
}

function auditSql(displayId, action, reason, details = {}) {
  return `INSERT INTO marketplace_operator_audit_events(id,display_id,action,reason,details_json) VALUES (${sqlText(randomUUID())},${sqlText(displayId)},${sqlText(action)},${sqlText(reason)},${sqlText(JSON.stringify(details))})`;
}

function securityAuditSql(action, subjectId, actorDisplayId, reason, details = {}) {
  return `INSERT INTO marketplace_security_audit_events(id,action,subject_id,actor_display_id,reason,details_json) VALUES (${sqlText(randomUUID())},${sqlText(action)},${sqlText(subjectId)},${sqlText(actorDisplayId)},${sqlText(reason)},${sqlText(JSON.stringify(details))})`;
}

function operatorRows(execute, displayId) {
  return execute(BUSINESS_DB, `SELECT display_id,name,role,status,created_at,updated_at FROM marketplace_operators WHERE display_id=${sqlText(displayId)} LIMIT 1`);
}

export function createOperatorAdmin({ execute = createD1Executor(), now = () => new Date() } = {}) {
  const requireOperator = displayId => {
    const rows = operatorRows(execute, displayId);
    if (rows.length !== 1) throw new Error(`Operator ${displayId} was not found.`);
    return rows[0];
  };

  return {
    create({ name, role, reason }) {
      const displayId = createDisplayId();
      name = validateName(name); role = validateRole(role); reason = validateReason(reason);
      if (role === 'administrator') throw new Error('Administrator access requires request-admin followed by approve-admin.');
      execute(BUSINESS_DB, `INSERT INTO marketplace_operators(display_id,name,role,status) VALUES (${sqlText(displayId)},${sqlText(name)},${sqlText(role)},'active'); ${auditSql(displayId, 'create', reason, { role })}`);
      return { displayId, name, role, status: 'active', next: `Issue a one-time invitation with: npm run operator -- invite ${displayId} --reason "..."` };
    },
    invite({ displayId, minutes, reason }) {
      displayId = validateDisplayId(displayId); minutes = validateMinutes(minutes); reason = validateReason(reason);
      const operator = requireOperator(displayId);
      if (operator.status !== 'active') throw new Error('Suspended operators cannot receive invitations.');
      const invitation = createInvitation(), id = randomUUID(), expiresAt = new Date(now().getTime() + minutes * 60_000).toISOString();
      execute(IDENTITY_DB, `INSERT INTO business_operator_invitations(id,code_hash,display_id,expires_at) VALUES (${sqlText(id)},${sqlText(invitation.digest)},${sqlText(displayId)},${sqlText(expiresAt)})`);
      try { execute(BUSINESS_DB, auditSql(displayId, 'invite', reason, { expiresAt })); }
      catch (error) { execute(IDENTITY_DB, `DELETE FROM business_operator_invitations WHERE id=${sqlText(id)}`); throw error; }
      return { displayId, invitation: invitation.plaintext, expiresAt, warning: 'Shown once. Share through an approved secure channel; BRASA stores only its hash.' };
    },
    list() {
      return execute(BUSINESS_DB, 'SELECT display_id,name,role,status,created_at,updated_at FROM marketplace_operators ORDER BY created_at DESC LIMIT 200');
    },
    audit({ displayId }) {
      displayId = validateDisplayId(displayId);
      return execute(BUSINESS_DB, `SELECT id,display_id,action,reason,details_json,actor,created_at FROM marketplace_operator_audit_events WHERE display_id=${sqlText(displayId)} ORDER BY created_at DESC LIMIT 200`);
    },
    role({ displayId, role, reason }) {
      displayId = validateDisplayId(displayId); role = validateRole(role); reason = validateReason(reason);
      if (role === 'administrator') throw new Error('Administrator access requires request-admin followed by approve-admin.');
      const current = requireOperator(displayId);
      if (current.role === role) throw new Error(`Operator already has the ${role} role.`);
      execute(BUSINESS_DB, `UPDATE marketplace_operators SET role=${sqlText(role)},updated_at=datetime('now') WHERE display_id=${sqlText(displayId)}; ${auditSql(displayId, 'role_change', reason, { from: current.role, to: role })}`);
      return { displayId, role, status: current.status };
    },
    suspend({ displayId, reason }) {
      displayId = validateDisplayId(displayId); reason = validateReason(reason);
      const current = requireOperator(displayId);
      if (current.status === 'suspended') throw new Error('Operator is already suspended.');
      execute(BUSINESS_DB, `UPDATE marketplace_operators SET status='suspended',updated_at=datetime('now') WHERE display_id=${sqlText(displayId)}; ${auditSql(displayId, 'suspend', reason)}`);
      execute(IDENTITY_DB, `UPDATE business_operator_sessions SET revoked_at=datetime('now') WHERE display_id=${sqlText(displayId)} AND revoked_at IS NULL; DELETE FROM business_operator_invitations WHERE display_id=${sqlText(displayId)} AND consumed_at IS NULL`);
      return { displayId, status: 'suspended', credentials: 'Active sessions revoked and unused invitations removed.' };
    },
    resume({ displayId, reason }) {
      displayId = validateDisplayId(displayId); reason = validateReason(reason);
      const current = requireOperator(displayId);
      if (current.status === 'active') throw new Error('Operator is already active.');
      execute(BUSINESS_DB, `UPDATE marketplace_operators SET status='active',updated_at=datetime('now') WHERE display_id=${sqlText(displayId)}; ${auditSql(displayId, 'resume', reason)}`);
      return { displayId, status: 'active', next: 'Issue a fresh one-time invitation; previous credentials remain invalid.' };
    },
    requestAdmin({ displayId, requestedBy, reason }) {
      displayId = validateDisplayId(displayId); requestedBy = validateDisplayId(requestedBy); reason = validateReason(reason);
      if (displayId !== requestedBy) throw new Error('The target operator must initiate their own administrator request.');
      const target = requireOperator(displayId);
      if (!['verifier','administrator'].includes(target.role)) throw new Error('Only an active verifier can request administrator access.');
      if (target.role === 'administrator') throw new Error('Operator is already an administrator.');
      const existing = execute(BUSINESS_DB, `SELECT id FROM marketplace_admin_role_requests WHERE target_display_id=${sqlText(displayId)} AND status='pending' AND expires_at>datetime('now') LIMIT 1`);
      if (existing.length) throw new Error('An active administrator request already exists.');
      const requestId = randomUUID(), expiresAt = new Date(now().getTime() + 24 * 60 * 60_000).toISOString();
      execute(BUSINESS_DB, `INSERT INTO marketplace_admin_role_requests(id,target_display_id,requested_by,reason,expires_at) VALUES (${sqlText(requestId)},${sqlText(displayId)},${sqlText(requestedBy)},${sqlText(reason)},${sqlText(expiresAt)}); ${securityAuditSql('admin_requested', requestId, requestedBy, reason, { targetDisplayId: displayId, expiresAt })}`);
      return { requestId, displayId, status: 'pending', expiresAt, next: 'A different active verifier or administrator must approve this request.' };
    },
    approveAdmin({ requestId, approvedBy, reason }) {
      if (!/^[0-9a-f-]{36}$/i.test(String(requestId || ''))) throw new Error('A valid request ID is required.');
      approvedBy = validateDisplayId(approvedBy); reason = validateReason(reason);
      const approver = requireOperator(approvedBy);
      if (!['verifier','administrator'].includes(approver.role)) throw new Error('Approver must be an active verifier or administrator.');
      const requests = execute(BUSINESS_DB, `SELECT id,target_display_id,requested_by,status,expires_at FROM marketplace_admin_role_requests WHERE id=${sqlText(requestId)} LIMIT 1`);
      if (requests.length !== 1) throw new Error('Administrator request was not found.');
      const request = requests[0];
      if (request.status !== 'pending' || Date.parse(request.expires_at) <= now().getTime()) throw new Error('Administrator request is no longer active.');
      if (request.requested_by === approvedBy) throw new Error('The approver must be different from the requester.');
      requireOperator(request.target_display_id);
      execute(BUSINESS_DB, `UPDATE marketplace_admin_role_requests SET status='applied',approved_by=${sqlText(approvedBy)},approved_at=datetime('now') WHERE id=${sqlText(requestId)} AND status='pending'; UPDATE marketplace_operators SET role='administrator',updated_at=datetime('now') WHERE display_id=${sqlText(request.target_display_id)} AND status='active'; ${auditSql(request.target_display_id, 'role_change', reason, { from: 'verifier', to: 'administrator', requestId })}; ${securityAuditSql('admin_approved', requestId, approvedBy, reason, { targetDisplayId: request.target_display_id })}`);
      return { requestId, displayId: request.target_display_id, role: 'administrator', approvedBy };
    },
    configureGovernance({ retentionDays, primary, backup, actor, reason }) {
      retentionDays = validateRetentionDays(retentionDays); primary = validateDisplayId(primary); backup = validateDisplayId(backup); actor = validateDisplayId(actor); reason = validateReason(reason);
      if (primary === backup) throw new Error('Primary and backup emergency owners must be different.');
      requireOperator(primary); requireOperator(backup);
      const policyActor = requireOperator(actor);
      if (policyActor.role !== 'administrator') throw new Error('Only an active administrator can configure security governance.');
      execute(BUSINESS_DB, `UPDATE marketplace_security_governance SET audit_retention_days=${retentionDays},emergency_primary_display_id=${sqlText(primary)},emergency_backup_display_id=${sqlText(backup)},policy_reason=${sqlText(reason)},reviewed_at=datetime('now'),updated_at=datetime('now') WHERE id=1; ${securityAuditSql('governance_updated', 'marketplace-security-governance', actor, reason, { retentionDays, primary, backup })}`);
      return { auditRetentionDays: retentionDays, emergencyOwners: { primary, backup }, phishingResistantAuthentication: false };
    },
    readiness() {
      const policy = execute(BUSINESS_DB, 'SELECT audit_retention_days,emergency_primary_display_id,emergency_backup_display_id,reviewed_at FROM marketplace_security_governance WHERE id=1')[0] || {};
      const owners = policy.emergency_primary_display_id && policy.emergency_backup_display_id ? execute(BUSINESS_DB, `SELECT count(*) AS count FROM marketplace_operators WHERE display_id IN (${sqlText(policy.emergency_primary_display_id)},${sqlText(policy.emergency_backup_display_id)}) AND status='active'`)[0]?.count === 2 : false;
      const checks = { dualApprovalForAdministrator: true, auditRetentionPolicy: Number(policy.audit_retention_days) >= 365, twoActiveEmergencyOwners: owners, phishingResistantAuthentication: false };
      return { environment: 'staging', productionReady: Object.values(checks).every(Boolean), checks, reviewedAt: policy.reviewed_at || null };
    }
  };
}

export async function main(args = process.argv.slice(2), admin = createOperatorAdmin()) {
  const [command] = args;
  let result;
  if (command === 'create') result = admin.create({ name: option(args, 'name'), role: option(args, 'role'), reason: option(args, 'reason') });
  else if (command === 'invite') result = admin.invite({ displayId: positional(args), minutes: option(args, 'minutes', false), reason: option(args, 'reason') });
  else if (command === 'list') result = admin.list();
  else if (command === 'audit') result = admin.audit({ displayId: positional(args) });
  else if (command === 'role') result = admin.role({ displayId: positional(args), role: option(args, 'role'), reason: option(args, 'reason') });
  else if (command === 'suspend') result = admin.suspend({ displayId: positional(args), reason: option(args, 'reason') });
  else if (command === 'resume') result = admin.resume({ displayId: positional(args), reason: option(args, 'reason') });
  else if (command === 'request-admin') result = admin.requestAdmin({ displayId: positional(args), requestedBy: option(args, 'requested-by'), reason: option(args, 'reason') });
  else if (command === 'approve-admin') result = admin.approveAdmin({ requestId: positional(args), approvedBy: option(args, 'approved-by'), reason: option(args, 'reason') });
  else if (command === 'configure-governance') result = admin.configureGovernance({ retentionDays: option(args, 'retention-days'), primary: option(args, 'primary'), backup: option(args, 'backup'), actor: option(args, 'actor'), reason: option(args, 'reason') });
  else if (command === 'readiness') result = admin.readiness();
  else throw new Error('Use: create, invite, list, audit, role, suspend, resume, request-admin, approve-admin, configure-governance, or readiness.');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(`Operator administration failed: ${error.message}\n`); process.exitCode = 1; });
}
