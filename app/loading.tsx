export default function Loading() {
  return (
    <div dir="rtl" role="status" aria-live="polite" aria-busy="true" className="flex min-h-[40vh] items-center justify-center gap-3 px-6 text-sm text-[#6c5548]">
      <span aria-hidden="true" className="h-5 w-5 rounded-full border-2 border-current border-l-transparent motion-safe:animate-spin" />
      <span>جار تحميل الصفحة</span>
    </div>
  );
}
