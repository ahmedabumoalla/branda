const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PATCH_NAME = 'BARNDAKSA_HOME_INTRO_VIDEO_PRODUCTION_FIX_PATCH';
const BACKUP_DIR = path.join(ROOT, `.barndaksa-backups/${PATCH_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}`);

function filePath(rel) {
  return path.join(ROOT, rel);
}

function ensureDir(rel) {
  fs.mkdirSync(path.dirname(filePath(rel)), { recursive: true });
}

function read(rel) {
  const p = filePath(rel);
  if (!fs.existsSync(p)) throw new Error(`Missing file: ${rel}`);
  return fs.readFileSync(p, 'utf8');
}

function backup(rel, content) {
  const dest = path.join(BACKUP_DIR, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, content, 'utf8');
}

function write(rel, content) {
  const p = filePath(rel);
  const before = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
  if (before === content) return false;
  if (before !== null) backup(rel, before);
  ensureDir(rel);
  fs.writeFileSync(p, content, 'utf8');
  return true;
}

function replaceRequired(rel, search, replace, label) {
  const before = read(rel);
  if (!before.includes(search)) {
    if (before.includes(replace)) return false;
    throw new Error(`لم أجد النمط المطلوب في ${rel}: ${label}`);
  }
  return write(rel, before.split(search).join(replace));
}

function patchHomePageRoute() {
  const rel = 'app/page.tsx';
  const before = read(rel);
  if (before.includes('BARNDAKSA_HOME_PAGE_VIDEO_DYNAMIC_FIX')) return false;
  const insert = `// BARNDAKSA_HOME_PAGE_VIDEO_DYNAMIC_FIX\nexport const dynamic = "force-dynamic";\nexport const revalidate = 0;\nexport const fetchCache = "force-no-store";\n\n`;
  return write(rel, insert + before);
}

function patchPlatformHomePageClient() {
  const rel = 'components/marketing/platform-home-page.tsx';
  let content = read(rel);
  const before = content;

  const marker = 'const DEFAULT_HERO =';
  if (!content.includes('BARNDAKSA_INTRO_VIDEO_PRODUCTION_SRC_FIX')) {
    if (!content.includes(marker)) throw new Error(`لم أجد موضع إضافة دالة الفيديو في ${rel}`);
    const helper = `// BARNDAKSA_INTRO_VIDEO_PRODUCTION_SRC_FIX\nfunction platformMediaStreamUrl(id: string) {\n  return \`/api/public/platform-media/\${encodeURIComponent(id)}\`;\n}\n\n`;
    content = content.replace(marker, helper + marker);
  }

  const oldOpen = `  async function openVideo() {\n    setVideoOpen(true);\n    await recordIntroVideoEventAction("intro_video_click");\n  }`;
  const newOpen = `  function openVideo() {\n    setVideoOpen(true);\n    void recordIntroVideoEventAction("intro_video_click").catch((error) => {\n      console.error("[intro_video_click]", error);\n    });\n  }`;
  if (content.includes(oldOpen)) {
    content = content.replace(oldOpen, newOpen);
  } else if (!content.includes('console.error("[intro_video_click]"')) {
    throw new Error(`لم أجد دالة openVideo القديمة في ${rel}`);
  }

  const oldVideo = `<video src={data.introVideo.url} controls autoPlay className="max-h-[75vh] w-full rounded-2xl" onPlay={() => void recordIntroVideoEventAction("intro_video_view")} />`;
  const newVideo = `<video\n                key={data.introVideo.id}\n                src={platformMediaStreamUrl(data.introVideo.id)}\n                controls\n                autoPlay\n                playsInline\n                preload="metadata"\n                className="max-h-[75vh] w-full rounded-2xl"\n                onPlay={() => {\n                  void recordIntroVideoEventAction("intro_video_view").catch((error) => {\n                    console.error("[intro_video_view]", error);\n                  });\n                }}\n              />`;
  if (content.includes(oldVideo)) {
    content = content.replace(oldVideo, newVideo);
  } else if (!content.includes('src={platformMediaStreamUrl(data.introVideo.id)}')) {
    throw new Error(`لم أجد وسم الفيديو القديم في ${rel}`);
  }

  if (content === before) return false;
  return write(rel, content);
}

function writePlatformMediaRoute() {
  const rel = 'app/api/public/platform-media/[id]/route.ts';
  const content = `import { NextResponse } from "next/server";\nimport { createAdminClient } from "@/lib/supabase/admin";\n\ntype Props = {\n  params: Promise<{ id: string }>;\n};\n\nexport const dynamic = "force-dynamic";\nexport const revalidate = 0;\nexport const fetchCache = "force-no-store";\n\nfunction jsonError(message: string, status: number) {\n  return NextResponse.json(\n    { error: message },\n    {\n      status,\n      headers: {\n        "Cache-Control": "no-store, max-age=0",\n      },\n    }\n  );\n}\n\nexport async function GET(_request: Request, { params }: Props) {\n  const { id } = await params;\n  const safeId = id?.trim();\n\n  if (!safeId) {\n    return jsonError("Missing media id", 400);\n  }\n\n  try {\n    const admin = createAdminClient();\n    const { data: media, error } = await admin\n      .from("platform_media_assets")\n      .select("id, placement, media_type, storage_path, active")\n      .eq("id", safeId)\n      .eq("active", true)\n      .maybeSingle();\n\n    if (error) {\n      console.error("[platform-media:lookup]", error);\n      return jsonError("Failed to load media", 500);\n    }\n\n    if (!media || media.placement !== "intro_video" || media.media_type !== "video") {\n      return jsonError("Media not found", 404);\n    }\n\n    const storagePath = String(media.storage_path ?? "").trim();\n    if (!storagePath) {\n      return jsonError("Media path is missing", 404);\n    }\n\n    const { data: signed, error: signError } = await admin.storage\n      .from("platform-media")\n      .createSignedUrl(storagePath, 60 * 60);\n\n    if (signError || !signed?.signedUrl) {\n      console.error("[platform-media:sign]", signError);\n      return jsonError("Failed to prepare media", 500);\n    }\n\n    return NextResponse.redirect(signed.signedUrl, {\n      status: 307,\n      headers: {\n        "Cache-Control": "no-store, max-age=0",\n      },\n    });\n  } catch (error) {\n    console.error("[platform-media]", error);\n    return jsonError("Unexpected media error", 500);\n  }\n}\n`;
  return write(rel, content);
}

function main() {
  if (!fs.existsSync(filePath('package.json'))) {
    throw new Error('شغل السكربت من جذر المشروع الذي يحتوي package.json');
  }

  const changed = [];
  if (patchHomePageRoute()) changed.push('app/page.tsx');
  if (patchPlatformHomePageClient()) changed.push('components/marketing/platform-home-page.tsx');
  if (writePlatformMediaRoute()) changed.push('app/api/public/platform-media/[id]/route.ts');

  console.log(`✅ ${PATCH_NAME} applied successfully`);
  console.log(`📦 Backup: ${BACKUP_DIR}`);
  console.log(changed.length ? `🛠️ Changed files:\n- ${changed.join('\n- ')}` : 'No changes needed.');
  console.log('\nNext commands:');
  console.log('npm exec tsc -- --noEmit');
  console.log('npm run build');
}

try {
  main();
} catch (error) {
  console.error('❌ Patch failed:', error instanceof Error ? error.message : error);
  process.exit(1);
}
