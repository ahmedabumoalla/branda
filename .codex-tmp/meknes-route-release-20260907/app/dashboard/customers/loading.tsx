const pulse = "animate-pulse bg-[#E7D7C6]";
const card =
  "min-w-0 rounded-[16px] border border-[#E7D7C6] bg-[#FCF8F3] p-4";

export default function CustomersLoading() {
  return (
    <div
      aria-label="Loading customers"
      aria-live="polite"
      role="status"
      className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 overflow-hidden px-3 py-4 sm:px-4 sm:py-5 lg:px-5"
    >
      <header className="mb-5 min-h-[88px]">
        <div className={`h-4 w-24 rounded-full ${pulse}`} />
        <div className={`mt-3 h-8 w-44 rounded-xl ${pulse}`} />
        <div className={`mt-3 h-4 w-full max-w-2xl rounded-full ${pulse}`} />
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${card} min-h-24`}>
            <div className={`h-3 w-24 rounded-full ${pulse}`} />
            <div className={`mt-3 h-7 w-12 rounded-lg ${pulse}`} />
          </div>
        ))}
      </section>

      <div className="mb-5 rounded-[16px] border border-[#E7D7C6] bg-white p-4">
        <div className={`h-12 w-full rounded-xl ${pulse}`} />
      </div>

      <section className="space-y-4">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={card}>
            <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex min-w-0 gap-4">
                <div className="h-14 w-14 shrink-0 animate-pulse rounded-2xl bg-[#6B3A25]/25" />
                <div className="min-w-0 flex-1">
                  <div className={`h-6 w-44 max-w-full rounded-lg ${pulse}`} />
                  <div className={`mt-3 h-4 w-32 rounded-full ${pulse}`} />
                  <div className={`mt-2 h-3 w-48 max-w-full rounded-full ${pulse}`} />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 4 }).map((__, buttonIndex) => (
                  <div key={buttonIndex} className={`h-9 w-20 rounded-xl ${pulse}`} />
                ))}
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
              {Array.from({ length: 6 }).map((__, metricIndex) => (
                <div key={metricIndex} className={`h-24 rounded-2xl ${pulse}`} />
              ))}
            </div>
          </div>
        ))}
      </section>
      <span className="sr-only">Loading</span>
    </div>
  );
}
