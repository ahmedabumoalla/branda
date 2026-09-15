const pulse = "animate-pulse bg-[#E7D7C6]";
const card =
  "min-w-0 rounded-[16px] border border-[#E7D7C6] bg-[#FCF8F3] p-4 sm:p-5";

export default function OrdersLoading() {
  return (
    <div
      aria-label="Loading orders"
      aria-live="polite"
      role="status"
      className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 overflow-hidden px-3 py-4 sm:px-4 sm:py-5 lg:px-5"
    >
      <header className="mb-5 min-h-[88px]">
        <div className={`h-4 w-24 rounded-full ${pulse}`} />
        <div className={`mt-3 h-8 w-44 rounded-xl ${pulse}`} />
        <div className={`mt-3 h-4 w-full max-w-xl rounded-full ${pulse}`} />
      </header>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:flex lg:flex-wrap">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className={`h-12 w-full rounded-2xl sm:w-32 ${pulse}`} />
        ))}
      </div>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${card} min-h-24`}>
            <div className={`h-3 w-24 rounded-full ${pulse}`} />
            <div className={`mt-3 h-7 w-14 rounded-lg ${pulse}`} />
          </div>
        ))}
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-4">
          {Array.from({ length: 2 }).map((_, index) => (
            <div key={index} className={`${card} min-h-80`}>
              <div className="flex min-w-0 gap-4">
                <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-[#6B3A25]/25" />
                <div className="min-w-0 flex-1">
                  <div className={`h-6 w-44 max-w-full rounded-lg ${pulse}`} />
                  <div className={`mt-3 h-4 w-64 max-w-full rounded-full ${pulse}`} />
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((__, metricIndex) => (
                  <div key={metricIndex} className={`h-20 rounded-2xl ${pulse}`} />
                ))}
              </div>
              <div className={`mt-4 h-28 rounded-2xl ${pulse}`} />
              <div className="mt-5 grid gap-2 sm:grid-cols-2">
                <div className="h-11 animate-pulse rounded-xl bg-[#6B3A25]/20" />
                <div className={`h-11 rounded-xl ${pulse}`} />
              </div>
            </div>
          ))}
        </div>
        <aside className={`${card} min-h-80 xl:sticky xl:top-6 xl:self-start`}>
          <div className={`h-4 w-24 rounded-full ${pulse}`} />
          <div className={`mt-3 h-7 w-44 max-w-full rounded-lg ${pulse}`} />
          <div className={`mt-5 h-24 rounded-2xl ${pulse}`} />
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div className={`h-24 rounded-2xl ${pulse}`} />
            <div className={`h-24 rounded-2xl ${pulse}`} />
          </div>
        </aside>
      </section>
      <span className="sr-only">Loading</span>
    </div>
  );
}
