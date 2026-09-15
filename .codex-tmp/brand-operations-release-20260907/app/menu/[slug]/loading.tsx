export default function MenuLoading() {
  return <main dir="rtl" className="flex min-h-screen flex-col items-center justify-center gap-6 bg-[#f7f5ef] text-[#315e50]" aria-busy="true">
    <span className="text-5xl" aria-hidden="true">✦</span>
    <p role="status">نحضّر لك المنيو</p>
  </main>;
}
