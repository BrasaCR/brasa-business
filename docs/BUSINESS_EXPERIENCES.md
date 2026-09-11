# BRASA Business-powered experiences

The public opportunity service maps human capabilities to existing BRASA Business pathways. It does not infer a learner profile and receives no GovID, credential, progress, school, or membership data. A visitor chooses a capability and optional country; the same public query can be used anonymously by Education, World, Government, or third-party widgets.

These records are pathways into business categories, not job listings, endorsements, certifications, or promises of income. Later marketplace or employer records must remain separately governed and must provide provenance, verification state, geography, expiry, and reporting mechanisms before appearing through this contract.

## Governed provider registry

`GET /api/v1/providers` publishes only provider records that an operator has explicitly marked `verified` and whose verification has not expired. Queries are bounded to 50 records and may filter by category, capability, and two-letter country code. Every public record includes its source label and URL, verification and expiry times, and a report path. "Verified" means that BRASA checked the cited source; it is not an endorsement, safety guarantee, or promise of outcomes.

`POST /api/v1/providers/{id}/reports` accepts one category (`inaccurate`, `closed`, `unsafe`, `misleading`, `expired`, or `other`). It intentionally accepts no free text, reporter identity, contact details, or IP-derived fields. A report enters an operator review queue and does not automatically remove a record. Operators may suspend, expire, or reject a provider after review.

The staging registry starts empty. No real provider is published until its authority, provenance, expiry, consent/legal basis, and responsible reviewer are established. The database is staging-only and separate from learner, identity, school, credential, government, and analytics stores.

`GET /api/v1/experiences/{pathwayId}?locale=en` turns an existing category into a four-step public action experience: understand, choose, begin, and review earning considerations. English and Spanish presentation are supported, with safe English fallback for other valid locales. Responses are offline-eligible and link only to existing BRASA Business pages. They contain no inferred profile, progress record, application, credential, eligibility determination, job listing, customer lead, or income projection.

Staging uses the separately named `brasa-business-staging` Worker. Its manual GitHub workflow requires a protected staging environment, tests and packages before deployment, and smoke-tests the staged health and opportunity endpoints. No production deployment command is included.
