# Consciousness License

The Bureau of Consciousness Licensing: a satirical examination and verifiable license for informed discussion of consciousness. Built with **Cloudflare Workers + D1**.

**Live app: [consciousnesslicense.com](https://consciousnesslicense.com/).** Cloudflare Workers serves the app with production D1 and daily cleanup configured.

`wrangler.jsonc` keeps the all-zero database ID for local development and a separate `production` environment for the real D1 database. Local licenses remain in the local emulator; they are not copied into production. Local preview URLs in certificates are only local URLs.

## Run locally

Requires Node **22.18+** (Node 24 LTS recommended) and npm. All runtime application code uses Web APIs; dependencies are development/test tools.

```sh
npm ci
npm run db:migrate
npm run dev
```

Open `http://127.0.0.1:8787`. Wrangler retains local D1 data in `.wrangler/state/` across restarts. Keep that directory to keep local licenses. No Cloudflare login is needed for local development.

If your environment restricts home-directory writes, set `WRANGLER_LOG_PATH=/tmp/consciousness-wrangler-logs`. The local runtime needs permission to bind loopback sockets. Set `WRANGLER_SEND_METRICS=false` to opt out of CLI telemetry.

## Product behavior

- Immediate examination, no signup: 15 questions, one from each of 15 topic groups in a 30-question bank. Four shuffled options each, 12 correct required, no countdown.
- A sourced, position-neutral field guide covers the material. Results include explanations, guide anchors, and source links. Retries are allowed, subject to short abuse-control limits.
- Passing issues an anonymous license immediately, with a short ceremony. A handle may be self-declared. Verification requires publishing a prepared public X post and submitting its URL. Verified licenses publish the account ID, handle at verification, verification date, and proof-post link. A license can be refreshed with a new post from the same account or made anonymous again; it cannot be transferred to another account. Previously completed verifications remain valid. Handles are not reserved.
- Permanent `/license/<random-id>` pages read D1 and include server-rendered sharing metadata. They do not expose scores, failed attempts, or ownership secrets.
- Download a personalized 1600 × 1600 square PNG, copy the permanent URL, or use native sharing where supported. The browser rasterizes an authoritative server-rendered SVG; no image-generation or AI service runs at runtime.
- The download is designed for a single-image phone feed: large title, bearer, certification, and bureau address, with the full permanent record URL retained below. Share the PNG together with the URL; a URL printed in an uploaded image is not a clickable link. The on-page certificate, home-page specimen, and download share the same SVG artwork.
- The license certifies that a passing submission produced an issuance record. Optional X verification additionally certifies control of the recorded account at verification time. It does not certify who took the exam, lack of assistance, or a philosophical position.
- Responsive layout, semantic radio groups and labels, keyboard focus, reduced-motion support, and readable static pages without JavaScript. The exam and optional personalization require JavaScript. Browser storage is optional; the private cookie is necessary for the exam.

## Contributions

Corrections and improvements to the questions, explanations, and field guide are welcome through pull requests. These live in `src/content.ts`; general FAQ and page copy live in `src/render.ts`. Include a reliable source for factual or philosophical corrections and preserve the position-neutral approach: understanding an argument does not require endorsing its conclusion.

The question bank and answer keys are public. The examination supports open-book study; it does not claim to prevent looking up answers. The server still grades submissions and controls issuance.

The repository contains application source and schema migrations, not database contents, browser cookies, or deployment credentials. Cloudflare account and database IDs in the configuration are resource identifiers, not credentials.

## Implementation

| File | Responsibility |
| --- | --- |
| `src/content.ts` | Sourced guide, question bank, balanced selection and randomization |
| `src/worker.ts` | Routing, server grading, issuance, authorization, limits, cleanup |
| `src/post-verification.ts` | Submitted-post URL parsing, app-only lookup and proof validation |
| `src/render.ts` | Server-rendered pages, metadata, certificate SVG |
| `public/exam.js` | Examination UI, draft answers, review, ceremony |
| `public/license.js` | Self-declared handles, post preparation/submission, PNG generation, sharing |
| `public/styles.css` | Adapted navy/paper visual draft, responsive styles, motion |
| `migrations/` | D1 schema and versioned changes |
| `tests/` | Real D1 integration tests and Chromium end-to-end tests |

The Worker serves HTML directly and delegates four static assets to its asset binding. There is no framework server, hydration bundle, email, analytics, or runtime AI call. X verification uses app-only read access to the submitted public post and author. There is no user OAuth flow, timeline scanning, or background polling.

### Correctness and privacy

An HttpOnly, SameSite=Strict capability cookie contains 256 random bits. HTTPS uses a Secure `__Host-` cookie. D1 stores only its SHA-256 hash. The cookie authorizes access to private attempts and personalization; the public license ID never authorizes editing. Clearing cookies loses editing access. A verification post does not provide browser-session recovery.

Each attempt snapshots its private randomized questions, explanations, sources, threshold, and examination version. Its initial client payload omits answer keys and explanations. A submitted answer must reference an actual option in that attempt. A client-supplied pass flag has no effect.

The first submission wins. A transactional D1 batch conditionally saves its result and inserts the license from that saved result; `UNIQUE(attempt_id)` additionally prevents duplicate issuance. If insertion fails, grading rolls back. Retransmission after a lost response returns the committed result. Different concurrent answers cannot replace it. Start requests use idempotency IDs and one pending attempt per browser owner.

Exam, post preparation/submission, and handle-editing mutations require a same-origin JSON request, bounded to 16 KiB when consumed. All SQL values are bound parameters. HTML/SVG text is escaped and handles accept only 1–15 ASCII letters, digits, or underscores. API and record responses use `no-store`; CSP restricts scripts, forms, framing, and outbound requests. No application logs contain cookies, answers, handles, IPs, provider response bodies, or access tokens. Each private verification request records a declared handle, the exact license URL and a thirty-minute expiry. An internal random generation identifier prevents stale requests from updating the record; it is never included in the public post or certificate URL. The submitted post contains only the ownership statement and permanent license URL (including X’s expanded link entities), must be published within the request window, and must have a matching API-reported author. URL usernames are not trusted. Retweets and protected accounts are rejected. No arbitrary submitted URL is fetched: only a validated numeric post ID is sent to the fixed X API endpoint. Concurrent checks acquire a D1 lease before any paid API call; edits, replacement challenges or expiry invalidate in-flight results. Once verified, the stable account ID prevents transfer. Successful retries return the saved record without calling X. Failed proof comparisons are cached for that challenge; provider failures can be retried manually after a cooldown.

Write limits: 120 mutations per client IP per ten minutes, 20 new attempts per browser owner per hour, and 2,000 new attempts globally per hour. Counts saturate at limit + 1. IPs are stored only as daily hashes, which are pseudonymous rather than anonymous. These limits control issuance/storage abuse, not distributed denial of service; Cloudflare account-level protections and quotas still apply. Tune thresholds in `src/worker.ts` for observed use.

The daily 04:17 UTC scheduled handler removes completed attempts older than seven days, pending attempts not reopened for thirty days, expired rate-limit buckets, and expired post-verification challenges. The next daily run performs removal; licenses and their edit ownership persist. Local development does not run cron automatically. To exercise it locally:

```sh
curl http://127.0.0.1:8787/cdn-cgi/local/scheduled
```

Question bank/threshold changes should increment the exam version. Existing attempts use their snapshots. Keep migration files immutable once applied; add new ones for schema changes.

## Verify

```sh
npm run check
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

For an existing Chromium installation, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` (or its actual path) instead of installing a Playwright browser. Browser tests start a separate local Worker on port 8788 and use `.wrangler/browser-tests/`, not the preview database. They save screenshots and a downloaded PNG in `test-results/`. Both emulator tests and browser tests require local socket access.

Integration tests cover the pass boundary, failure and retry, private data, forged pass flags, invalid inputs, duplicate/concurrent grading, ownership, post-proof validation, provider errors, account binding, concurrent checks, paid-read limits, self-declared handles, rollback on D1 errors, cleanup, persistence, rate limits, and missing records. Browser tests cover the complete user journey, keyboard selection, draft recovery, anonymous and verified-fixture PNG export, anonymous visitors, small screens, reduced motion, unavailable localStorage, and static content without JavaScript.

`npm run build` bundles the Worker and checks assets using Wrangler's deployment **dry run**. It does not publish anything. The lockfile pins tested dependencies; Miniflare is aligned with the runtime version used by Wrangler.

## Post-based X verification

This is the only new-verification flow. User OAuth routes and implementation have been removed. Migration `0004` preserves existing license URLs and verified accounts, removes transient OAuth data and adds expiring post challenges. Existing migrations stay immutable so both fresh installations and upgrades work.

Use the X developer app’s **app-only Bearer Token**, not a personal OAuth access token. Add `X_BEARER_TOKEN=...` to ignored `.dev.vars`; `BEARER_TOKEN` is accepted for the existing local setup. The former OAuth client ID/secret and callback registration are no longer used. No credentials belong in the repository.

1. Pass the exam and optionally save a self-declared handle.
2. Prepare a verification post for that handle. This starts the verification window and produces “I have earned my Consciousness License.” followed by the permanent URL—no extra public code.
3. Publish the complete text from a public account and paste that post’s URL back within thirty minutes. X’s intent page is a convenience; the user publishes the post themselves.
4. The Worker fetches that single public post and its author. On success it updates the existing license at the same URL and records the proof post ID. No ongoing API reads occur when people view or download a license.

The post must remain visible until checked. Subsequent deletion does not erase historical verification. Verification proves control of an account at that time, not who took the examination. Anonymous licenses remain available. Already verified account IDs remain bound even after name removal; a new post from the same account can refresh its handle.

### Cost controls

X’s published pay-per-use rates are $0.005 per post and $0.010 per user resource. Budget **$0.015 per completed lookup** (one post plus its author), or about $15 per 1,000 checks. Failed proof checks that returned these resources also cost money. Confirm actual endpoint charges in the developer console; X may change rates. This implementation does not depend on X’s billing deduplication to limit requests.

- At most three lookups per challenge, with a thirty-second cooldown between checks.
- At most ten lookups per browser owner per UTC day, independent of challenge resets.
- A global `X_DAILY_LOOKUP_LIMIT`, default **100 per UTC day** in `wrangler.jsonc`. This corresponds to roughly $1.50/day or $45/30 days of X resource reads at the above prices, if fully used. Setting it to zero disables paid lookups; malformed values fail closed.
- Counters are reserved in D1 before external calls. In-flight checks are serialized; successful retries and cached failed proof comparisons make no external request. No automatic retries, polling, or timeline scans.

Set an X account spending limit as the billing backstop. The application cap bounds this feature’s requests, not other apps sharing the X account or future pricing changes. Cloudflare usage remains subject to the Workers/D1 plan limits.

After local review, install the production secret interactively, apply migrations and deploy:

```sh
npx wrangler secret put X_BEARER_TOKEN --env production
```

If the bearer token is absent, verification is unavailable but the exam, anonymous licenses and self-declared handles still work. Tests mock the provider outside the actual Workers runtime and validate real D1 state transitions. The local app-only token has also been checked against one public post; final end-to-end testing requires the owner to publish a challenge post and submit its URL.

References: [X app-only authentication](https://docs.x.com/fundamentals/authentication/oauth-2-0/application-only), [post lookup](https://docs.x.com/x-api/posts/get-post-by-id), [X pricing](https://docs.x.com/x-api/getting-started/pricing).

## Cloudflare deployment

The production environment targets `consciousnesslicense.com`, with the `workers.dev` address and version preview URLs disabled. The host is part of the verification URL printed in downloaded images.

```sh
npx wrangler d1 migrations apply consciousness-license --remote --env production
npm run deploy
```

Authenticate using a locally configured `CLOUDFLARE_API_TOKEN` or `wrangler login`. Deployment requires access to Workers and D1, plus the domain permissions needed to configure the custom domain. Keep credentials outside the repository. D1 access uses the Worker binding. Post verification additionally requires the app-only bearer token described above; the source remains safe to publish without them.

For a separate installation, create a D1 database and replace the account, domain, and database ID under `env.production` in `wrangler.jsonc`:

```sh
npx wrangler d1 create consciousness-license
```

`npm run deploy` explicitly selects production and refuses a missing or placeholder production database ID. Local development keeps its existing database identity. After deployment, verify issuance on the public hostname and confirm the scheduled trigger is active.

Sharing metadata supplies titles and descriptions. **Server-generated social-preview PNGs are not included**; PNG download works in the browser. Social platforms may cache old handle metadata. An uploaded image is not automatically a clickable link, and a copied certificate image is not authoritative.

Platform references: [Worker assets binding](https://developers.cloudflare.com/workers/static-assets/binding/), [D1 database API and transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/). Philosophy sources are linked directly in each field note and review explanation.
