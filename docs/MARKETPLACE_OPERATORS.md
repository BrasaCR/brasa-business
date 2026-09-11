# Marketplace operator administration

Named operator access is administered locally through an authenticated Cloudflare CLI session. There is deliberately no public administrator endpoint.

Run commands from the BRASA Business repository. Every mutating command requires a bounded reason and writes an audit record that contains no credential, email address, phone number, IP address, or device information.

```text
npm run operator -- create --name "Operator name" --role reviewer --reason "Approved for marketplace review"
npm run operator -- invite BRA-OPERATOR-AB12CD34 --minutes 10 --reason "Initial access"
npm run operator -- list
npm run operator -- audit BRA-OPERATOR-AB12CD34
npm run operator -- role BRA-OPERATOR-AB12CD34 --role verifier --reason "Verification training complete"
npm run operator -- suspend BRA-OPERATOR-AB12CD34 --reason "Access review"
npm run operator -- resume BRA-OPERATOR-AB12CD34 --reason "Access review complete"
npm run operator -- request-admin BRA-OPERATOR-AB12CD34 --requested-by BRA-OPERATOR-AB12CD34 --reason "Administrative responsibilities assigned"
npm run operator -- approve-admin REQUEST-UUID --approved-by BRA-OPERATOR-CD34EF56 --reason "Independent approval completed"
npm run operator -- configure-governance --retention-days 730 --primary BRA-OPERATOR-AB12CD34 --backup BRA-OPERATOR-CD34EF56 --actor BRA-OPERATOR-AB12CD34 --reason "Annual security policy review"
npm run operator -- readiness
```

Roles are intentionally narrow: reviewers inspect queues and resolve reports; verifiers can also create and change provider records; administrators currently have the same application permissions as verifiers and exist for future administrative separation. Direct administrator creation and promotion are blocked. An active verifier must request their own elevation, and a different active verifier or administrator must approve the expiring request within 24 hours.

The invitation plaintext is shown once. Share it only through an approved secure channel. Identity stores its SHA-256 digest and the invitation expires after 10 minutes by default (configurable from 5 to 60 minutes). Exchanging it creates a 15-minute browser-memory session.

The staging Worker enforces the approved audit-retention period every day at 03:17 UTC. If no policy is configured, it performs no deletion. A malformed or sub-minimum policy fails closed without deleting anything. When configured, only provider, operator, and security audit events strictly older than the calculated 365–2555 day cutoff are removed; operational logs contain only the aggregate deletion count and cutoff.

Suspension is fail-closed: Business blocks the operator first, then Identity revokes every active session and removes unused invitations. Resuming access never restores old credentials; issue a fresh invitation afterward.

This tool currently targets the explicitly named staging databases only. It has no production mode. The `readiness` command always reports phishing-resistant authentication as incomplete because the one-time invitation flow is not phishing-resistant. Configuring a retention period and two emergency owners records governance intent but does not override that production blocker. Production activation requires identity-bound approval actors, phishing-resistant authentication, approved retention enforcement, and two documented emergency revocation owners.

BRASA Identity now contains an optional Cloudflare Access verification boundary. Business forwards the Access assertion only during session exchange; Identity verifies its signature, issuer, audience, expiry, and stable subject, then permanently binds that subject to the invited operator ID. Staging keeps this boundary disabled until a dedicated Access application and independently reviewed phishing-resistant policy are configured. The application does not infer phishing resistance from generic MFA.
