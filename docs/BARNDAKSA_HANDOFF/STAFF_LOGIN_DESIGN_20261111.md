# Staff sign-in design - 2026-11-11

Refreshed the loyalty/pager staff login shown by the user: original brown Branda logo on a light header, clear welcome heading, quieter method selector, larger 54px phone/password inputs and primary action. Small windows start near the top instead of a large blank centered margin. Secondary system switching lives inside the existing native help disclosure; both loyalty and POS destinations remain reachable

Styles are scoped to the staffLogin modifier, preserving sales login and other shared consumers. Existing phone OTP, email/password, resend cooldown, expired-session notice, rejected credentials and redirect behavior are unchanged. Decorative icons are hidden from assistive technology. Arabic/English, RTL/LTR, password visibility, disabled controls, focus outlines, reduced motion, long messages and short-window scrolling were reviewed in source

Node24.19.0 verification:23 existing staff OTP/server/UI cases PASS, CSS compilation PASS, TypeScript noEmit PASS, text integrity PASS, scoped ESLint0errors/0warnings and production webpack build PASS. Commands, dates and input hashes are in STAFF_LOGIN_DESIGN_20261111_CHECKS.json. No browser inspection, live OTP requests, test accounts, database writes or finance behavior changes

Release target is GitHub main and Vercel branda-2 on top of c6f838f21d1c1e9de0a2e10247039f0e30541488. Exact production deployment and public login HTML verification are recorded in the local task record after publication
