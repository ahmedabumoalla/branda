const pulse = "animate-pulse bg-[#E7D7C6]";
const card =
  "min-w-0 rounded-[16px] border border-[#E7D7C6] bg-[#FCF8F3] p-4";

export default function MenuLoading() {
  return (
    <div
      aria-label="Loading menu"
      aria-live="polite"
      role="status"
      className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 overflow-hidden px-3 py-4 sm:px-4 sm:py-5 lg:px-5"
    >
      <header className="mb-5 flex min-h-[88px] flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className={`h-4 w-24 rounded-full ${pulse}`} />
          <div className={`mt-3 h-8 w-48 max-w-full rounded-xl ${pulse}`} />
          <div className={`mt-3 h-4 w-full max-w-2xl rounded-full ${pulse}`} />
        </div>
        <div className="flex gap-2">
          <div className={`h-12 w-28 rounded-2xl ${pulse}`} />
          <div className="h-12 w-28 animate-pulse rounded-2xl bg-[#6B3A25]/30" />
        </div>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${card} min-h-24`}>
            <div className={`h-3 w-24 rounded-full ${pulse}`} />
            <div className={`mt-3 h-7 w-12 rounded-lg ${pulse}`} />
          </div>
        ))}
      </section>

      <section className={`${card} mb-6 min-h-36`}>
        <div className={`h-5 w-32 rounded-lg ${pulse}`} />
        <div className="mt-5 flex flex-wrap gap-3">
          {[96, 112, 88, 128].map((width, index) => (
            <div
              key={index}
              className={`h-10 rounded-xl ${pulse}`}
              style={{ width }}
            />
          ))}
        </div>
      </section>

      <section className="mb-5 flex min-w-0 flex-col gap-3 rounded-[16px] border border-[#E7D7C6] bg-white p-4 lg:flex-row">
        <div className={`h-12 min-w-0 flex-1 rounded-xl ${pulse}`} />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className={`h-12 w-24 rounded-2xl ${pulse}`} />
          ))}
        </div>
      </section>

      <section className={`${card} grid gap-6 md:grid-cols-2 xl:grid-cols-3`}>
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="min-w-0 rounded-2xl bg-[#F8F4EF] p-4">
            <div className={`aspect-[4/3] w-full rounded-xl ${pulse}`} />
            <div className={`mt-4 h-5 w-2/3 rounded-lg ${pulse}`} />
            <div className={`mt-3 h-4 w-24 rounded-full ${pulse}`} />
          </div>
        ))}
      </section>
      <span className="sr-only">Loading</span>
    </div>
  );
}
