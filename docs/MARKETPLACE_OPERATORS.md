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
```

Roles are intentionally narrow: reviewers inspect queues and resolve reports; verifiers can also create and change provider records; administrators currently have the same application permissions as verifiers and exist for future administrative separation.

The invitation plaintext is shown once. Share it only through an approved secure channel. Identity stores its SHA-256 digest and the invitation expires after 10 minutes by default (configurable from 5 to 60 minutes). Exchanging it creates a 15-minute browser-memory session.

Suspension is fail-closed: Business blocks the operator first, then Identity revokes every active session and removes unused invitations. Resuming access never restores old credentials; issue a fresh invitation afterward.

This tool currently targets the explicitly named staging databases only. It has no production mode. Before production activation, require phishing-resistant authentication, dual approval for administrator grants, an approved audit-retention policy, and a documented emergency revocation owner.
