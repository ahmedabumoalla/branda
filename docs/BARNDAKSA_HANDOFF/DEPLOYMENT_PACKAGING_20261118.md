# Deployment packaging optimization ? 2026-11-18

Application e6f035885b1d130b9e26c7c3fd1cdca4ceb1da28 published by promoting the verified staged build dpl_2DbJXfAtJV5ZQeXyD3AmFb15Qq9J; both domains and exact homepage deployment verified 2026-11-18T01:04:37.527Z

- Only the build command and two build/check scripts change; no app, API, database, message, permissions, dependency, renderer or Next.js configuration changes
- Post-build trace optimization removes only the four known Chromium binary files from routes with neither the external Chromium runtime nor compiled references to it; unknown package contents are retained
- Every original PDF trace is preserved; all traces validate before any write; no binary files are deleted from disk and no payload is expanded
- Real Vercel build: 260 route traces, 110 contain Chromium runtime, only admin/finance and finance/[slug]/family change; eight redundant entries totaling140091212 bytes removed across per-route traces (not a measured compressed upload reduction)
- Superseded staged candidate expanded shared traces and was rejected before promotion; final code preserves these manifests byte-for-byte
- Focused packaging checks and full TypeScript pass; actual synthetic subscription/quotation and 1/120-row thermal PDFs generated with local headless Chrome
- Existing thermal markup comparison fails on the decimal separator deliberately changed in previously published72e631a7; relevant inputs unchanged, no assertions disabled; standalone PDF renderer verification passes
- Original baseline dpl_2ExJfPkuidcjHZD3eaBqkFsyutch: post-build output deployment382.204 seconds, 39 unique function groups; cache was restored, Turbo30CPU already enabled
- Evidence: output/deploy-optimization-20261118; stage dpl_2DbJXfAtJV5ZQeXyD3AmFb15Qq9J; no real messages or financial test records
- Final staged build17seconds; output deployment56.299seconds vs baseline382.204seconds; full create-to-ready79.754seconds. Cache and infrastructure conditions differ, so this single comparison does not establish causality or guarantee future timing
- Existing automation bypass used only in memory to verify protected stage; public/login/register and affected route entries returned200 after promotion. No authenticated customer operations were exercised
- GitHub main includes the application plus documentation-only follow-up; if that follow-up triggers a redundant build it can be cancelled while leaving this exact verified production deployment active

Separate pending user request: add the supplied loyalty PDF under loyalty settings for effective-loyalty accounts only (old and new), with same-page preview/download; not part of this packaging change
