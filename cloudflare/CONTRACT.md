# Public snapshot contract

Only the companion Worker produces this response. The browser polls `/v1/snapshot`
once a minute and never triggers collection or endpoint probes.
Each public poll performs one indexed D1 snapshot-row read. Analytics Engine is read
only by the shared scheduled Worker, never once per visitor or per browser.

`schemaVersion: 1`, `generatedAt` ISO timestamp, `collectionStartedAt` ISO timestamp
or null (first observed real request; never implies earlier request history).

`usage`: `state` (`ready`, `waiting-for-traffic`, `unavailable`, `stale`),
`updatedAt` (last successful analytics refresh or null), `sampled` boolean,
`maxSampleInterval` number, `error` null or a sanitized `{code,at}`.

`usage.windows` keys `1h`, `24h`, `7d` each have `from`, `to` ISO strings,
`requests`, `successes` (HTTP 200–399), `clientErrors` (400–499), `serverErrors`
(500–599), `avgResponseMs` (weighted response-to-headers average or null),
`endpoints` and `timeline`. Endpoint entries: `path` (normalized template or
`__unmatched__`), `requests`, `successes`, `clientErrors`, `serverErrors`,
`avgResponseMs`, `lastSeenAt`, `lastStatus`. Timeline entries: `{time,requests}`.
Timeline contains observed five-minute buckets, not fabricated pre-install zeros;
the first/current buckets can be partial.

`usage.recent` is at most 24 **sampled observations**, not a complete audit log:
`{time,endpoint,method,status,responseMs,sampleInterval}`. Normal usage includes
bots and all non-monitor clients; it is not a count of humans.

`monitoring`: `state` (`ready`, `setup-required`), `updatedAt`, `intervalSeconds`
(7200), `endpoints`. All 206 public templates appear, without adding internal
metrics routes to the API catalog. Each monitoring entry has `path`,
`coverage` (`active` or `passive`), `state` (`online`, `degraded`,
`requires-parameters`, `unknown`), nullable `lastCheckAt`, `nextCheckAt`,
`durationMs`, `httpStatus` (scheduled or recent passive response), `reason` (fixed code), `history` (newest first,
up to 12 `{at,state,status,responseMs,reason}` records),
`observedAvailability`: `{percent,successful,unsuccessful,excluded,sampleCount,from,to}`.
Percent is null without conclusive active observations. Network/validation/auth
failures are excluded rather than presented as proven downtime.

`passive` is null or `{lastSeenAt,lastStatus,requests1h,successRate1h,avgResponseMs1h}` from sampled
normal traffic. Passive health is not active-check uptime. No traffic means
unknown, not healthy or offline.

No prompts, bodies, query strings, headers, credentials, IPs or dynamic resource
identifiers are in this contract. Empty setup is `snapshot: null` in the UI and
must show em dashes, not simulated zero totals.
