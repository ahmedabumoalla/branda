const pulse = "animate-pulse bg-[#E7D7C6]";
const card =
  "min-w-0 rounded-[16px] border border-[#E7D7C6] bg-[#FCF8F3] p-4";

export default function CashierLoading() {
  return (
    <div
      aria-label="Loading cashier"
      aria-live="polite"
      role="status"
      className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 overflow-hidden px-3 py-4 sm:px-4 sm:py-5 lg:px-5"
    >
      <header className="mb-5 flex min-h-[88px] flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className={`h-4 w-24 rounded-full ${pulse}`} />
          <div className={`mt-3 h-8 w-44 rounded-xl ${pulse}`} />
          <div className={`mt-3 h-4 w-full max-w-2xl rounded-full ${pulse}`} />
        </div>
        <div className="h-12 w-36 animate-pulse rounded-2xl bg-[#6B3A25]/30" />
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

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className={`${card} min-h-56`}>
            <div className={`h-6 w-44 max-w-full rounded-lg ${pulse}`} />
            <div className={`mt-4 h-4 w-full rounded-full ${pulse}`} />
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {Array.from({ length: 3 }).map((__, fieldIndex) => (
                <div key={fieldIndex} className={`h-12 rounded-xl ${pulse}`} />
              ))}
            </div>
            <div className="mt-5 h-11 w-28 animate-pulse rounded-xl bg-[#6B3A25]/25" />
          </div>
        ))}
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <div key={index} className={`${card} min-h-52`}>
            <div className={`h-6 w-48 max-w-full rounded-lg ${pulse}`} />
            <div className={`mt-4 h-4 w-full rounded-full ${pulse}`} />
            <div className="mt-5 flex gap-3">
              <div className={`h-12 min-w-0 flex-1 rounded-xl ${pulse}`} />
              <div className="h-12 w-28 animate-pulse rounded-xl bg-[#6B3A25]/25" />
            </div>
          </div>
        ))}
      </section>
      <span className="sr-only">Loading</span>
    </div>
  );
}
