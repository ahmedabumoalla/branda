# BARNDAKSA_SAFE_CLEANUP_NODE

Node-only cleanup script. It deletes only temporary patch folders, patch backup folders, old patch scripts, generated audit/build cache files, and old backup config files from the project root.

It does not touch app, components, lib, public, supabase, scripts, docs, package.json, env files, or main config files.

Run from project root:

```powershell
cd E:\branda-platform
node BARNDAKSA_SAFE_CLEANUP_NODE/apply.cjs
npm run build
```
