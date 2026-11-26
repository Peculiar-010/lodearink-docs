# Lodearink API documentation

Public, framework-free documentation and a real API playground. Application code is HTML, CSS, and vanilla JavaScript modules. No login, build step, frontend package dependency, API key, or database is required.

## Run on Replit

Use the **Lodearink documentation** workflow. It runs `npm run dev`, which serves the static project with Python’s standard-library HTTP server on `0.0.0.0:5000`. Open the web preview. The server is development tooling, not an application backend. JavaScript modules must be served over HTTP, not opened as `file://`.

## Live API and discovery

The external API is `https://api.lodearink.name.ng`. This project does not change it. Browser requests go directly to that origin; its health response permits cross-origin GET and POST with Content-Type. Other/custom headers may be rejected by CORS. No arbitrary proxy or authentication bypass is provided.

The uploaded brief and the live health directory are combined into `data/catalog.json`. Every listed route is retained, including absent or unresolved routes. Probe evidence records timestamps, method, full URL, request body, HTTP status, content type, duration, and actual response snippets. Snippets are limited to 5,000 characters. Successful probes do not prove all optional parameters or every method.

To deliberately rerun discovery: `python scripts/discover.py`, then `python scripts/refine_discovery.py`, then `python scripts/verify_contracts.py`. These make real external requests, including small generation tests and upload tests when configured. Do not run them on a schedule or without intending upstream work. Temporary probe files use the OS temporary directory. Python urllib was blocked by the upstream’s bot filter; probes use curl instead.

Automatic browser checks only use recorded successful, inexpensive GET samples, cache results for ten minutes, avoid generation/upload/download/mutation, and limit scheduled status checks to six per ten minutes. Unknown and validation-needed are not Offline. Offline means both GET and POST received explicit unknown-route responses; it is a timestamped observation, not a permanent claim.

## Test

`npm test` runs Node’s standard test runner for request generation, all requested routes, evidence validity, and storage/import safety. Native syntax checks require Bash, Node, Python, PHP, Ruby, and Go. PHP and Ruby are configured as development tools in `.replit`; Go is available through the Replit toolchain.

`node tests/browser.mjs` runs Chromium interactions against the development preview, using the development-only Playwright dependency and system Chromium. It checks all 265 reference pages, every category, keyboard search, editable queries and headers, all code tabs, real GET and POST transmission, actual upstream errors, saved-request CRUD/persistence, import/export, multipart file selection, all 18 guides, status filtering, and mobile navigation/overflow.

The live vision POST returned HTTP 500 in the final browser run despite returning HTTP 200 during discovery. The test verifies the actual status/body is displayed rather than manufacturing a success. Static snapshot badges remain timestamped; browser tests update that browser’s local status cache.

## Deploy as a static Vercel site

1. Import this repository into Vercel.
2. Choose **Other** as the framework preset. Use the repository root, no build command, and `.` as the output directory. No environment variables are needed.
3. `vercel.json` supplies static output and basic security/cache headers. `.vercelignore` excludes source briefs, screenshots, development scripts, tests, and workspace internals.
4. Deploy a preview. Verify `/`, `/docs.html`, `/playground.html`, `/status.html`, `/guides.html`, `/changelog.html`, and an invalid route’s 404 page. Send a GET `/health`, a query search, and the observed POST vision request.
5. Add **docs.lodearink.name.ng** in this Vercel project’s Domains settings. Apply only the DNS record Vercel supplies for the **docs** subdomain.
6. Do not change the root domain or any DNS/configuration for **api.lodearink.name.ng**. It remains the existing API service.
7. Confirm HTTPS and CORS from the deployed docs origin. Browser console failures may be network/CORS restrictions; compare against the generated cURL request.

No production deployment or DNS change has been performed by the development setup.

## Local browser storage

Saved and recent requests, including manually entered headers, are stored in unencrypted localStorage on the current browser origin. File contents are not persisted. JSON imports validate the entire file, permit only the Lodearink API origin, and reject credentials in URLs. Export files may contain user-entered headers; treat them accordingly.
