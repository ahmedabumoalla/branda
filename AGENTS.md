<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Continuity and execution

- Start with `docs/task-state.md`, then `docs/BARNDAKSA_HANDOFF/00_MASTER_INDEX.md`. Read historical records only for a relevant unresolved detail.
- The user prefers fast implementation, premium Arabic design, short updates and concrete results. Complete authorized work and deployment without repeated confirmation or broad exploratory checklists.
- Check the actual source and `git status`; preserve unrelated local changes. Never publish unfinished local work just because it exists.
- Run only checks relevant to the changed behavior plus the mandatory checks below. Reuse valid unchanged evidence; documentation-only updates do not require rebuilding the application.
- Do not inspect the browser unless directly requested or a critical necessity cannot be resolved from source, tests or APIs; explain that necessity first.
- Deploy through the correct GitHub branch/project and verify the exact production commit. A successful push alone is not a successful deployment.
- Keep the current handoff short: published state, established product rules, actual pending work and next action. Never include secrets. Account changes do not authorize resetting data or rebuilding completed features.

## Text Integrity Rules

- Before any modification, read this file.
- Never write or save Arabic mojibake or corrupted text.
- Any Arabic text in JSX, TS, SQL, or MD must be clear, readable UTF-8.
- After any modification that contains Arabic text, run the text integrity check.
- Do not deliver work if any forbidden mojibake pattern from `scripts/check-text-integrity.mjs` appears, including Unicode escapes U+00D8, U+00D9, U+00D0, U+00C3, U+00C2, U+00E2, U+FFFD, U+0637 U+00A7, U+00D8 U+00A7, or U+00D9 U+2026.
- Do not use bulk encoding-conversion tools without reviewing the resulting diff.
- Do not consider the task complete until the text integrity check and TypeScript pass.

## Communication Rules

All assistant responses to the user must be in Arabic and rendered right-to-left using this wrapper:

```html
<div dir="rtl" align="right">
...
</div>
```

Code, file paths, terminal commands, function names, and other code-like text must be placed in separate fenced code blocks. Do not mix them inline with Arabic text.
