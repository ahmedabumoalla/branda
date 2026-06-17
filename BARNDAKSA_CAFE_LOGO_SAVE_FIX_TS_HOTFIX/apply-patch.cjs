const fs = require("fs");
const path = require("path");

const PATCH_NAME = "BARNDAKSA_CAFE_LOGO_SAVE_FIX_TS_HOTFIX";
const PATCH_PAYLOAD = [{"path": "lib/cafe/use-resolved-cafe-logo.ts", "encoding": "base64", "content": "InVzZSBjbGllbnQiOwoKaW1wb3J0IHsgdXNlRWZmZWN0LCB1c2VTdGF0ZSB9IGZyb20gInJlYWN0IjsKaW1wb3J0IHsKICBnZXRMb2NhbEFzc2V0T2JqZWN0VXJsLAogIHJldm9rZU9iamVjdFVybCwKfSBmcm9tICJAL2xpYi9jYWZlL2xvY2FsLWFzc2V0LXN0b3JlIjsKaW1wb3J0IHsKICBpc0h0dHBJbWFnZVVybCwKICBpc0xlZ2FjeURhdGFJbWFnZVVybCwKfSBmcm9tICJAL2xpYi9jYWZlL2ltYWdlLWFzc2V0LXBpcGVsaW5lIjsKaW1wb3J0IHR5cGUgeyBDYWZlU2V0dGluZ3MgfSBmcm9tICJAL2xpYi9tb2NrL2NhZmUtc2V0dGluZ3MiOwoKY29uc3QgcHVibGljVXJsQ2FjaGUgPSBuZXcgTWFwPHN0cmluZywgeyB1cmw6IHN0cmluZzsgZXhwaXJlc0F0OiBudW1iZXIgfT4oKTsKCmZ1bmN0aW9uIGlzUmVuZGVyYWJsZUltYWdlVXJsKHVybD86IHN0cmluZyB8IG51bGwpOiBib29sZWFuIHsKICByZXR1cm4gaXNIdHRwSW1hZ2VVcmwodXJsKSB8fCBpc0xlZ2FjeURhdGFJbWFnZVVybCh1cmwpIHx8IEJvb2xlYW4odXJsPy5zdGFydHNXaXRoKCIvIikpOwp9Cgphc3luYyBmdW5jdGlvbiByZXNvbHZlUHVibGljQ2FmZUxvZ29Vcmwoc3RvcmFnZVBhdGg6IHN0cmluZykgewogIGNvbnN0IGtleSA9IGBjYWZlLWxvZ29zOiR7c3RvcmFnZVBhdGh9YDsKICBjb25zdCBjYWNoZWQgPSBwdWJsaWNVcmxDYWNoZS5nZXQoa2V5KTsKCiAgaWYgKGNhY2hlZCAmJiBjYWNoZWQuZXhwaXJlc0F0ID4gRGF0ZS5ub3coKSArIDYwXzAwMCkgewogICAgcmV0dXJuIGNhY2hlZC51cmw7CiAgfQoKICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKAogICAgYC9hcGkvcHVibGljL3N0b3JhZ2U/YnVja2V0PWNhZmUtbG9nb3MmcGF0aD0ke2VuY29kZVVSSUNvbXBvbmVudChzdG9yYWdlUGF0aCl9YCwKICAgIHsgY2FjaGU6ICJuby1zdG9yZSIgfQogICk7CgogIGlmICghcmVzcG9uc2Uub2spIHJldHVybiB1bmRlZmluZWQ7CgogIGNvbnN0IHBheWxvYWQgPSAoYXdhaXQgcmVzcG9uc2UuanNvbigpKSBhcyB7IHVybD86IHN0cmluZzsgZXhwaXJlc0luPzogbnVtYmVyIH07CiAgaWYgKCFwYXlsb2FkLnVybCkgcmV0dXJuIHVuZGVmaW5lZDsKCiAgY29uc3QgZXhwaXJlc0luID0gTnVtYmVyKHBheWxvYWQuZXhwaXJlc0luID8/IDM2MDApOwogIHB1YmxpY1VybENhY2hlLnNldChrZXksIHsKICAgIHVybDogcGF5bG9hZC51cmwsCiAgICBleHBpcmVzQXQ6IERhdGUubm93KCkgKyBNYXRoLm1heCg2MCwgZXhwaXJlc0luIC0gNjApICogMTAwMCwKICB9KTsKCiAgcmV0dXJuIHBheWxvYWQudXJsOwp9CgpleHBvcnQgZnVuY3Rpb24gdXNlUmVzb2x2ZWRDYWZlTG9nb1VybCgKICBzZXR0aW5nczogQ2FmZVNldHRpbmdzLAogIHByZXZpZXdVcmw/OiBzdHJpbmcKKSB7CiAgY29uc3QgW2xvZ29VcmwsIHNldExvZ29VcmxdID0gdXNlU3RhdGU8c3RyaW5nIHwgdW5kZWZpbmVkPigoKSA9PgogICAgcHJldmlld1VybCA/PyAoaXNSZW5kZXJhYmxlSW1hZ2VVcmwoc2V0dGluZ3MubG9nb0RhdGFVcmwpID8gc2V0dGluZ3MubG9nb0RhdGFVcmwgOiB1bmRlZmluZWQpCiAgKTsKCiAgdXNlRWZmZWN0KCgpID0+IHsKICAgIGxldCBjYW5jZWxsZWQgPSBmYWxzZTsKICAgIGxldCBvYmplY3RVcmw6IHN0cmluZyB8IHVuZGVmaW5lZDsKCiAgICBhc3luYyBmdW5jdGlvbiBsb2FkKCkgewogICAgICBpZiAocHJldmlld1VybCkgewogICAgICAgIHNldExvZ29VcmwocHJldmlld1VybCk7CiAgICAgICAgcmV0dXJuOwogICAgICB9CgogICAgICBjb25zdCBmYWxsYmFjayA9IGlzUmVuZGVyYWJsZUltYWdlVXJsKHNldHRpbmdzLmxvZ29EYXRhVXJsKQogICAgICAgID8gc2V0dGluZ3MubG9nb0RhdGFVcmwKICAgICAgICA6IHVuZGVmaW5lZDsKICAgICAgY29uc3QgYXNzZXRJZCA9IHNldHRpbmdzLmxvZ29Bc3NldElkOwoKICAgICAgaWYgKHR5cGVvZiBhc3NldElkID09PSAic3RyaW5nIiAmJiBhc3NldElkLmxlbmd0aCA+IDApIHsKICAgICAgICBpZiAoaXNSZW5kZXJhYmxlSW1hZ2VVcmwoYXNzZXRJZCkpIHsKICAgICAgICAgIGlmICghY2FuY2VsbGVkKSBzZXRMb2dvVXJsKGFzc2V0SWQpOwogICAgICAgICAgcmV0dXJuOwogICAgICAgIH0KCiAgICAgICAgLy8gUHJvZHVjdGlvbiBsb2dvcyBhcmUgc3RvcmVkIGFzIFN1cGFiYXNlIHN0b3JhZ2UgcGF0aHMsIG5vdCBJbmRleGVkREIgSURzLgogICAgICAgIC8vIFN0b3JhZ2UgcGF0aHMgdXN1YWxseSBjb250YWluIHNsYXNoZXMsIHNvIHJlc29sdmUgdGhlbSB0aHJvdWdoIHRoZSBzaWduZWQvcHVibGljIHN0b3JhZ2UgQVBJIGZpcnN0LgogICAgICAgIGlmIChhc3NldElkLmluY2x1ZGVzKCIvIikpIHsKICAgICAgICAgIGNvbnN0IHNpZ25lZFVybCA9IGF3YWl0IHJlc29sdmVQdWJsaWNDYWZlTG9nb1VybChhc3NldElkKTsKICAgICAgICAgIGlmICghY2FuY2VsbGVkICYmIHNpZ25lZFVybCkgewogICAgICAgICAgICBzZXRMb2dvVXJsKHNpZ25lZFVybCk7CiAgICAgICAgICAgIHJldHVybjsKICAgICAgICAgIH0KICAgICAgICB9CgogICAgICAgIC8vIEtlZXAgc3VwcG9ydCBmb3Igb2xkIGxvY2FsIEluZGV4ZWREQiBsb2dvIElEcy4KICAgICAgICBvYmplY3RVcmwgPSBhd2FpdCBnZXRMb2NhbEFzc2V0T2JqZWN0VXJsKGFzc2V0SWQpOwogICAgICAgIGlmIChvYmplY3RVcmwpIHsKICAgICAgICAgIGlmICghY2FuY2VsbGVkKSBzZXRMb2dvVXJsKG9iamVjdFVybCk7CiAgICAgICAgICByZXR1cm47CiAgICAgICAgfQogICAgICB9CgogICAgICBpZiAoIWNhbmNlbGxlZCkgc2V0TG9nb1VybChmYWxsYmFjayk7CiAgICB9CgogICAgdm9pZCBsb2FkKCk7CgogICAgcmV0dXJuICgpID0+IHsKICAgICAgY2FuY2VsbGVkID0gdHJ1ZTsKICAgICAgaWYgKG9iamVjdFVybCkgcmV2b2tlT2JqZWN0VXJsKG9iamVjdFVybCk7CiAgICB9OwogIH0sIFtzZXR0aW5ncy5sb2dvQXNzZXRJZCwgc2V0dGluZ3MubG9nb0RhdGFVcmwsIHByZXZpZXdVcmxdKTsKCiAgcmV0dXJuIGxvZ29Vcmw7Cn0K"}];
const PATCH_MANIFEST = {
  "name": "BARNDAKSA_CAFE_LOGO_SAVE_FIX_TS_HOTFIX",
  "createdAt": "2026-06-17",
  "description": "Fixes the TypeScript narrowing error in use-resolved-cafe-logo.ts after the cafe logo save fix patch.",
  "databaseChanges": false,
  "files": [
    "lib/cafe/use-resolved-cafe-logo.ts"
  ],
  "runFromProjectRoot": "node BARNDAKSA_CAFE_LOGO_SAVE_FIX_TS_HOTFIX/apply-patch.cjs"
};

function fail(message) {
  console.error(`
[${PATCH_NAME}] ${message}
`);
  process.exit(1);
}

function findProjectRoot() {
  const candidates = [process.cwd(), path.dirname(__dirname), path.resolve(__dirname, "..")];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(path.join(candidate, "package.json"))) return candidate;
  }
  fail(`ضع مجلد الباتش داخل جذر المشروع ثم شغل: node ${PATCH_NAME}/apply-patch.cjs`);
}

function removeDirIfExists(target) {
  try {
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
      console.log(`✓ Removed stale folder: ${path.relative(process.cwd(), target) || target}`);
    }
  } catch (error) {
    console.warn(`! Could not remove stale folder ${target}: ${error.message}`);
  }
}

function writeFileSafe(projectRoot, relativePath, contentBuffer, backupRoot) {
  const cleanPath = relativePath.replaceAll("\\", "/");
  if (cleanPath.includes("..") || path.isAbsolute(cleanPath)) fail(`Unsafe patch path blocked: ${relativePath}`);

  const target = path.join(projectRoot, cleanPath);
  const backup = path.join(backupRoot, cleanPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });

  if (fs.existsSync(target)) {
    fs.mkdirSync(path.dirname(backup), { recursive: true });
    fs.copyFileSync(target, backup);
  }

  fs.writeFileSync(target, contentBuffer);
  console.log(`✓ ${cleanPath}`);
}

const projectRoot = findProjectRoot();
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(projectRoot, ".barndaksa-patch-backups", `${PATCH_NAME}-${stamp}`);

console.log(`
Applying ${PATCH_NAME}...`);
console.log(`Project root: ${projectRoot}`);
console.log(`Backup root: ${backupRoot}
`);

for (const file of PATCH_PAYLOAD) {
  if (!file.path || file.encoding !== "base64" || typeof file.content !== "string") {
    fail(`Invalid embedded patch payload for ${file.path || "unknown file"}`);
  }
  writeFileSafe(projectRoot, file.path, Buffer.from(file.content, "base64"), backupRoot);
}

console.log("
Cleaning old extracted patch payload folders so TypeScript does not scan them...");
removeDirIfExists(path.join(__dirname, "patch-files"));
removeDirIfExists(path.join(__dirname, "files"));
removeDirIfExists(path.join(projectRoot, "patch-files"));

console.log("
Done. Next commands:");
console.log("npm exec tsc -- --noEmit");
console.log("npm run build");
console.log("
What this fixes:");
console.log("- Fixes TS2339: Property 'includes' does not exist on type 'never'.");
console.log("- Keeps the cafe logo Supabase storage-path resolver active.");
console.log("- No database migration required.");
