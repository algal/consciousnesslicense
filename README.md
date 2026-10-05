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
- Passing issues an anonymous license immediately, with a short ceremony. Adding a handle requires X sign-in. Verified licenses publish the account ID, handle at verification, and verification date. A license can be refreshed using the same X account or made anonymous again; it cannot be transferred to another X account. Existing self-declared handles remain visibly unverified. Handles are not reserved.
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
| `src/x-auth.ts` | OAuth 2.0 PKCE, token exchange and X identity lookup |
| `src/render.ts` | Server-rendered pages, metadata, certificate SVG |
| `public/exam.js` | Examination UI, draft answers, review, ceremony |
| `public/license.js` | X verification entry point, name removal, PNG generation, sharing |
| `public/styles.css` | Adapted navy/paper visual draft, responsive styles, motion |
| `migrations/` | D1 schema and versioned changes |
| `tests/` | Real D1 integration tests and Chromium end-to-end tests |

The Worker serves HTML directly and delegates four static assets to its asset binding. There is no framework server, hydration bundle, email, analytics, or runtime AI call. Optional X integration uses OAuth 2.0 authorization code flow with PKCE; OAuth 1.0 is not used.

### Correctness and privacy

An HttpOnly, SameSite=Lax capability cookie contains 256 random bits. HTTPS uses a Secure `__Host-` cookie. D1 stores only its SHA-256 hash. The cookie authorizes access to private attempts and personalization; the public license ID never authorizes editing. Clearing cookies loses editing access. X sign-in does not provide browser-session recovery. Lax allows the cookie to return on X’s top-level callback; other mutations require same-origin requests.

Each attempt snapshots its private randomized questions, explanations, sources, threshold, and examination version. Its initial client payload omits answer keys and explanations. A submitted answer must reference an actual option in that attempt. A client-supplied pass flag has no effect.

The first submission wins. A transactional D1 batch conditionally saves its result and inserts the license from that saved result; `UNIQUE(attempt_id)` additionally prevents duplicate issuance. If insertion fails, grading rolls back. Retransmission after a lost response returns the committed result. Different concurrent answers cannot replace it. Start requests use idempotency IDs and one pending attempt per browser owner.

Exam, verification-start, and name-removal mutations require a same-origin JSON request, bounded to 16 KiB when consumed. All SQL values are bound parameters. HTML/SVG text is escaped and handles accept only 1–15 ASCII letters, digits, or underscores. API and record responses use `no-store`; CSP restricts scripts, forms, framing, and outbound requests. No application logs contain cookies, answers, handles, IPs, provider response bodies, or access tokens. The OAuth callback uses a single-use random state bound to the initiating browser and a ten-minute expiry. A private license nonce invalidates an in-flight callback after name removal or a newer sign-in. Verification uses the account returned by X; client-supplied usernames cannot confer verification.

Write limits: 120 mutations per client IP per ten minutes, 20 new attempts per browser owner per hour, and 2,000 new attempts globally per hour. Counts saturate at limit + 1. IPs are stored only as daily hashes, which are pseudonymous rather than anonymous. These limits control issuance/storage abuse, not distributed denial of service; Cloudflare account-level protections and quotas still apply. Tune thresholds in `src/worker.ts` for observed use.

The daily 04:17 UTC scheduled handler removes completed attempts older than seven days, pending attempts not reopened for thirty days, expired rate-limit buckets, and expired OAuth transactions. The next daily run performs removal; licenses and their edit ownership persist. Local development does not run cron automatically. To exercise it locally:

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

Integration tests cover the pass boundary, failure and retry, private data, forged pass flags, invalid inputs, duplicate/concurrent grading, ownership, OAuth state/PKCE, provider errors, account binding, concurrent callbacks, legacy handles, rollback on D1 errors, cleanup, persistence, rate limits, and missing records. Browser tests cover the complete user journey, keyboard selection, draft recovery, anonymous and verified-fixture PNG export, anonymous visitors, small screens, reduced motion, unavailable localStorage, and static content without JavaScript.

`npm run build` bundles the Worker and checks assets using Wrangler's deployment **dry run**. It does not publish anything. The lockfile pins tested dependencies; Miniflare is aligned with the runtime version used by Wrangler.

## Optional X verification

Configure a confidential Web App in the X developer console with read access and these exact callback URLs for this installation:

- `https://consciousnesslicense.com/auth/x/callback`
- `https://consciousness.box.alexisgallagher.com/auth/x/callback`

For local development, put only the OAuth **2.0** `X_CLIENT_ID` and `X_CLIENT_SECRET` in ignored `.dev.vars`, using `KEY=VALUE` lines. No app-only bearer token, OAuth 1.0 Consumer Key, or pre-generated personal access token is needed. Never commit `.dev.vars`. `X_CALLBACK_URL` is a public configuration value in `wrangler.jsonc`, separate for preview and production. Sign-in is enabled only when the current HTTPS origin exactly matches that callback. Plain loopback still supports the exam and anonymous licenses; use the configured HTTPS preview to test X.

The flow requests `tweet.read users.read` for X’s user-authenticated `/2/users/me` endpoint; X requires both permissions even for identity lookup: the consent screen therefore grants access to posts and accounts. This is a real grant, not merely misleading wording. The app calls neither the feed nor post endpoints. It does not request `offline.access` or retain access/refresh tokens. After obtaining an access token it requests revocation immediately after the identity lookup, including on lookup failure; verification is saved only after X acknowledges revocation. If revocation fails, the token is discarded and a visible failure message directs the user to X’s connected-app settings. It stores only the account ID, username and verification date in the license record, plus short-lived OAuth transaction state. Removing a name hides its account ID and verification date publicly but retains the ID privately to prevent transfer. Usernames are a snapshot; the stable account ID anchors verification if usernames change.

After local review, configure the production secrets interactively (never put their values in command-line arguments):

```sh
npx wrangler secret put X_CLIENT_ID --env production
npx wrangler secret put X_CLIENT_SECRET --env production
```

Apply the schema migration before deploying this code. Without these secrets the app still issues anonymous licenses, and X sign-in is visibly unavailable. A real end-to-end check requires the owner to follow **Verify with X** in the issuing browser and consent at X. Automated tests mock only the provider responses and do not prove the developer app’s callback registration or API entitlement. X API access and pricing are governed by the developer account’s current plan.

References: [X OAuth 2.0 user access](https://docs.x.com/fundamentals/authentication/oauth-2-0/user-access-token), [X authentication mapping](https://docs.x.com/fundamentals/authentication/guides/v2-authentication-mapping).

## Cloudflare deployment

The production environment targets `consciousnesslicense.com`, with the `workers.dev` address and version preview URLs disabled. The host is part of the verification URL printed in downloaded images.

```sh
npx wrangler d1 migrations apply consciousness-license --remote --env production
npm run deploy
```

Authenticate using a locally configured `CLOUDFLARE_API_TOKEN` or `wrangler login`. Deployment requires access to Workers and D1, plus the domain permissions needed to configure the custom domain. Keep credentials outside the repository. D1 access uses the Worker binding. X verification additionally requires the two runtime secrets described below; the source remains safe to publish without them.

For a separate installation, create a D1 database and replace the account, domain, and database ID under `env.production` in `wrangler.jsonc`:

```sh
npx wrangler d1 create consciousness-license
```

`npm run deploy` explicitly selects production and refuses a missing or placeholder production database ID. Local development keeps its existing database identity. After deployment, verify issuance on the public hostname and confirm the scheduled trigger is active.

Sharing metadata supplies titles and descriptions. **Server-generated social-preview PNGs are not included**; PNG download works in the browser. Social platforms may cache old handle metadata. An uploaded image is not automatically a clickable link, and a copied certificate image is not authoritative.

Platform references: [Worker assets binding](https://developers.cloudflare.com/workers/static-assets/binding/), [D1 database API and transactional batches](https://developers.cloudflare.com/d1/worker-api/d1-database/), [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/). Philosophy sources are linked directly in each field note and review explanation.
