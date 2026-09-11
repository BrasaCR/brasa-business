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
npm run operator -- emergency-start BRA-OPERATOR-EF56GH78 --actor BRA-OPERATOR-AB12CD34 --reason "Suspected credential compromise"
npm run operator -- emergency-confirm REQUEST-UUID --actor BRA-OPERATOR-CD34EF56 --reason "Independent incident confirmation"
```

Roles are intentionally narrow: reviewers inspect queues and resolve reports; verifiers can also create and change provider records; administrators currently have the same application permissions as verifiers and exist for future administrative separation. Direct administrator creation and promotion are blocked. An active verifier must request their own elevation, and a different active verifier or administrator must approve the expiring request within 24 hours.

The invitation plaintext is shown once. Share it only through an approved secure channel. Identity stores its SHA-256 digest and the invitation expires after 10 minutes by default (configurable from 5 to 60 minutes). Exchanging it creates a 15-minute browser-memory session.

The staging Worker enforces the approved audit-retention period every day at 03:17 UTC. If no policy is configured, it performs no deletion. A malformed or sub-minimum policy fails closed without deleting anything. When configured, only provider, operator, and security audit events strictly older than the calculated 365–2555 day cutoff are removed; operational logs contain only the aggregate deletion count and cutoff.

### Signed audit evidence

Audit evidence remains local-only. Export it with an offline Ed25519 signing key, then verify the archived bundle with the corresponding public key:

```text
npm run audit:evidence -- export --output PATH-OUTSIDE-THE-REPOSITORY/audit.json --private-key PATH-TO-OFFLINE-PRIVATE-KEY
npm run audit:evidence -- verify --bundle PATH-OUTSIDE-THE-REPOSITORY/audit.json --public-key PATH-TO-PUBLIC-KEY
```

The export contains seven explicitly ordered governance sections, including the current policy snapshot, plus a canonical SHA-256 digest, an Ed25519 signature, and the public-key fingerprint. It refuses to overwrite an existing bundle. The private key and JWT/session credentials are never included. Store the private key outside the repository with access restricted to the designated evidence custodian; distribute and independently archive the public-key fingerprint. Without an independently retained public key or fingerprint, the bundle is only self-consistent and should not be described as tamper-evident.

For every later export, link it to the immediately preceding bundle. With an unchanged signing key, add `--previous-bundle PREVIOUS.json --previous-public-key CURRENT-PUBLIC.pem` to `export` and `verify`. For a key change, export also requires `--previous-private-key OLD-PRIVATE.pem --rotation-reason "Scheduled custodian rotation"`; verification uses the new public key plus the preceding bundle and old public key. The resulting continuity record includes a monotonically increasing sequence, the preceding bundle and evidence digests, and the preceding fingerprint. A key change additionally contains an authorization signed by the established old key. Archive every bundle and public key: verification proves the immediate link, while the archive preserves the full chain.

#### Compromised signing key

Do not use ordinary rotation when the established signing key may be compromised. Freeze evidence exports, preserve the last independently verified bundle, open an incident record, and remove access to the suspected key. Two previously designated recovery custodians must then authorize a successor trust root with distinct offline Ed25519 keys:

```text
npm run audit:evidence -- recover-root --output RECOVERED.json --private-key SUCCESSOR-PRIVATE.pem --last-trusted-bundle LAST-TRUSTED.json --compromised-public-key COMPROMISED-PUBLIC.pem --recovery-private-key-a CUSTODIAN-A-PRIVATE.pem --recovery-private-key-b CUSTODIAN-B-PRIVATE.pem --incident INC-YYYY-NNNN --recovery-reason "Compromised signing key formally retired"
npm run audit:evidence -- verify-recovery --bundle RECOVERED.json --public-key SUCCESSOR-PUBLIC.pem --last-trusted-bundle LAST-TRUSTED.json --compromised-public-key COMPROMISED-PUBLIC.pem --recovery-public-key-a CUSTODIAN-A-PUBLIC.pem --recovery-public-key-b CUSTODIAN-B-PUBLIC.pem
```

The recovery authorization binds the incident ID, last trusted bundle and evidence digests, compromised fingerprint, successor fingerprint, timestamp, and reason. Both custodians sign the same canonical declaration. The recovered bundle starts a new trust root signed by the successor key; retain it alongside the terminated chain rather than presenting the two as uninterrupted. Publish the incident ID, successor fingerprint, and recovery-custodian fingerprints through an independently controlled channel. After verification, destroy or quarantine all usable copies of the compromised key according to the incident policy. Never place signing or recovery private keys in the repository, Cloudflare Worker variables, logs, tickets, or chat.

Suspension is fail-closed: Business blocks the operator first, then Identity revokes every active session and removes unused invitations. Resuming access never restores old credentials; issue a fresh invitation afterward.

Emergency revocation requires the two configured owners. One owner initiates a request for a non-owner operator; the other must confirm within 15 minutes. Confirmation suspends Business authorization first and then revokes Identity credentials. Both decisions receive separate immutable events. Emergency owners cannot revoke themselves through this workflow because that would defeat two-person control; use the documented Cloudflare break-glass procedure for a compromised owner.

This tool currently targets the explicitly named staging databases only. It has no production mode. The `readiness` command always reports phishing-resistant authentication as incomplete because the one-time invitation flow is not phishing-resistant. Configuring a retention period and two emergency owners records governance intent but does not override that production blocker. Production activation requires identity-bound approval actors, phishing-resistant authentication, approved retention enforcement, and two documented emergency revocation owners.

BRASA Identity now contains an optional Cloudflare Access verification boundary. Business forwards the Access assertion only during session exchange; Identity verifies its signature, issuer, audience, expiry, and stable subject, then permanently binds that subject to the invited operator ID. Staging keeps this boundary disabled until a dedicated Access application and independently reviewed phishing-resistant policy are configured. The application does not infer phishing resistance from generic MFA.
