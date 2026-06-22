export default function OrdersLoading() {
  return (
    <div dir="rtl" className="min-h-screen min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="mb-6">
        <p className="font-black text-[#6B3A25]">لوحة برندة</p>
        <div className="mt-3 h-10 w-48 rounded-2xl bg-[#E7D7C6]" />
        <div className="mt-3 h-5 w-full max-w-xl rounded-xl bg-[#F0E3D6]" />
      </header>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 rounded-[24px] border border-[#E7D7C6] bg-[#FCF8F3] p-5"
          >
            <div className="h-4 w-24 rounded-xl bg-[#F0E3D6]" />
            <div className="mt-4 h-8 w-16 rounded-xl bg-[#E7D7C6]" />
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-80 rounded-[24px] border border-[#E7D7C6] bg-[#FCF8F3] p-5"
            >
              <div className="h-12 w-12 rounded-2xl bg-[#E7D7C6]" />
              <div className="mt-5 h-5 w-2/3 rounded-xl bg-[#F0E3D6]" />
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="h-20 rounded-2xl bg-[#F8F4EF]" />
                <div className="h-20 rounded-2xl bg-[#F8F4EF]" />
              </div>
            </div>
          ))}
        </div>
        <div className="h-80 rounded-[24px] border border-[#E7D7C6] bg-[#FCF8F3] p-5" />
      </div>
    </div>
  );
}
