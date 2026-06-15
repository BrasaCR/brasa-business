The brasa.business surface: the citizen-owned commerce operating system, and
the front door for citizen signup. A main SPA plus standalone business-vertical
apps, all single-file vanilla JS on Cloudflare Pages (no build step). Every
vertical hero carries the $99/year business signup card.


The citizen signup (what the card does)

A light card sits in each vertical's hero (and index.html has a header
"Become a citizen" button → #join). The flow:


Name + Phone + Date of Birth → a 14-day free trial begins, and a BRASA ID is issued.
"Start my service now" (or day 14) → the $99/year SINPE payment screen appears.
The citizen pays by SINPE Móvil, bank-to-bank.


Identity: phone + DOB = the BRASA ID. One phone can carry several people
(e.g. mother and child) because the unique anchor is HMAC(phone | dob). The
phone is never stored in plaintext.

Money: BRASA touches zero. The $99 is the citizen's own SINPE push; BRASA
records it and, on settlement, issues the Hacienda tiquete electrónico v4.4.
The contribution divides 80 / 16 / 3 / 1 — 96% to the Swiss Stiftungs
(Citizens 80% + Planet 16%), 4% on SINPE (Operating 3% + Founder 1%). The split
is treasury policy applied after collection, shown to the citizen for transparency.


How the front end connects to the backend

The collecting account is a row in pay_destinations:


CONTRIB — the real account (set on bank day, verified=1)
CONTRIB-TEST — your own SINPE number, for demos


CORS: the Worker allows the brasa.business origin via its CONTRIBUTE_ORIGINS
var. Test on the deployed site, not a local file or preview URL.


Config you actually touch

Near the top of each page's script:




Launch (bank day)

# 1. drop in the real SINPE number and open the gate
wrangler d1 execute brasa-govid --remote --command="UPDATE pay_destinations SET account='<SINPE number>', verified=1 WHERE code='CONTRIB'"


Change JOIN_CODE from "CONTRIB-TEST" to "CONTRIB" in each page, redeploy.


Verify any time: curl https://brasa-signup.richard-bad.workers.dev/trial/ready
→ ready_for_live: true when the number is in.





SINPE only. No Stripe, no Twilio, no processor. BRASA is never in the funds path.
phone + DOB = BRASA ID. Phone stored only as HMAC; no plaintext, ever.
Split is fixed 80/16/3/1 (96% Switzerland / 4% SINPE). Undivided; no Operating Partner Amendment.
Every charge → Hacienda tiquete v4.4, issued by the BRASA CR entity (the emisor), not by BRASA the platform.
Identity is minted only through the shared signup logic, so web and USSD/WhatsApp resolve to one citizen.
