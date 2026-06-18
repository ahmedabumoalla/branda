<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Communication Rules

All assistant responses to the user must be in Arabic and rendered right-to-left using this wrapper:

```html
<div dir="rtl" align="right">
...
</div>
```

Code, file paths, terminal commands, function names, and other code-like text must be placed in separate fenced code blocks. Do not mix them inline with Arabic text.
