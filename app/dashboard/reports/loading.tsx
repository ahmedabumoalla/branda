const pulse = "animate-pulse bg-[#E7D7C6]";
const card =
  "min-w-0 rounded-[16px] border border-[#E7D7C6] bg-[#FCF8F3] p-4";

export default function ReportsLoading() {
  return (
    <div
      aria-label="Loading reports"
      aria-live="polite"
      role="status"
      className="mx-auto min-h-screen w-full max-w-[1320px] min-w-0 overflow-hidden px-3 py-4 sm:px-4 sm:py-5 lg:px-5"
    >
      <header className="mb-5 min-h-[88px]">
        <div className={`h-4 w-24 rounded-full ${pulse}`} />
        <div className={`mt-3 h-8 w-40 rounded-xl ${pulse}`} />
        <div className={`mt-3 h-4 w-full max-w-xl rounded-full ${pulse}`} />
      </header>

      <div className="mb-6 flex flex-wrap gap-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={`h-12 w-32 rounded-2xl ${pulse}`} />
        ))}
      </div>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className={`${card} min-h-28`}>
            <div className={`h-7 w-7 rounded-lg ${pulse}`} />
            <div className={`mt-3 h-3 w-20 rounded-full ${pulse}`} />
            <div className={`mt-3 h-7 w-16 rounded-lg ${pulse}`} />
          </div>
        ))}
      </section>

      <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className={`${card} min-h-24`}>
            <div className={`h-3 w-24 rounded-full ${pulse}`} />
            <div className={`mt-3 h-7 w-14 rounded-lg ${pulse}`} />
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className={`${card} min-h-80`}>
          <div className={`h-5 w-40 rounded-lg ${pulse}`} />
          <div className="mt-8 space-y-5">
            {[82, 62, 74, 48, 68].map((width, index) => (
              <div key={index}>
                <div className={`mb-2 h-3 w-24 rounded-full ${pulse}`} />
                <div className="h-4 overflow-hidden rounded-full bg-[#F8F4EF]">
                  <div
                    className="h-full animate-pulse rounded-full bg-[#D9A33F]/45"
                    style={{ width: `${width}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className={`${card} min-h-80`}>
          <div className={`h-5 w-44 rounded-lg ${pulse}`} />
          <div className="mt-5 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className={`h-14 rounded-2xl ${pulse}`} />
            ))}
          </div>
        </div>
      </section>
      <span className="sr-only">Loading</span>
    </div>
  );
}
