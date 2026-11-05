# Dabab PDF catalog and wheat identity

- Scope: existing Dabab account `brand-8ad185ee82e3`, cafe `3813425d-db13-4d30-8b82-9d41aad12e36`
- User explicitly requested complete removal of the old catalog and replacement exclusively from the supplied PDF, plus the storefront wheat logo and new premium product images
- Catalog: all 104 old products and 17 categories replaced with 28 source entries in one drinks category; five entries retain both printed prices using neutral price labels because the PDF does not name sizes; no invented calories
- Source contract: `data/imports/dabab-pdf-20261105.json`, PDF SHA256 `48403cf37cd5523d0d9efdad19c8e4e240e1a309493e35af481142e22b73eb37`
- Identity: transparent storefront wheat logo, warm ivory and terracotta palette, separate desktop/mobile drinks hero, 28 individually generated reference-based product photos with illustration disclosure
- Existing owner loyalty preserved exactly, including six stamps and the current custom iced-tea/hibiscus reward; previous 10% setup is historical and was not restored
- Customer records, cards, orders, finance, subscription, other brands and wallet queues unchanged; no customer messages or passes generated
- Migration: `20261105122133_dabab_pdf_catalog_replacement.sql`, final MD5 `c75ba80307235c210c635ba0bc5ff913`; exact catalog/identity guards, FK/schema and short table locks, protected-record snapshots and live rollback before commit
- Verification: 23 PostgreSQL behavioral checks, live rollback and restoration, 29 private assets signed/hash verified with public access denied, root and release text/types, 544 signature checks, scoped lint and Node24 production build passed
- Evidence stays private in `output/dabab-refresh`; source and generation metadata contain no customer payloads; original source images and prior Storage objects retained
- Publication: production application verification pending

Menu: https://barndaksa.com/menu/brand-8ad185ee82e3
