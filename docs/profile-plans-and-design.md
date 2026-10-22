# Profile, first-name discovery, and visual update

## Implemented in this branch

- Peach/mint gradient header and framed cards, cream surfaces, moss-green buttons and text, system typography. Navya's repository is a visual reference only; no application behavior was copied or replaced.
- Profile: year dropdown, optional 140-character traveler bio and MBTI, pace descriptions, daily rhythm, and stay preference. Extended profile drafts are saved on the device and included when saving the next plan.
- First-name plan discovery across breaks, with preference scores and an explicit public response whitelist. First names and MSBA year are shown at Steven’s request; email, MBTI type, bio and private notes are excluded before a match. Matching computes MBTI scores without returning the other person's type.
- Typed destinations, up to five; external official Google Maps search links and optional US query. This does not provide Places autocomplete/geocoding or automatically import map selections.
- Destination photo banners and their external image requests were removed at Steven’s request; cards focus on the destination, dates, budget and match information.
- Editable numeric budget drafts: zero can be cleared; leading zeros normalize; reversed/invalid ranges are rejected. A stable question component preserves input focus.
- Context-sensitive optional item tags and private notes. Tokyo does not offer car/tent tags. Real-trip notes remain hidden until mutual acceptance.
- Breaks ordered by date. A weekend offers this weekend and the next 12 Saturdays/Sundays, with the selected dates used by preset weekend plans. One weekend per plan; recurring or multi-weekend availability is not implemented.
- Save no longer waits for an AI proposal or match fetching. When shared credentials are absent, immediate device-only saves and explicit sample trips keep the prototype usable.
- Real plans use an atomic, idempotent two-person acceptance transaction. Chat and profile sharing stay locked until both accept. Real chat additionally requires a verified USC session; Continue is not identity verification.
- Saved plans/invitations view for both participants, plus device-local demonstration plans.

## Backend owner setup

Apply migrations 0001 and 0002 through the project's migration process. Migration 0002 adds profile details, acceptance tracking, the atomic decision function, and the stricter chat gate. Existing one-sided real acceptances are returned to pending status. Sample plans are explicitly demonstrations.

Configure server-only SUPABASE_SERVICE_ROLE_KEY and preferably a separate SESSION_SECRET (at least 32 characters). Prototype profile ownership uses a seven-day signed HttpOnly SameSite cookie, not a browser-provided email or profile ID. Existing profiles cannot be claimed just by typing their email. Verified authentication is required to recover access without the device cookie. Never expose these keys through VITE_ variables.

Real USC SSO still needs USC registration/approval and backend SSO configuration. Real chat needs verified sessions. LOVABLE_API_KEY enables the AI assistant and the restored optional AI plan merge; the merge has a five-second timeout, validates its output, and preserves the proposed destination/dates and counterproposal locks. Without that key, deterministic merge remains available. The assistant otherwise identifies itself as built-in app guidance. None of these credentials was available locally, and no cloud migrations were applied.

## Validation

TypeScript and production build pass. 30 automated tests include an actual PGlite PostgreSQL run of all migrations: first acceptance stays locked, duplicate acceptance stays locked, second acceptance opens access, outsiders/null actors/unverified users are rejected, and closing a plan revokes chat. Additional checks cover public-response privacy, editable budgets/focus, profile constraints, maps URLs and weekend/year-boundary dates.

Browser checked typed Tokyo destination, custom dates, clearing zero/0200 → 200, location-sensitive tags, immediate device-only save, ranked samples, locked chat before acceptance and sample chat after confirmation. Two real accounts on the cloud backend remain untested until the owner completes the configuration above.

## Personal Vercel deployment

Deploy the separate public repository `syeum1/tripmatch`, branch `main`, into Steven’s own Vercel account/project. Do not import Thomas’s repository or reuse his Vercel project. `vercel.json` installs the pinned pnpm version with the committed lockfile and uses the production build command. Dependency install scripts are disabled; the build uses the installed platform binaries. The Vite config selects Nitro’s Vercel preset only in Vercel builds; the existing Lovable build target remains unchanged. Server routes are emitted in `.vercel/output` alongside static assets.

The prototype runs in device-local/sample mode without server storage keys. Public client Supabase values already exist in the repository’s tracked `.env`; no service-role key is included. Enabling shared storage or real chat requires the backend setup above.

## Rechecked comparison with Thomas (October 22)

Compared current code against `thomas/main` (the original TanStack/Lovable app) and `thomas/tripmatch-nextjs` (the separate newer app). The original app's plan questions, ranked pair matching, proposal accept/counter/pass, itinerary and cost split remain. Its optional AI merge had been replaced by rules; it is restored with validation and a bounded wait. Required first-name entry replaces deriving a display name from email. First names remain on discovery, matches and accepted sample trips. Large destination photos are removed.

Group matching for 3–4 people, multiple-weekend availability and versioned proposals belong to the newer Next.js implementation; they were not removed from the selected starting app and have not been integrated here. Neither the original app nor the newer implementation supplies a working USC SSO integration automatically. The newer app's verified email flow is distinct from this requested no-email prototype Continue flow. Shared storage and AI are implemented but not connected on Steven's deployment.
