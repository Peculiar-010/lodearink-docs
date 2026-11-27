---
name: Vercel fork synchronization
description: Why a successful push to the workspace origin may not update the Vercel project.
---

Verify the repository named in the current Vercel build against the workspace Git remote before assuming a push updates its build source.

**Why:** This project's Vercel build used a GitHub fork while the workspace origin pointed at the parent repository. The available GitHub credential could push the parent, but the fork rejected the same fix with permission denied.

**How to apply:** Recheck current destinations because hosting connections can change. When this mismatch persists, push the fix to the authorized parent and tell the owner to use GitHub's Sync fork / Update branch on the hosting fork. Do not claim the fork or Vercel has received the fix unless verified, force-push over fork changes, or change the hosting repository without the user's approval.
