# BARNDAKSA_HOME_INTRO_VIDEO_PRODUCTION_FIX_PATCH

Fixes the homepage "شاهد كيف يعمل" intro video on production domains by avoiding stale signed URLs.

Run from project root:

```bash
node BARNDAKSA_HOME_INTRO_VIDEO_PRODUCTION_FIX_PATCH/apply-patch.cjs
npm exec tsc -- --noEmit
npm run build
```
