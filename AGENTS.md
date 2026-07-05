<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

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
