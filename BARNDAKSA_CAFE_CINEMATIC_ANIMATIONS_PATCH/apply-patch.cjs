const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PATCH_NAME = 'BARNDAKSA_CAFE_CINEMATIC_ANIMATIONS_PATCH';
const BACKUP_DIR = path.join(ROOT, `.barndaksa-backups/${PATCH_NAME}-${new Date().toISOString().replace(/[:.]/g, '-')}`);

function filePath(rel) {
  return path.join(ROOT, rel);
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

function write(rel, content, before) {
  if (content === before) return false;
  backup(rel, before);
  fs.writeFileSync(filePath(rel), content, 'utf8');
  return true;
}

function replaceAllSafe(rel, transforms) {
  const before = read(rel);
  let content = before;
  const warnings = [];

  for (const t of transforms) {
    const label = t.label || String(t.search);
    const old = content;
    if (typeof t.search === 'string') {
      if (content.includes(t.search)) {
        content = content.split(t.search).join(t.replace);
      }
    } else {
      content = content.replace(t.search, t.replace);
    }
    if (content === old && !t.optional) warnings.push(`${rel}: لم أجد النمط: ${label}`);
  }

  const changed = write(rel, content, before);
  return { changed, warnings };
}

function appendCss() {
  const rel = 'app/globals.css';
  const before = read(rel);
  if (before.includes('BARNDAKSA_CAFE_CINEMATIC_ANIMATIONS_V1')) {
    return { changed: false, warnings: [] };
  }

  const block = String.raw`

/* BARNDAKSA_CAFE_CINEMATIC_ANIMATIONS_V1 */
@keyframes barndaksa-cinematic-rise {
  0% {
    opacity: 0;
    transform: translate3d(0, 28px, 0) scale(0.975);
    filter: blur(10px);
  }
  58% {
    opacity: 1;
    filter: blur(0);
  }
  100% {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
    filter: blur(0);
  }
}

@keyframes barndaksa-cinematic-float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(0, -8px, 0); }
}

@keyframes barndaksa-cinematic-shine {
  0% { transform: translateX(135%) skewX(-18deg); opacity: 0; }
  18% { opacity: 0.9; }
  100% { transform: translateX(-135%) skewX(-18deg); opacity: 0; }
}

@keyframes barndaksa-cinematic-glow {
  0%, 100% { opacity: 0.35; transform: scale(1); }
  50% { opacity: 0.75; transform: scale(1.08); }
}

@keyframes barndaksa-cinematic-line {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

.barndaksa-cinematic-page {
  scroll-behavior: smooth;
}

.barndaksa-cinematic-stage > * {
  animation: barndaksa-cinematic-rise 720ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.barndaksa-cinematic-stage > *:nth-child(1) { animation-delay: 40ms; }
.barndaksa-cinematic-stage > *:nth-child(2) { animation-delay: 105ms; }
.barndaksa-cinematic-stage > *:nth-child(3) { animation-delay: 170ms; }
.barndaksa-cinematic-stage > *:nth-child(4) { animation-delay: 235ms; }
.barndaksa-cinematic-stage > *:nth-child(5) { animation-delay: 300ms; }
.barndaksa-cinematic-stage > *:nth-child(6) { animation-delay: 365ms; }
.barndaksa-cinematic-stage > *:nth-child(n + 7) { animation-delay: 430ms; }

.barndaksa-stagger-grid > * {
  animation: barndaksa-cinematic-rise 680ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.barndaksa-stagger-grid > *:nth-child(1) { animation-delay: 40ms; }
.barndaksa-stagger-grid > *:nth-child(2) { animation-delay: 95ms; }
.barndaksa-stagger-grid > *:nth-child(3) { animation-delay: 150ms; }
.barndaksa-stagger-grid > *:nth-child(4) { animation-delay: 205ms; }
.barndaksa-stagger-grid > *:nth-child(5) { animation-delay: 260ms; }
.barndaksa-stagger-grid > *:nth-child(6) { animation-delay: 315ms; }
.barndaksa-stagger-grid > *:nth-child(n + 7) { animation-delay: 370ms; }

.barndaksa-premium-card {
  position: relative;
  isolation: isolate;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  transition:
    transform 420ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 420ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 420ms cubic-bezier(0.16, 1, 0.3, 1),
    filter 420ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: transform;
}

.barndaksa-premium-card::before {
  content: "";
  position: absolute;
  inset: -1px;
  z-index: 3;
  pointer-events: none;
  border-radius: inherit;
  background: linear-gradient(115deg, transparent 0%, transparent 35%, rgba(255, 255, 255, 0.72) 48%, transparent 62%, transparent 100%);
  transform: translateX(135%) skewX(-18deg);
  opacity: 0;
  mix-blend-mode: soft-light;
}

.barndaksa-premium-card::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  border-radius: inherit;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.55),
    0 18px 45px rgba(49, 25, 18, 0.08);
  opacity: 0.82;
  transition: opacity 420ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 420ms cubic-bezier(0.16, 1, 0.3, 1);
}

.barndaksa-premium-card:hover,
.barndaksa-premium-card:focus-visible {
  transform: translate3d(0, -8px, 0) scale(1.012);
  box-shadow: 0 30px 76px rgba(49, 25, 18, 0.16);
  filter: saturate(1.04) contrast(1.01);
}

.barndaksa-premium-card:hover::before,
.barndaksa-premium-card:focus-visible::before {
  animation: barndaksa-cinematic-shine 950ms cubic-bezier(0.16, 1, 0.3, 1);
}

.barndaksa-premium-card:hover::after,
.barndaksa-premium-card:focus-visible::after {
  opacity: 1;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 28px 80px rgba(49, 25, 18, 0.18);
}

.barndaksa-product-motion img,
.barndaksa-product-motion video,
.barndaksa-offer-motion img,
.barndaksa-offer-motion video,
.barndaksa-reservation-motion img,
.barndaksa-reservation-motion video {
  transform: translate3d(0, 0, 0) scale(1);
  transition: transform 760ms cubic-bezier(0.16, 1, 0.3, 1), filter 760ms cubic-bezier(0.16, 1, 0.3, 1);
}

.barndaksa-product-motion:hover img,
.barndaksa-product-motion:focus-visible img,
.barndaksa-product-motion:hover video,
.barndaksa-product-motion:focus-visible video {
  transform: scale(1.085) rotate(0.35deg);
  filter: saturate(1.08) contrast(1.04);
}

.barndaksa-offer-motion {
  overflow: hidden;
}

.barndaksa-offer-motion::before {
  mix-blend-mode: screen;
}

.barndaksa-reservation-motion[data-selected="true"],
.barndaksa-reservation-motion[aria-pressed="true"] {
  transform: translate3d(0, -6px, 0) scale(1.018);
  box-shadow: 0 32px 90px rgba(217, 163, 63, 0.25), 0 18px 48px rgba(49, 25, 18, 0.14);
}

.barndaksa-premium-hero {
  position: relative;
  isolation: isolate;
  overflow: hidden;
  animation: barndaksa-cinematic-rise 780ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

.barndaksa-premium-hero::before {
  content: "";
  position: absolute;
  inset: -35%;
  z-index: -1;
  pointer-events: none;
  background:
    radial-gradient(circle at 18% 18%, rgba(217, 163, 63, 0.24), transparent 28%),
    radial-gradient(circle at 78% 24%, rgba(107, 58, 37, 0.14), transparent 30%),
    linear-gradient(110deg, transparent 25%, rgba(255, 255, 255, 0.18), transparent 55%);
  animation: barndaksa-cinematic-glow 4.8s ease-in-out infinite;
}

.barndaksa-cta-motion {
  position: relative;
  overflow: hidden;
}

.barndaksa-cta-motion::after {
  content: "";
  position: absolute;
  inset: auto 16% 7px 16%;
  height: 2px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, currentColor, transparent);
  background-size: 200% 100%;
  opacity: 0.42;
  animation: barndaksa-cinematic-line 2.4s linear infinite;
}

@media (hover: none) {
  .barndaksa-premium-card:hover,
  .barndaksa-premium-card:focus-visible {
    transform: translate3d(0, -3px, 0) scale(1.004);
  }
}

@media (prefers-reduced-motion: reduce) {
  .barndaksa-cinematic-stage > *,
  .barndaksa-stagger-grid > *,
  .barndaksa-premium-hero,
  .barndaksa-premium-card,
  .barndaksa-premium-card::before,
  .barndaksa-premium-card::after,
  .barndaksa-product-motion img,
  .barndaksa-product-motion video,
  .barndaksa-offer-motion img,
  .barndaksa-offer-motion video,
  .barndaksa-reservation-motion img,
  .barndaksa-reservation-motion video,
  .barndaksa-cta-motion::after {
    animation: none !important;
    transition: none !important;
    transform: none !important;
    filter: none !important;
  }
}
`;
  return { changed: write(rel, before + block, before), warnings: [] };
}

const results = [];
function runPatch(rel, transforms) {
  try {
    const result = replaceAllSafe(rel, transforms);
    results.push({ rel, ...result });
  } catch (error) {
    results.push({ rel, changed: false, warnings: [String(error.message || error)] });
  }
}

try {
  results.push({ rel: 'app/globals.css', ...appendCss() });

  runPatch('components/cafe/themes/themed-cafe-shell.tsx', [
    {
      label: 'page shell cinematic class',
      search: 'className="brand-identity-custom-theme relative min-h-screen bg-[#FCF8F3] text-[#311912]"',
      replace: 'className="brand-identity-custom-theme barndaksa-cinematic-page relative min-h-screen bg-[#FCF8F3] text-[#311912]"',
      optional: true,
    },
    {
      label: 'content stage cinematic class',
      search: 'className={`brand-cafe-fields mx-auto ${maxWidth} px-4 py-6 sm:px-6 sm:py-8 ${className}`}',
      replace: 'className={`brand-cafe-fields barndaksa-cinematic-stage mx-auto ${maxWidth} px-4 py-6 sm:px-6 sm:py-8 ${className}`}',
      optional: true,
    },
  ]);

  runPatch('components/cafe/themes/themed-product-card.tsx', [
    {
      label: 'ThemedProductCard premium motion class',
      search: 'className={`${theme.card} ${theme.cardHover} group block overflow-hidden transition`}',
      replace: 'className={`${theme.card} ${theme.cardHover} barndaksa-premium-card barndaksa-product-motion group block overflow-hidden transition`}',
      optional: true,
    },
  ]);

  runPatch('components/cafe/themes/theme-shared.tsx', [
    {
      label: 'ThemeBannerCarousel offer motion',
      search: 'className={`mt-6 animate-barndaksa-fade ${shell} ${theme.card}`}',
      replace: 'className={`mt-6 animate-barndaksa-fade barndaksa-premium-card barndaksa-offer-motion ${shell} ${theme.card}`}',
      optional: true,
    },
    {
      label: 'ThemeProductCard base premium motion',
      search: 'const base = `${theme.card} ${theme.cardHover} group block overflow-hidden transition ${className}`;',
      replace: 'const base = `${theme.card} ${theme.cardHover} barndaksa-premium-card barndaksa-product-motion group block overflow-hidden transition ${className}`;',
      optional: true,
    },
    {
      label: 'ThemeCategoryStrip animated links',
      search: '? `min-w-[7rem] rounded-2xl px-4 py-3 text-center text-sm font-black ${theme.card} ${theme.cardHover}`\n              : `rounded-full px-4 py-2 text-sm font-black ${theme.badge} ${theme.cardHover}`',
      replace: '? `min-w-[7rem] rounded-2xl px-4 py-3 text-center text-sm font-black barndaksa-premium-card ${theme.card} ${theme.cardHover}`\n              : `rounded-full px-4 py-2 text-sm font-black barndaksa-premium-card ${theme.badge} ${theme.cardHover}`',
      optional: true,
    },
  ]);

  runPatch('components/cafe/themes/cafe-page-client.tsx', [
    {
      label: 'home product card premium class',
      search: 'className="block overflow-hidden rounded-[28px] border border-[#E7D7C6] bg-white shadow-[0_14px_38px_rgba(49,25,18,0.08)]"',
      replace: 'className="barndaksa-premium-card barndaksa-product-motion block overflow-hidden rounded-[28px] border border-[#E7D7C6] bg-white shadow-[0_14px_38px_rgba(49,25,18,0.08)]"',
      optional: true,
    },
    {
      label: 'home hero premium class',
      search: '<section className="rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">',
      replace: '<section className="barndaksa-premium-hero rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">',
      optional: true,
    },
    {
      label: 'home offer premium class',
      search: '<section className="mt-5 overflow-hidden rounded-[32px] border border-[#E7D7C6] bg-gradient-to-l from-[#6B3A25] to-[#3A2117] p-5 text-white shadow-[0_18px_45px_rgba(49,25,18,0.12)]">',
      replace: '<section className="barndaksa-premium-card barndaksa-offer-motion mt-5 overflow-hidden rounded-[32px] border border-[#E7D7C6] bg-gradient-to-l from-[#6B3A25] to-[#3A2117] p-5 text-white shadow-[0_18px_45px_rgba(49,25,18,0.12)]">',
      optional: true,
    },
    {
      label: 'home product grid stagger',
      search: '<div className="grid gap-4">',
      replace: '<div className="barndaksa-stagger-grid grid gap-4">',
      optional: true,
    },
    {
      label: 'home categories strip stagger',
      search: '<div className="flex gap-2 overflow-x-auto pb-2">',
      replace: '<div className="barndaksa-stagger-grid flex gap-2 overflow-x-auto pb-2">',
      optional: true,
    },
    {
      label: 'home category chip premium',
      search: 'className="shrink-0 rounded-2xl border border-[#E7D7C6] bg-white px-4 py-3 text-sm font-black text-[#6B3A25]"',
      replace: 'className="barndaksa-premium-card shrink-0 rounded-2xl border border-[#E7D7C6] bg-white px-4 py-3 text-sm font-black text-[#6B3A25]"',
      optional: true,
    },
    {
      label: 'home branches card premium',
      search: '<section className="mt-6 rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">',
      replace: '<section className="barndaksa-premium-card mt-6 rounded-[32px] border border-[#E7D7C6] bg-white p-5 shadow-[0_18px_45px_rgba(49,25,18,0.08)]">',
      optional: true,
    },
    {
      label: 'home CTA motion 1',
      search: 'className="flex items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-4 py-3 text-sm font-black text-white"',
      replace: 'className="barndaksa-cta-motion flex items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-4 py-3 text-sm font-black text-white"',
      optional: true,
    },
    {
      label: 'home CTA motion 2',
      search: 'className="flex items-center justify-center gap-2 rounded-2xl border border-[#6B3A25] px-4 py-3 text-sm font-black text-[#6B3A25]"',
      replace: 'className="barndaksa-cta-motion flex items-center justify-center gap-2 rounded-2xl border border-[#6B3A25] px-4 py-3 text-sm font-black text-[#6B3A25]"',
      optional: true,
    },
  ]);

  runPatch('components/cafe/product-collection-page.tsx', [
    {
      label: 'collection page stage',
      search: '<div className="space-y-8">',
      replace: '<div className="barndaksa-cinematic-stage space-y-8">',
      optional: true,
    },
    {
      label: 'offer cards premium',
      search: 'className={`p-5 ${theme.card}`}',
      replace: 'className={`barndaksa-premium-card barndaksa-offer-motion p-5 ${theme.card}`}',
      optional: true,
    },
    {
      label: 'branches cards premium',
      search: 'className={`p-6 ${theme.card}`}',
      replace: 'className={`barndaksa-premium-card p-6 ${theme.card}`}',
      optional: true,
    },
    {
      label: 'product collection stagger grid',
      search: '<div className={gridClass}>',
      replace: '<div className={`${gridClass} barndaksa-stagger-grid`}>',
      optional: true,
    },
  ]);

  runPatch('components/cafe/themes/themed-reservation-panel.tsx', [
    {
      label: 'reservation hero premium',
      search: '<section className={`mb-8 overflow-hidden ${heroClass}`}>',
      replace: '<section className={`barndaksa-premium-hero mb-8 overflow-hidden ${heroClass}`}>',
      optional: true,
    },
    {
      label: 'reservation stats premium',
      search: 'className={`rounded-2xl border p-3 text-center ${theme.card}`}',
      replace: 'className={`barndaksa-premium-card rounded-2xl border p-3 text-center ${theme.card}`}',
      optional: true,
    },
    {
      label: 'reservation form wrap premium kiosk',
      search: '? `rounded-lg border-2 p-6 ${theme.card}`',
      replace: '? `barndaksa-premium-card rounded-lg border-2 p-6 ${theme.card}`',
      optional: true,
    },
    {
      label: 'reservation form wrap premium normal',
      search: ': `rounded-[28px] p-6 ${theme.card}`;',
      replace: ': `barndaksa-premium-card rounded-[28px] p-6 ${theme.card}`;',
      optional: true,
    },
  ]);

  runPatch('app/c/[slug]/reserve/page.tsx', [
    {
      label: 'reservation service button premium selected',
      search: 'className={`overflow-hidden rounded-[28px] border text-right transition ${selected ? "scale-[1.01] border-[#D9A33F] shadow-xl" : "border-black/10 hover:-translate-y-0.5"} ${theme.card}`}',
      replace: 'aria-pressed={selected}\n            data-selected={selected ? "true" : "false"}\n            className={`barndaksa-premium-card barndaksa-reservation-motion overflow-hidden rounded-[28px] border text-right transition ${selected ? "scale-[1.01] border-[#D9A33F] shadow-xl" : "border-black/10 hover:-translate-y-0.5"} ${theme.card}`}',
      optional: true,
    },
    {
      label: 'reservation service grid stagger',
      search: '<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">',
      replace: '<div className="barndaksa-stagger-grid grid gap-5 md:grid-cols-2 xl:grid-cols-3">',
      optional: true,
    },
    {
      label: 'reservation data form premium',
      search: 'className={`grid gap-4 rounded-[28px] p-5 md:grid-cols-2 ${theme.card}`}',
      replace: 'className={`barndaksa-premium-card grid gap-4 rounded-[28px] p-5 md:grid-cols-2 ${theme.card}`}',
      optional: true,
    },
  ]);

  const changed = results.filter((r) => r.changed).map((r) => r.rel);
  const warnings = results.flatMap((r) => (r.warnings || []));

  console.log(`\n✅ ${PATCH_NAME} applied.`);
  console.log(`📦 Backup: ${path.relative(ROOT, BACKUP_DIR)}`);
  console.log(`📝 Changed files (${changed.length}):`);
  changed.forEach((rel) => console.log(` - ${rel}`));

  if (warnings.length) {
    console.log('\n⚠️ ملاحظات غير قاتلة:');
    warnings.forEach((w) => console.log(` - ${w}`));
  }

  console.log('\nبعد التطبيق شغل: npm exec tsc -- --noEmit ثم npm run build');
} catch (error) {
  console.error(`\n❌ Patch failed: ${error.message || error}`);
  process.exit(1);
}
