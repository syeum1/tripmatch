# Profile, anonymous discovery, and visual update

## Implemented in this branch

- Peach/mint gradient header and framed cards, cream surfaces, moss-green buttons and text, system typography. Navya's repository is a visual reference only; no application behavior was copied or replaced.
- Profile: year dropdown, optional 140-character traveler bio and MBTI, pace descriptions, daily rhythm, and stay preference. Extended profile drafts are saved on the device and included when saving the next plan.
- Anonymous plan discovery across breaks, with preference scores and an explicit public response whitelist. Names, email, year, MBTI type, bio and private notes are excluded before a match. Matching computes MBTI scores without returning the other person's type.
- Typed destinations, up to five; external official Google Maps search links and optional US query. This does not provide Places autocomplete/geocoding or automatically import map selections.
- Destination photographs from Wikimedia's free-image API, with source links and an honest unavailable fallback. Images need network access and a matching Wikipedia article.
- Editable numeric budget drafts: zero can be cleared; leading zeros normalize; reversed/invalid ranges are rejected. A stable question component preserves input focus.
- Context-sensitive optional item tags and private notes. Tokyo does not offer car/tent tags. Real-trip notes remain hidden until mutual acceptance.
- Breaks ordered by date. A weekend offers this weekend and the next 12 Saturdays/Sundays, with the selected dates used by preset weekend plans. One weekend per plan; recurring or multi-weekend availability is not implemented.
- Save no longer waits for an AI proposal or match fetching. When shared credentials are absent, immediate device-only saves and explicit sample trips keep the prototype usable.
- Real plans use an atomic, idempotent two-person acceptance transaction. Chat and profile sharing stay locked until both accept. Real chat additionally requires a verified USC session; Continue is not identity verification.
- Saved plans/invitations view for both participants, plus device-local demonstration plans.

## Backend owner setup

Apply migrations 0001 and 0002 through the project's migration process. Migration 0002 adds profile details, acceptance tracking, the atomic decision function, and the stricter chat gate. Existing one-sided real acceptances are returned to pending status. Sample plans are explicitly demonstrations.

Configure server-only SUPABASE_SERVICE_ROLE_KEY and preferably a separate SESSION_SECRET (at least 32 characters). Prototype profile ownership uses a seven-day signed HttpOnly SameSite cookie, not a browser-provided email or profile ID. Existing profiles cannot be claimed just by typing their email. Verified authentication is required to recover access without the device cookie. Never expose these keys through VITE_ variables.

Real USC SSO still needs USC registration/approval and backend SSO configuration. Real chat needs verified sessions. LOVABLE_API_KEY enables the AI assistant; otherwise the assistant identifies itself as built-in app guidance. None of these credentials was available locally, and no cloud migrations were applied.

## Validation

TypeScript and production build pass. 27 automated tests include an actual PGlite PostgreSQL run of all migrations: first acceptance stays locked, duplicate acceptance stays locked, second acceptance opens access, outsiders/null actors/unverified users are rejected, and closing a plan revokes chat. Additional checks cover public-response privacy, editable budgets/focus, profile constraints, maps URLs and weekend/year-boundary dates.

Browser checked typed Tokyo destination and image, custom dates, clearing zero/0200 → 200, location-sensitive tags, immediate device-only save, anonymous ranked samples, locked chat before acceptance and sample chat after confirmation. Two real accounts on the cloud backend remain untested until the owner completes the configuration above.

## Personal Vercel deployment

Deploy the separate private repository `syeum1/tripmatch`, branch `main`, into Steven’s own Vercel account/project. Do not import Thomas’s repository or reuse his Vercel project. `vercel.json` uses npm installation and the production build command. The Vite config selects Nitro’s Vercel preset only in Vercel builds; the existing Lovable build target remains unchanged. Server routes are emitted in `.vercel/output` alongside static assets.

The prototype runs in device-local/sample mode without server storage keys. Public client Supabase values already exist in the repository’s tracked `.env`; no service-role key is included. Enabling shared storage or real chat requires the backend setup above.
