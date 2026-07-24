const pulse = "animate-pulse bg-[#E7D7C6]";
const card =
  "min-w-0 rounded-[16px] border border-[#E7D7C6] bg-[#FCF8F3] p-4";

export default function DashboardLoading() {
  return (
    <div
      aria-label="Loading dashboard"
      aria-live="polite"
      role="status"
      className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 overflow-hidden px-3 py-4 sm:px-4 sm:py-5 lg:px-5"
    >
      <header className="mb-5 flex min-h-[88px] flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className={`h-4 w-24 rounded-full ${pulse}`} />
          <div className={`mt-3 h-8 w-56 max-w-full rounded-xl ${pulse}`} />
          <div className={`mt-3 h-4 w-full max-w-xl rounded-full ${pulse}`} />
        </div>
        <div className={`h-12 w-36 rounded-2xl ${pulse}`} />
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${card} min-h-28`}>
            <div className={`h-7 w-7 rounded-lg ${pulse}`} />
            <div className={`mt-3 h-3 w-24 rounded-full ${pulse}`} />
            <div className={`mt-3 h-7 w-14 rounded-lg ${pulse}`} />
          </div>
        ))}
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 xl:grid-cols-4">
        <div className="min-w-0 rounded-[16px] border border-[#D9A33F]/25 bg-[#4A281D] p-4 xl:col-span-3">
          <div className="h-5 w-52 max-w-full animate-pulse rounded-lg bg-[#CBB29C]/35" />
          <div className="mt-8 flex h-52 items-end gap-3">
            {[40, 68, 52, 82, 58, 74].map((height, index) => (
              <div
                key={index}
                className="min-w-0 flex-1 animate-pulse rounded-t-xl bg-[#D9A33F]/40"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
        </div>
        <div className={`${card} min-h-72`}>
          <div className={`h-12 w-12 rounded-2xl ${pulse}`} />
          <div className={`mt-5 h-5 w-3/4 rounded-lg ${pulse}`} />
          <div className={`mt-4 h-4 w-full rounded-full ${pulse}`} />
          <div className={`mt-2 h-4 w-5/6 rounded-full ${pulse}`} />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className={`${card} min-h-48`}>
            <div className={`h-5 w-40 rounded-lg ${pulse}`} />
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((__, itemIndex) => (
                <div key={itemIndex} className={`h-12 rounded-xl ${pulse}`} />
              ))}
            </div>
          </div>
        ))}
      </section>
      <span className="sr-only">Loading</span>
    </div>
  );
}
