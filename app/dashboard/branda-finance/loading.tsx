const pulse = "animate-pulse bg-[#E8D8C2]";
const panel =
  "min-w-0 rounded-[8px] border border-[#D8C3A2] bg-[#FFFDF8] p-3";

export default function BrandaFinanceLoading() {
  return (
    <main
      aria-label="Loading finance"
      aria-live="polite"
      role="status"
      dir="rtl"
      className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#F5EFE6] px-3 py-4 text-right sm:px-4 lg:px-5"
    >
      <div className="mx-auto flex w-full max-w-[1320px] min-w-0 flex-col gap-4 overflow-hidden">
        <header className={`${panel} min-h-28 sm:p-4`}>
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className={`h-3 w-24 rounded-full ${pulse}`} />
              <div className={`mt-3 h-7 w-52 max-w-full rounded-lg ${pulse}`} />
              <div className={`mt-3 h-4 w-full max-w-3xl rounded-full ${pulse}`} />
            </div>
            <div className="flex flex-wrap gap-2">
              <div className={`h-9 w-28 rounded-[8px] ${pulse}`} />
              <div className="h-9 w-28 animate-pulse rounded-[8px] bg-[#4A281D]/25" />
            </div>
          </div>
        </header>

        <section className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className={`${panel} min-h-24`}>
              <div className={`h-3 w-24 rounded-full ${pulse}`} />
              <div className={`mt-3 h-6 w-14 rounded-md ${pulse}`} />
              <div className={`mt-2 h-3 w-32 max-w-full rounded-full ${pulse}`} />
            </div>
          ))}
        </section>

        <section className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0 space-y-4">
            <div className={panel}>
              <div className={`h-4 w-32 rounded-md ${pulse}`} />
              <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className={`h-24 rounded-[8px] ${pulse}`} />
                ))}
              </div>
            </div>
            <div className={panel}>
              <div className={`h-4 w-36 rounded-md ${pulse}`} />
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className={`h-16 rounded-[8px] ${pulse}`} />
                ))}
              </div>
            </div>
          </div>
          <aside className="min-w-0 space-y-3">
            {Array.from({ length: 2 }).map((_, index) => (
              <div key={index} className={`${panel} min-h-44`}>
                <div className={`h-4 w-40 max-w-full rounded-md ${pulse}`} />
                <div className="mt-3 space-y-2">
                  {Array.from({ length: 3 }).map((__, itemIndex) => (
                    <div key={itemIndex} className={`h-10 rounded-[8px] ${pulse}`} />
                  ))}
                </div>
              </div>
            ))}
          </aside>
        </section>
      </div>
      <span className="sr-only">Loading</span>
    </main>
  );
}
