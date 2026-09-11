# BRASA Business-powered experiences

The public opportunity service maps human capabilities to existing BRASA Business pathways. It does not infer a learner profile and receives no GovID, credential, progress, school, or membership data. A visitor chooses a capability and optional country; the same public query can be used anonymously by Education, World, Government, or third-party widgets.

These records are pathways into business categories, not job listings, endorsements, certifications, or promises of income. Later marketplace or employer records must remain separately governed and must provide provenance, verification state, geography, expiry, and reporting mechanisms before appearing through this contract.

`GET /api/v1/experiences/{pathwayId}?locale=en` turns an existing category into a four-step public action experience: understand, choose, begin, and review earning considerations. English and Spanish presentation are supported, with safe English fallback for other valid locales. Responses are offline-eligible and link only to existing BRASA Business pages. They contain no inferred profile, progress record, application, credential, eligibility determination, job listing, customer lead, or income projection.

Staging uses the separately named `brasa-business-staging` Worker. Its manual GitHub workflow requires a protected staging environment, tests and packages before deployment, and smoke-tests the staged health and opportunity endpoints. No production deployment command is included.
