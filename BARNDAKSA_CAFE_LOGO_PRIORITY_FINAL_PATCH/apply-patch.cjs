#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

const PAYLOADS = {
  "lib/cafe/cafe-display-logo.ts": "ZXhwb3J0IGNvbnN0IERFRkFVTFRfQkFSTkRBS1NBX0NBRkVfTE9HTyA9ICIvYnJhbmQvYmFybmRha3NhLWxvZ28tYnJvd24ucG5nIjsKCmZ1bmN0aW9uIG5vcm1hbGl6ZUxvZ29DYW5kaWRhdGUodmFsdWU/OiBzdHJpbmcgfCBudWxsKSB7CiAgaWYgKHR5cGVvZiB2YWx1ZSAhPT0gInN0cmluZyIpIHJldHVybiB1bmRlZmluZWQ7CiAgY29uc3QgbmV4dCA9IHZhbHVlLnRyaW0oKTsKICBpZiAoIW5leHQpIHJldHVybiB1bmRlZmluZWQ7CgogIC8vIERvIG5vdCB1c2UgaW5saW5lL2Jhc2U2NCBsb2dvcyBpbiBtZXRhZGF0YSwgbWFuaWZlc3QsIG9yIHJldXNhYmxlIGRpc3BsYXkgc2xvdHMuCiAgaWYgKG5leHQuc3RhcnRzV2l0aCgiZGF0YToiKSkgcmV0dXJuIHVuZGVmaW5lZDsKCiAgLy8gUmVuZGVyYWJsZSBpbWFnZSB2YWx1ZXMgb25seS4gUmF3IFN1cGFiYXNlIHN0b3JhZ2UgcGF0aHMgbXVzdCBiZSByZXNvbHZlZCBmaXJzdC4KICBpZiAoCiAgICBuZXh0LnN0YXJ0c1dpdGgoIi8iKSB8fAogICAgbmV4dC5zdGFydHNXaXRoKCJibG9iOiIpIHx8CiAgICAvXmh0dHBzPzpcL1wvL2kudGVzdChuZXh0KQogICkgewogICAgcmV0dXJuIG5leHQ7CiAgfQoKICByZXR1cm4gdW5kZWZpbmVkOwp9CgpleHBvcnQgZnVuY3Rpb24gZ2V0UHJlZmVycmVkQ2FmZURpc3BsYXlMb2dvVXJsKAogIC4uLmNhbmRpZGF0ZXM6IEFycmF5PHN0cmluZyB8IG51bGwgfCB1bmRlZmluZWQ+CikgewogIGZvciAoY29uc3QgY2FuZGlkYXRlIG9mIGNhbmRpZGF0ZXMpIHsKICAgIGNvbnN0IG5vcm1hbGl6ZWQgPSBub3JtYWxpemVMb2dvQ2FuZGlkYXRlKGNhbmRpZGF0ZSk7CiAgICBpZiAobm9ybWFsaXplZCkgcmV0dXJuIG5vcm1hbGl6ZWQ7CiAgfQoKICByZXR1cm4gREVGQVVMVF9CQVJOREFLU0FfQ0FGRV9MT0dPOwp9Cg==",
  "components/cafe/cafe-logo.tsx": "InVzZSBjbGllbnQiOwoKaW1wb3J0IHsgREVGQVVMVF9CQVJOREFLU0FfQ0FGRV9MT0dPIH0gZnJvbSAiQC9saWIvY2FmZS9jYWZlLWRpc3BsYXktbG9nbyI7Cgp0eXBlIFByb3BzID0gewogIG5hbWU6IHN0cmluZzsKICBsb2dvVXJsPzogc3RyaW5nIHwgbnVsbDsKICBzaXplPzogInNtIiB8ICJtZCIgfCAibGciIHwgInhsIjsKICBjbGFzc05hbWU/OiBzdHJpbmc7Cn07Cgpjb25zdCBzaXplTWFwID0gewogIHNtOiB7IGJveDogImgtMTIgdy0xMiIsIHBhZDogInAtMSIgfSwKICBtZDogeyBib3g6ICJoLTE2IHctMTYiLCBwYWQ6ICJwLTEuNSIgfSwKICBsZzogeyBib3g6ICJoLTI0IHctMjQiLCBwYWQ6ICJwLTIiIH0sCiAgeGw6IHsgYm94OiAiaC0zMiB3LTMyIiwgcGFkOiAicC0zIiB9LAp9OwoKZnVuY3Rpb24gbm9ybWFsaXplTG9nb1VybCh2YWx1ZT86IHN0cmluZyB8IG51bGwpIHsKICBpZiAodHlwZW9mIHZhbHVlICE9PSAic3RyaW5nIikgcmV0dXJuIERFRkFVTFRfQkFSTkRBS1NBX0NBRkVfTE9HTzsKICBjb25zdCBuZXh0ID0gdmFsdWUudHJpbSgpOwogIGlmICghbmV4dCB8fCBuZXh0LnN0YXJ0c1dpdGgoImRhdGE6IikpIHJldHVybiBERUZBVUxUX0JBUk5EQUtTQV9DQUZFX0xPR087CiAgaWYgKG5leHQuc3RhcnRzV2l0aCgiLyIpIHx8IG5leHQuc3RhcnRzV2l0aCgiYmxvYjoiKSB8fCAvXmh0dHBzPzpcL1wvL2kudGVzdChuZXh0KSkgcmV0dXJuIG5leHQ7CiAgcmV0dXJuIERFRkFVTFRfQkFSTkRBS1NBX0NBRkVfTE9HTzsKfQoKZXhwb3J0IGZ1bmN0aW9uIENhZmVMb2dvKHsgbmFtZSwgbG9nb1VybCwgc2l6ZSA9ICJtZCIsIGNsYXNzTmFtZSA9ICIiIH06IFByb3BzKSB7CiAgY29uc3QgcyA9IHNpemVNYXBbc2l6ZV07CiAgY29uc3Qgc3JjID0gbm9ybWFsaXplTG9nb1VybChsb2dvVXJsKTsKCiAgcmV0dXJuICgKICAgIDxkaXYKICAgICAgY2xhc3NOYW1lPXtgZmxleCBzaHJpbmstMCBpdGVtcy1jZW50ZXIganVzdGlmeS1jZW50ZXIgb3ZlcmZsb3ctaGlkZGVuIHJvdW5kZWQtMnhsIGJnLVsjRjhGNEVGXSBzaGFkb3ctWzZweF84cHhfMjRweF9yZ2JhKDU4LDMzLDIzLDAuMSldICR7cy5ib3h9ICR7Y2xhc3NOYW1lfWB9CiAgICA+CiAgICAgIDxpbWcKICAgICAgICBzcmM9e3NyY30KICAgICAgICBhbHQ9e25hbWUgfHwgItio2LHZhtiv2KkifQogICAgICAgIGNsYXNzTmFtZT17YGgtZnVsbCB3LWZ1bGwgb2JqZWN0LWNvbnRhaW4gJHtzLnBhZH1gfQogICAgICAgIG9uRXJyb3I9eyhldmVudCkgPT4gewogICAgICAgICAgaWYgKGV2ZW50LmN1cnJlbnRUYXJnZXQuc3JjICE9PSBERUZBVUxUX0JBUk5EQUtTQV9DQUZFX0xPR08pIHsKICAgICAgICAgICAgZXZlbnQuY3VycmVudFRhcmdldC5zcmMgPSBERUZBVUxUX0JBUk5EQUtTQV9DQUZFX0xPR087CiAgICAgICAgICB9CiAgICAgICAgfX0KICAgICAgLz4KICAgIDwvZGl2PgogICk7Cn0K",
  "app/api/pwa/[slug]/manifest/route.ts": "aW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSAibmV4dC9zZXJ2ZXIiOwppbXBvcnQgeyBnZXRDYWZlQnlTbHVnIH0gZnJvbSAiQC9saWIvZGF0YS9jYWZlcyI7CmltcG9ydCB7IGdldFB1YmxpY0NhZmVTZXR0aW5ncyB9IGZyb20gIkAvbGliL2RhdGEvc2V0dGluZ3MiOwppbXBvcnQgeyBnZXRQdWJsaWNDdXN0b21JZGVudGl0eSB9IGZyb20gIkAvbGliL2RhdGEvdGhlbWUiOwppbXBvcnQgeyBnZXRQcmVmZXJyZWRDYWZlRGlzcGxheUxvZ29VcmwgfSBmcm9tICJAL2xpYi9jYWZlL2NhZmUtZGlzcGxheS1sb2dvIjsKCgp0eXBlIFByb3BzID0gewogIHBhcmFtczogUHJvbWlzZTx7IHNsdWc6IHN0cmluZyB9PjsKfTsKCmV4cG9ydCBhc3luYyBmdW5jdGlvbiBHRVQoX3JlcXVlc3Q6IFJlcXVlc3QsIHsgcGFyYW1zIH06IFByb3BzKSB7CiAgY29uc3QgeyBzbHVnIH0gPSBhd2FpdCBwYXJhbXM7CiAgY29uc3QgY2FmZSA9IGF3YWl0IGdldENhZmVCeVNsdWcoc2x1Zyk7CiAgY29uc3QgW3NldHRpbmdzLCBpZGVudGl0eV0gPSBhd2FpdCBQcm9taXNlLmFsbChbCiAgICBnZXRQdWJsaWNDYWZlU2V0dGluZ3Moc2x1ZykuY2F0Y2goKCkgPT4gbnVsbCksCiAgICBnZXRQdWJsaWNDdXN0b21JZGVudGl0eShzbHVnKS5jYXRjaCgoKSA9PiBudWxsKSwKICBdKTsKCiAgY29uc3QgbmFtZSA9IHNldHRpbmdzPy5jYWZlTmFtZSB8fCBjYWZlPy5uYW1lIHx8ICJCYXJuZGFrc2EiOwogIGNvbnN0IHN0YXJ0VXJsID0gYC9jLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHNsdWcpfWA7CiAgY29uc3QgaWNvblVybCA9IGdldFByZWZlcnJlZENhZmVEaXNwbGF5TG9nb1VybCgKICAgIHNldHRpbmdzPy5sb2dvRGF0YVVybCwKICAgIGlkZW50aXR5Py5sZWdhY3lMb2dvRGF0YVVybCwKICApOwogIGNvbnN0IGljb25UeXBlID0gaWNvblVybC5pbmNsdWRlcygiLndlYnAiKSA/ICJpbWFnZS93ZWJwIiA6IGljb25VcmwuaW5jbHVkZXMoIi5zdmciKSA/ICJpbWFnZS9zdmcreG1sIiA6ICJpbWFnZS9wbmciOwoKICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oewogICAgbmFtZSwKICAgIHNob3J0X25hbWU6IG5hbWUuc2xpY2UoMCwgMTIpLAogICAgZGVzY3JpcHRpb246IGDYqti32KjZitmCICR7bmFtZX0g2LnZhNmJINmF2YbYtdipINio2LHZhtiv2KlgLAogICAgc3RhcnRfdXJsOiBzdGFydFVybCwKICAgIHNjb3BlOiBgL2MvJHtlbmNvZGVVUklDb21wb25lbnQoc2x1Zyl9YCwKICAgIGRpc3BsYXk6ICJzdGFuZGFsb25lIiwKICAgIGRpcjogInJ0bCIsCiAgICBsYW5nOiAiYXIiLAogICAgYmFja2dyb3VuZF9jb2xvcjogIiNGOEY0RUYiLAogICAgdGhlbWVfY29sb3I6ICIjNEEyODFEIiwKICAgIGljb25zOiBbCiAgICAgIHsKICAgICAgICBzcmM6IGljb25VcmwsCiAgICAgICAgc2l6ZXM6ICIxOTJ4MTkyIiwKICAgICAgICB0eXBlOiBpY29uVHlwZSwKICAgICAgICBwdXJwb3NlOiAiYW55IG1hc2thYmxlIiwKICAgICAgfSwKICAgICAgewogICAgICAgIHNyYzogaWNvblVybCwKICAgICAgICBzaXplczogIjUxMng1MTIiLAogICAgICAgIHR5cGU6IGljb25UeXBlLAogICAgICAgIHB1cnBvc2U6ICJhbnkgbWFza2FibGUiLAogICAgICB9LAogICAgXSwKICB9LCB7CiAgICBoZWFkZXJzOiB7CiAgICAgICJDYWNoZS1Db250cm9sIjogIm5vLXN0b3JlLCBtYXgtYWdlPTAiLAogICAgfSwKICB9KTsKfQo=",
  "app/c/[slug]/layout.tsx": "aW1wb3J0IHR5cGUgeyBNZXRhZGF0YSB9IGZyb20gIm5leHQiOwppbXBvcnQgdHlwZSB7IFJlYWN0Tm9kZSB9IGZyb20gInJlYWN0IjsKaW1wb3J0IHsgZ2V0Q2FmZUJ5U2x1ZyB9IGZyb20gIkAvbGliL2RhdGEvY2FmZXMiOwppbXBvcnQgeyBnZXRQdWJsaWNDYWZlU2V0dGluZ3MgfSBmcm9tICJAL2xpYi9kYXRhL3NldHRpbmdzIjsKaW1wb3J0IHsgZ2V0UHVibGljQ3VzdG9tSWRlbnRpdHkgfSBmcm9tICJAL2xpYi9kYXRhL3RoZW1lIjsKaW1wb3J0IHsgZ2V0UHJlZmVycmVkQ2FmZURpc3BsYXlMb2dvVXJsIH0gZnJvbSAiQC9saWIvY2FmZS9jYWZlLWRpc3BsYXktbG9nbyI7Cgp0eXBlIFByb3BzID0gewogIGNoaWxkcmVuOiBSZWFjdE5vZGU7CiAgcGFyYW1zOiBQcm9taXNlPHsgc2x1Zzogc3RyaW5nIH0+Owp9OwoKZXhwb3J0IGNvbnN0IGR5bmFtaWMgPSAiZm9yY2UtZHluYW1pYyI7CmV4cG9ydCBjb25zdCByZXZhbGlkYXRlID0gMDsKCmV4cG9ydCBhc3luYyBmdW5jdGlvbiBnZW5lcmF0ZU1ldGFkYXRhKHsgcGFyYW1zIH06IFByb3BzKTogUHJvbWlzZTxNZXRhZGF0YT4gewogIGNvbnN0IHsgc2x1ZyB9ID0gYXdhaXQgcGFyYW1zOwogIGNvbnN0IFtjYWZlLCBzZXR0aW5ncywgaWRlbnRpdHldID0gYXdhaXQgUHJvbWlzZS5hbGwoWwogICAgZ2V0Q2FmZUJ5U2x1ZyhzbHVnKS5jYXRjaCgoKSA9PiBudWxsKSwKICAgIGdldFB1YmxpY0NhZmVTZXR0aW5ncyhzbHVnKS5jYXRjaCgoKSA9PiBudWxsKSwKICAgIGdldFB1YmxpY0N1c3RvbUlkZW50aXR5KHNsdWcpLmNhdGNoKCgpID0+IG51bGwpLAogIF0pOwoKICBjb25zdCBuYW1lID0gc2V0dGluZ3M/LmNhZmVOYW1lIHx8IGNhZmU/Lm5hbWUgfHwgItio2LHZhtiv2KkiOwogIGNvbnN0IGljb25VcmwgPSBnZXRQcmVmZXJyZWRDYWZlRGlzcGxheUxvZ29VcmwoCiAgICBzZXR0aW5ncz8ubG9nb0RhdGFVcmwsCiAgICBpZGVudGl0eT8ubGVnYWN5TG9nb0RhdGFVcmwsCiAgKTsKCiAgcmV0dXJuIHsKICAgIHRpdGxlOiBgJHtuYW1lfSB8INio2LHZhtiv2KlgLAogICAgZGVzY3JpcHRpb246IGDYp9mE2YHYsdi5INin2YTYpdmE2YPYqtix2YjZhtmKINmE2YAgJHtuYW1lfSDYudmE2Ykg2YXZhti12Kkg2KjYsdmG2K/YqWAsCiAgICBtYW5pZmVzdDogYC9hcGkvcHdhLyR7ZW5jb2RlVVJJQ29tcG9uZW50KHNsdWcpfS9tYW5pZmVzdGAsCiAgICBpY29uczogewogICAgICBpY29uOiBbeyB1cmw6IGljb25VcmwgfV0sCiAgICAgIHNob3J0Y3V0OiBbeyB1cmw6IGljb25VcmwgfV0sCiAgICAgIGFwcGxlOiBbeyB1cmw6IGljb25VcmwgfV0sCiAgICB9LAogICAgb3BlbkdyYXBoOiB7CiAgICAgIHRpdGxlOiBgJHtuYW1lfSB8INio2LHZhtiv2KlgLAogICAgICBkZXNjcmlwdGlvbjogYNin2YTZgdix2Lkg2KfZhNil2YTZg9iq2LHZiNmG2Yog2YTZgCAke25hbWV9INi52YTZiSDZhdmG2LXYqSDYqNix2YbYr9ipYCwKICAgICAgaW1hZ2VzOiBbeyB1cmw6IGljb25VcmwgfV0sCiAgICB9LAogIH07Cn0KCmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uIENhZmVTbHVnTGF5b3V0KHsgY2hpbGRyZW4gfTogUHJvcHMpIHsKICByZXR1cm4gY2hpbGRyZW47Cn0K"
};

const PATCH_NAME = "cafe-logo-priority-final";

function nowStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function fail(message) {
  console.error("\n[Barndaksa patch] " + message);
  process.exit(1);
}

function ensureProjectRoot(projectRoot) {
  if (!fs.existsSync(path.join(projectRoot, "package.json"))) {
    fail("شغل الأمر من جذر المشروع E:\branda-platform وليس من داخل مجلد الباتش.");
  }
}

function backupFile(projectRoot, backupDir, relativePath) {
  const target = path.join(projectRoot, relativePath);
  if (!fs.existsSync(target)) return;
  const backup = path.join(backupDir, relativePath + ".bak");
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(target, backup);
}

function writePayloadFile(projectRoot, backupDir, relativePath, payloadBase64) {
  const target = path.join(projectRoot, relativePath);
  backupFile(projectRoot, backupDir, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(payloadBase64, "base64").toString("utf8"), "utf8");
}

function readRequired(projectRoot, relativePath) {
  const target = path.join(projectRoot, relativePath);
  if (!fs.existsSync(target)) fail("الملف المطلوب غير موجود: " + relativePath);
  return fs.readFileSync(target, "utf8");
}

function writePatched(projectRoot, backupDir, relativePath, nextContent) {
  const target = path.join(projectRoot, relativePath);
  backupFile(projectRoot, backupDir, relativePath);
  fs.writeFileSync(target, nextContent, "utf8");
}

function addImport(content, importLine, afterNeedle) {
  if (content.includes(importLine)) return content;
  if (content.includes(afterNeedle)) return content.replace(afterNeedle, afterNeedle + importLine + "\n");
  const useClient = content.startsWith('"use client";');
  if (useClient) {
    return content.replace('"use client";\n\n', '"use client";\n\n' + importLine + "\n");
  }
  return importLine + "\n" + content;
}

function patchThemedShell(projectRoot, backupDir) {
  const relativePath = "components/cafe/themes/themed-cafe-shell.tsx";
  let content = readRequired(projectRoot, relativePath);
  content = addImport(
    content,
    'import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";',
    'import { useResolvedCafeLogoUrl } from "@/lib/cafe/use-resolved-cafe-logo";\n'
  );
  content = content.replace(/logoUrl=\{\s*identityLogoUrl\s*\?\?\s*cafeLogoUrl\s*\}/g, 'logoUrl={getPreferredCafeDisplayLogoUrl(cafeLogoUrl, identityLogoUrl)}');
  content = content.replace(/logoUrl=\{\s*identityLogoUrl\s*\?\?\s*cafeLogoUrl\s*\?\?\s*undefined\s*\}/g, 'logoUrl={getPreferredCafeDisplayLogoUrl(cafeLogoUrl, identityLogoUrl)}');
  writePatched(projectRoot, backupDir, relativePath, content);
}

function patchCafePageClient(projectRoot, backupDir) {
  const relativePath = "components/cafe/cafe-page-client.tsx";
  let content = readRequired(projectRoot, relativePath);
  content = addImport(
    content,
    'import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";',
    'import { useCustomIdentityVisuals } from "@/lib/cafe/use-custom-identity-visuals";\n'
  );
  content = content.replace(/const\s+logoUrl\s*=\s*settings\.logoAssetId\s*;/g, 'const logoUrl = settings.logoDataUrl;');
  content = content.replace(/const\s+logoUrl\s*=\s*getPreferredCafeDisplayLogoUrl\(settings\.logoDataUrl\)\s*;/g, 'const logoUrl = settings.logoDataUrl;');
  content = content.replace(/const\s+appliedLogoUrl\s*=\s*identityLogoUrl\s*\?\?\s*logoUrl\s*;/g, 'const appliedLogoUrl = getPreferredCafeDisplayLogoUrl(logoUrl, identityLogoUrl);');
  content = content.replace(/const\s+appliedLogoUrl\s*=\s*logoUrl\s*\?\?\s*identityLogoUrl\s*;/g, 'const appliedLogoUrl = getPreferredCafeDisplayLogoUrl(logoUrl, identityLogoUrl);');
  writePatched(projectRoot, backupDir, relativePath, content);
}

function patchBrandIdentityTheme(projectRoot, backupDir) {
  const relativePath = "components/cafe/themes/brand-identity-custom-theme.tsx";
  const target = path.join(projectRoot, relativePath);
  if (!fs.existsSync(target)) return;
  let content = fs.readFileSync(target, "utf8");
  content = addImport(
    content,
    'import { getPreferredCafeDisplayLogoUrl } from "@/lib/cafe/cafe-display-logo";',
    'import { getCafePath } from "@/lib/cafe/theme-links";\n'
  );
  content = content.replace(/const\s+logoUrl\s*=\s*identityLogoUrl\s*\?\?\s*cafeLogoUrl\s*;/g, 'const logoUrl = getPreferredCafeDisplayLogoUrl(cafeLogoUrl, identityLogoUrl);');
  writePatched(projectRoot, backupDir, relativePath, content);
}

function verify(projectRoot) {
  const checks = [
    ["lib/cafe/cafe-display-logo.ts", "DEFAULT_BARNDAKSA_CAFE_LOGO"],
    ["components/cafe/cafe-logo.tsx", "DEFAULT_BARNDAKSA_CAFE_LOGO"],
    ["components/cafe/themes/themed-cafe-shell.tsx", "getPreferredCafeDisplayLogoUrl(cafeLogoUrl, identityLogoUrl)"],
    ["components/cafe/cafe-page-client.tsx", "getPreferredCafeDisplayLogoUrl(logoUrl, identityLogoUrl)"],
    ["app/api/pwa/[slug]/manifest/route.ts", "settings?.logoDataUrl"],
    ["app/c/[slug]/layout.tsx", "generateMetadata"],
  ];

  for (const [relativePath, marker] of checks) {
    const target = path.join(projectRoot, relativePath);
    if (!fs.existsSync(target)) fail("فشل التحقق: الملف غير موجود " + relativePath);
    const content = fs.readFileSync(target, "utf8");
    if (!content.includes(marker)) fail("فشل التحقق في " + relativePath + ": العلامة غير موجودة " + marker);
  }

  const cafePage = fs.readFileSync(path.join(projectRoot, "components/cafe/cafe-page-client.tsx"), "utf8");
  if (cafePage.includes("const logoUrl = settings.logoAssetId;")) {
    fail("فشل التحقق: صفحة الفرع ما زالت تستخدم مسار الشعار الخام من Storage.");
  }
}

const projectRoot = process.cwd();
ensureProjectRoot(projectRoot);

const backupDir = path.join(projectRoot, ".barndaksa-patch-backups", PATCH_NAME + "-" + nowStamp());
fs.mkdirSync(backupDir, { recursive: true });

for (const [relativePath, payload] of Object.entries(PAYLOADS)) {
  writePayloadFile(projectRoot, backupDir, relativePath, payload);
}

patchThemedShell(projectRoot, backupDir);
patchCafePageClient(projectRoot, backupDir);
patchBrandIdentityTheme(projectRoot, backupDir);
verify(projectRoot);

console.log("\n✅ تم توحيد شعار الفرع الإلكتروني وشعار المتصفح حسب الأولوية المطلوبة.");
console.log("✅ الأولوية الآن: شعار إعدادات الكوفي ← شعار ثيم الكوفي ← شعار برندة.");
console.log("✅ تم تحديث favicon/manifest الخاص بكل فرع إلكتروني.");
console.log("✅ نسخة احتياطية: " + path.relative(projectRoot, backupDir));
console.log("\nشغل الآن:");
console.log("npm exec tsc -- --noEmit");
console.log("npm run build");
console.log("\nبعد التشغيل افتح نافذة Incognito أو امسح كاش الموقع لأن أيقونة المتصفح تتأخر أحيانًا بسبب كاش Chrome.");
