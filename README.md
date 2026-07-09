# brasa-business

**The Sector Directory — every business. Part of the BRASA federation.**

The `brasa.business` surface: the citizen-owned commerce operating system, and the front door for citizen signup. A main SPA plus standalone business-vertical apps, all single-file vanilla JS on Cloudflare Pages — **no build step**.

Business software on BRASA is **free** — now and always. There is no trial, no subscription, and no charge to start. A citizen signs up, receives their BRASA ID, and gets the operating system for their trade.

---

## Citizen signup (what the hero card does)

A light card sits in each vertical's hero, and `index.html` links to the "How to start" page where the signup card lives.

The flow:

- **Name + Phone + Date of Birth** → the account is created and a **BRASA ID** is issued. That's it — the citizen is in, and the free business software is theirs.

**Identity:** phone + DOB = the BRASA ID. One phone can carry several people (e.g. a mother and child) because the unique anchor is `HMAC(phone | dob)`. **The phone is never stored in plaintext.**

**Money:** BRASA touches zero. There is no signup fee. When a citizen later *runs* their business on BRASA, they are paid directly by their customers over **SINPE Móvil**, bank-to-bank — BRASA never sits in the funds path. BRASA only **records the sale** and issues the Hacienda **tiquete electrónico v4.4**, issued by the BRASA CR entity (the *emisor*), not by BRASA the platform.

---

## How the front end connects to the backend

Identity is minted through the shared signup logic in the **`brasa-signup`** Worker, so web and USSD/WhatsApp resolve to **one citizen**.

- **CORS:** the Worker allows the `brasa.business` origin via its `CONTRIBUTE_ORIGINS` var. Test on the deployed site, not a local file or preview URL.

---

## Invariants

- **SINPE only** for merchant sales. No Stripe, no Twilio, no processor. BRASA is never in the funds path.
- **phone + DOB = BRASA ID.** Phone stored only as HMAC — no plaintext, ever.
- **Free business software** — no trial, no subscription, no signup charge.
- Every merchant sale → Hacienda **tiquete electrónico v4.4**, issued by the BRASA CR entity (the *emisor*), not by BRASA the platform.
- Identity is minted only through the shared signup logic, so web and USSD/WhatsApp resolve to one citizen.

---

## Recent changes

- Internal navigation fixed — the index tiles and cross-page links now resolve to the real `business-*.html` filenames (no more 404s).
- **Pricing removed** — the $99/year contribution, the 14-day free trial, and the treasury split are gone. The signup card now reads **"Free Business Software"** with a **"Create my account"** action, and the confirmation simply shows the citizen's BRASA ID.
- "How to start" page: header nav links (Professions / Learn / Become a citizen) removed; hero subtitle removed; hero image changed to `how-to-start.jpg` (matching the education/government surfaces).
- Footer tagline shortened to **"Business, World Wide."** across all business pages.

---

*BRASA CR — Business, World Wide.*
