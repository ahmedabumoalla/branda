const pulse = "motion-safe:animate-pulse bg-[#393329]";
const panel = "min-w-0 rounded-2xl border border-[#494033] bg-[#191612] p-5";

export default function AdminLoading() {
  return (
    <div dir="rtl" role="status" aria-live="polite" aria-busy="true" className="mx-auto w-full max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
      <span className="sr-only">جارٍ تحميل بيانات لوحة الإدارة</span>
      <div aria-hidden="true">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-5">
          <div className="min-w-0 flex-1">
            <div className={`h-3 w-24 rounded ${pulse}`} />
            <div className={`mt-4 h-9 w-64 max-w-full rounded-lg ${pulse}`} />
            <div className={`mt-3 h-3 w-96 max-w-full rounded ${pulse}`} />
          </div>
          <div className={`h-11 w-32 rounded-xl ${pulse}`} />
        </header>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className={panel}>
            <div className={`h-3 w-28 rounded ${pulse}`} />
            <div className={`mt-5 h-8 w-16 rounded ${pulse}`} />
          </div>)}
        </div>
        <section className={`${panel} mt-6`}>
          <div className="flex flex-wrap justify-between gap-4 border-b border-[#494033] pb-5">
            <div className={`h-10 w-72 max-w-full rounded-lg ${pulse}`} />
            <div className={`h-10 w-40 rounded-lg ${pulse}`} />
          </div>
          {[0, 1, 2, 3, 4].map((item) => <div key={item} className="grid grid-cols-3 gap-5 border-b border-[#494033]/50 py-6 last:border-0 sm:grid-cols-5">
            {[0, 1, 2, 3, 4].map((column) => <div key={column} className={`h-4 rounded ${pulse} ${column > 2 ? "hidden sm:block" : ""}`} />)}
          </div>)}
        </section>
      </div>
    </div>
  );
}
