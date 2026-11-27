---
name: Hosting and API privacy
description: Private API hosting and owner-managed backend integration.
---

The API is deployed on Cloudflare's free account tier from a private GitHub repository. The repository must remain private. The owner is willing to add supplied instrumentation code and Cloudflare configuration privately.

**Why:** The owner stated that the API repository is private, will not be public, and that they can add code or Cloudflare configuration to monitor API-wide requests.

**How to apply:** Do not require public API source access. Provide a generic adapter and installation instructions when private source is unavailable. Verify free-tier suitability and do not promise unlimited usage or expose credentials or private request contents in public statistics.
