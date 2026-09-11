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
  else throw new Error('Use: create, invite, list, audit, role, suspend, or resume.');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { process.stderr.write(`Operator administration failed: ${error.message}\n`); process.exitCode = 1; });
}
