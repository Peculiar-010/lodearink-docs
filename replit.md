# Lodearink API documentation

Public, framework-free documentation and an API playground. Browser code is HTML, CSS, and vanilla JavaScript modules with no runtime frontend dependencies, login, API key, or database.

## Run on Replit

Use the **Lodearink documentation** workflow. `npm run dev` builds static pages and sharing PNGs into ignored `dist/`, then serves clean URLs using Python’s standard library on `0.0.0.0:5000`. The server is development tooling, not an application backend. Run `npm run build` after changing source files; restart the workflow after a coherent batch.

## Live API and discovery

The external API is `https://api.lodearink.name.ng`. This project does not change it. Browser requests go directly to that origin; its health response permits cross-origin GET and POST with Content-Type. Other/custom headers may be rejected by CORS. No arbitrary proxy or authentication bypass is provided.

The maintainer's replacement list is authoritative: `data/contracts.json` contains exactly the provided concrete routes and formats. `data/catalog.json` adds live evidence. **Do not add routes from health/directory responses or expand generic MODEL_SLUG examples. Llama is the only text-model service.** Group services by purpose (Text AI, Vision AI, Social Downloaders, etc.). Keep public copy for developers; never address the site owner or refer to their brief.

Keep generated request examples varied and specific to each service. Never reuse one unrelated search term across different endpoints; when refreshing samples offline, preserve historical API evidence unchanged.

Service groups come from the explicit namespace rules in `scripts/update_catalog.py`: Social Downloaders is reserved for social-media providers; Play Store/Uptodown are App Stores, Hacker News is Developer News, MediaFire is File Downloads, Spotify belongs in Audio & Music, and the all-in-one tools are Media Downloaders. Unrecognized services fall back to Other Tools, never Social Downloaders. `python scripts/update_catalog.py --regroup-only` refreshes both tracked JSON inventories **offline**, preserving every request contract, response, status and timestamp. It refuses mismatched or duplicate inventories before writing.

To deliberately retest this inventory: `npm run discover` (`python scripts/update_catalog.py`). This makes real external requests, including generation and file uploads; do not schedule it or run it unintentionally. `--resume` reuses a local checkpoint from an interrupted run. `--spec PATH` replaces the source contracts from a new maintainer file. Legacy discovery scripts are historical and must not overwrite the restricted inventory. Temporary files use the OS temporary directory; resumable output stays in ignored `generated-artifacts/`. Probes use curl because the API's bot filter blocked Python urllib.

Evidence contains actual request inputs, timestamps, HTTP status, duration, content type and response snippets limited to 5,000 characters. Secret-like response fields are redacted. A successful health/service directory is not proof that its operation works. Validate actual operations with real image/video inputs and returned resource IDs. Requiredness is not invented when the contract does not specify it.

The browser no longer sends automatic or manual status probes. The overview and reference pages show the historical catalog status and its timestamp. Live Usage and Status pages read the same configured Cloudflare snapshot; missing configuration shows a short no-data state rather than zero traffic or old catalog entries.

Keep operator-only setup instructions off the public site. Cloudflare integration source and the copy-only private adapter are in `cloudflare/`; the private API repo remains separate and private. The API adapter writes only normalized route, method, response status, response-to-headers duration and a user/monitor flag to Analytics Engine; telemetry failures fail open. Cloudflare's scheduled snapshot Worker uses three fixed weighted/sampling-aware Analytics Engine reads per minute and advances a queue of at most four reviewed read-only probes per minute. Each active probe runs no more often than every two hours; other routes have explicitly passive coverage. D1 retains one shared usage snapshot and at most twelve recent scheduled outcomes per route, never full request records. The public dashboard refreshes the one shared snapshot, not Analytics Engine, about once a minute. See `cloudflare/CONTRACT.md` before changing this architecture.

## Test

`npm run build && npm test` checks exact inventory scope, request generation, evidence validity, storage/import safety, clean routes, task follow-ups, crawler-readable metadata/PNG dimensions for every page, Cloudflare privacy/sampling/adapter behavior, bounded two-hour probe scheduling and concise no-data UI states. Native syntax checks require Bash, Node, Python, PHP, Ruby and Go; PHP and Ruby are configured in `.replit`, and Go is available through the Replit toolchain.

`node tests/browser.mjs` exercises the running preview with Playwright/system Chromium: reference routes, groups, search, editors, code examples, real GET/POST calls, a real video task follow-up, saved-request CRUD/persistence, import/export, uploads, guides, no-data states and mobile layouts. This deliberately calls the external API, including one small video generation.

Tests assert the actual upstream status/body, not an assumed success. Catalog badges and sharing images are timestamped discovery snapshots. Task cards fill returned IDs/status URLs and send follow-up requests on click; runtime status URLs do not add services to the public inventory. The separate shared monitoring snapshot may update status after Cloudflare setup.

## Deploy as a static Vercel site

1. Import this repository into Vercel.
2. Choose **Other** as the framework preset. Build command: `npm run build`. Output directory: `dist`. Node installs the build-time SVG rasterizer; browser code remains framework-free. No environment variables are needed.
3. `vercel.json` enables clean URLs and security/cache headers. `.vercelignore` retains required build scripts and fonts while excluding attachments, tests, generated files and workspace internals.
   Vercel uses `npm ci --omit=dev --no-audit --no-fund`: the sharing-image renderer is a build dependency; Playwright is development-only. Keep committed lockfile tarball URLs on the public npm registry with their integrity hashes intact. Internal workspace registry hostnames cannot resolve on Vercel. `tests/deployment.test.js` guards this portability requirement.
4. Verify `/`, `/docs`, `/playground`, `/status`, `/guides`, `/changelog`, `/docs/visionai/qwen/analyze`, its sharing PNG, and an invalid route's 404 page. Legacy `.html` links redirect to clean URLs.
5. The current public docs origin is **https://lodearink-docs-o4dd.vercel.app**. Do not switch to the official domain or change DNS until the owner requests it.
6. Do not change the root domain or any DNS/configuration for **api.lodearink.name.ng**. It remains the existing API service.
7. Confirm HTTPS and CORS from the deployed docs origin. Browser console failures may be network/CORS restrictions; compare against the generated cURL request.

No production deployment or DNS change has been performed by the development setup.

`site.config.json` is the single setting for the public origin. Its `url` must be an HTTPS origin without credentials, path, query or fragment. It currently uses the working Vercel address. The static build emits HTML metadata, 1200×630 PNG sharing cards, `sitemap.xml` and `robots.txt`, all using that origin. Rebuild after retesting to refresh sharing status/timestamps. Bundled DejaVu fonts make build rendering deterministic; their license is in `assets/fonts/`.

### Sharing-image verification and publishing

The original public pages referenced `docs.lodearink.name.ng`, where images returned 404 even though the PNGs existed on Vercel. A passing local build is **not** proof that the public site has received a correction.

Open Graph cards use a pure-black background, very large centered text, and restrained blue, red, and green glow accents. Keep the subtle 3D treatment; do not use grid patterns or crowd the title.

1. Run `npm run build && npm test`. The regression suite checks crawler-visible canonical/OG/Twitter URLs for every generated page, decompresses all unique PNGs, checks 1200×630 dimensions and verifies group exclusions.
2. With the preview running, run `node scripts/check-sharing.mjs --preview "https://$REPLIT_DEV_DOMAIN"`. It checks delivery through the preview while requiring metadata to name the configured public origin. It does not claim to verify the published update.
3. Check which GitHub repository Vercel actually builds. Previously it built a fork while the workspace remote pointed to the parent; pushing the parent alone does not update that fork. Sync the hosting fork when required, without force-pushing over its changes or changing the hosting connection.
4. The owner publishes through their existing Vercel flow. After publishing, run `node scripts/check-sharing.mjs` with no arguments. It uses the configured public origin, acts as a social crawler and verifies representative general, docs and playground pages plus their actual PNG URLs. A stale/wrong image host makes it fail rather than silently accepting descriptions.
5. If a social platform cached the earlier broken preview, request a fresh scrape using that platform's sharing debugger after the public check passes.

When the official domain is ready, connect it to the existing Vercel site, change **only** `site.config.json` → `url`, rebuild and publish, then repeat the public sharing check. Do not change the API's origin or DNS.

## Local browser storage

Saved and recent requests, including manually entered headers, are stored in unencrypted localStorage on the current browser origin. File contents are not persisted. JSON imports validate the entire file, permit only the Lodearink API origin, and reject credentials in URLs. Export files may contain user-entered headers; treat them accordingly.
