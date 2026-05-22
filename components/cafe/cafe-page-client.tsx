"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Coffee,
  Flame,
  Gift,
  MapPin,
  Search,
  Sparkles,
  UserRound,
} from "lucide-react";
import { formatSar } from "@/lib/format";
import { mockMenuProducts, type MenuProduct } from "@/lib/mock/menu";
import { mockOffers, type CafeOffer } from "@/lib/mock/offers";
import { mockReservations, type CafeReservation } from "@/lib/mock/reservations";
import {
  mockLoyaltyRewards,
  mockLoyaltySettings,
  type LoyaltyReward,
  type LoyaltySettings,
} from "@/lib/mock/loyalty";
import {
  TRANSACTIONS_KEY,
  type CustomerTransaction,
} from "@/lib/mock/customer-activity";
import {
  CAFE_SETTINGS_KEY,
  mockCafeSettings,
  type CafeSettings,
} from "@/lib/mock/cafe-settings";
import {
  CAFE_THEME_KEY,
  getThemeClasses,
  type CafeThemeId,
} from "@/lib/mock/cafe-theme";
import {
  getCustomerSession,
  type BrandaCustomerSession,
} from "@/lib/customer/session";

const MENU_KEY = "branda_qatrah_menu";
const OFFERS_KEY = "branda_qatrah_offers";
const RESERVATIONS_KEY = "branda_qatrah_reservations";
const LOYALTY_SETTINGS_KEY = "branda_qatrah_loyalty_settings";
const LOYALTY_REWARDS_KEY = "branda_qatrah_loyalty_rewards";

function productScore(product: MenuProduct, index: number) {
  return (
    Number(product.loyaltyPoints || 0) +
    Number(product.price || 0) +
    (100 - index)
  );
}

export function CafePageClient({ slug }: { slug: string }) {
  const [customer, setCustomer] = useState<BrandaCustomerSession | null>(null);
  const [products, setProducts] = useState<MenuProduct[]>(mockMenuProducts);
  const [offers, setOffers] = useState<CafeOffer[]>(mockOffers);
  const [reservations, setReservations] =
    useState<CafeReservation[]>(mockReservations);
  const [transactions, setTransactions] = useState<CustomerTransaction[]>([]);
  const [loyaltySettings, setLoyaltySettings] =
    useState<LoyaltySettings>(mockLoyaltySettings);
  const [loyaltyRewards, setLoyaltyRewards] =
    useState<LoyaltyReward[]>(mockLoyaltyRewards);

  const [cafeSettings, setCafeSettings] =
    useState<CafeSettings>(mockCafeSettings);
  const [activeTheme, setActiveTheme] = useState<CafeThemeId>("classic");

  const [activeBanner, setActiveBanner] = useState(0);
  const [query, setQuery] = useState("");
  const [reservationDate, setReservationDate] = useState("");
  const [reservationTime, setReservationTime] = useState("");
  const [guests, setGuests] = useState("");
  const [reservationType, setReservationType] =
    useState<CafeReservation["type"]>("طاولة");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const session = getCustomerSession(slug);
    setCustomer(session);

    const savedMenu = localStorage.getItem(MENU_KEY);
    const savedOffers = localStorage.getItem(OFFERS_KEY);
    const savedReservations = localStorage.getItem(RESERVATIONS_KEY);
    const savedTransactions = localStorage.getItem(TRANSACTIONS_KEY);
    const savedLoyaltySettings = localStorage.getItem(LOYALTY_SETTINGS_KEY);
    const savedLoyaltyRewards = localStorage.getItem(LOYALTY_REWARDS_KEY);
    const savedSettings = localStorage.getItem(CAFE_SETTINGS_KEY);
    const savedTheme = localStorage.getItem(CAFE_THEME_KEY) as CafeThemeId | null;

    if (savedMenu) setProducts(JSON.parse(savedMenu));
    if (savedOffers) setOffers(JSON.parse(savedOffers));
    if (savedReservations) setReservations(JSON.parse(savedReservations));
    if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
    if (savedLoyaltySettings) setLoyaltySettings(JSON.parse(savedLoyaltySettings));
    if (savedLoyaltyRewards) setLoyaltyRewards(JSON.parse(savedLoyaltyRewards));
    if (savedSettings) setCafeSettings(JSON.parse(savedSettings));
    if (savedTheme) setActiveTheme(savedTheme);
  }, [slug]);

  useEffect(() => {
    localStorage.setItem(RESERVATIONS_KEY, JSON.stringify(reservations));
  }, [reservations]);

  useEffect(() => {
    localStorage.setItem(TRANSACTIONS_KEY, JSON.stringify(transactions));
  }, [transactions]);

  const theme = getThemeClasses(activeTheme);

  const availableProducts = products.filter((product) => product.available);

  const activeOffers = offers.filter(
    (offer) => offer.status === "نشط" && offer.visibleInCafe
  );

  const bannerOffers = activeOffers.filter((offer) => {
    const placement = offer.placement ?? "كلاهما";
    return placement === "بانر الكوفي" || placement === "كلاهما";
  });

  const latestProducts = [...availableProducts].reverse().slice(0, 4);

  const popularProducts = [...availableProducts]
    .sort((a, b) => productScore(b, 0) - productScore(a, 0))
    .slice(0, 6);

  const searchedProducts = useMemo(() => {
    if (!query.trim()) return popularProducts.slice(0, 6);

    return availableProducts
      .filter(
        (product) =>
          product.name.includes(query) ||
          product.description.includes(query) ||
          product.category.includes(query)
      )
      .slice(0, 6);
  }, [query, availableProducts, popularProducts]);

  const activeRewards = loyaltyRewards.filter((reward) => reward.active);

  useEffect(() => {
    if (bannerOffers.length <= 1) return;

    const timer = setInterval(() => {
      setActiveBanner((current) => (current + 1) % bannerOffers.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [bannerOffers.length]);

  function nextBanner() {
    if (!bannerOffers.length) return;
    setActiveBanner((current) => (current + 1) % bannerOffers.length);
  }

  function prevBanner() {
    if (!bannerOffers.length) return;
    setActiveBanner((current) =>
      current === 0 ? bannerOffers.length - 1 : current - 1
    );
  }

  function requireCustomer(nextPath?: string) {
    if (customer) return true;

    const next = nextPath || `/c/${slug}`;
    window.location.href = `/c/${slug}/login?next=${encodeURIComponent(next)}`;
    return false;
  }

  function submitReservation() {
    if (!requireCustomer(`/c/${slug}/reserve`)) return;
    if (!customer) return;

    if (!reservationDate || !reservationTime || !guests) {
      alert("عبّئ تاريخ ووقت الحجز وعدد الأشخاص");
      return;
    }

    const createdAt = new Date().toISOString().slice(0, 10);

    const newReservation: CafeReservation = {
      id: crypto.randomUUID(),
      customerId: customer.id,
      customerName: customer.fullName,
      phone: customer.phone,
      type: reservationType,
      guests: Number(guests) || 1,
      date: reservationDate,
      time: reservationTime,
      notes: notes.trim() || undefined,
      status: "بانتظار الرد",
      createdAt,
    };

    const newTransaction: CustomerTransaction = {
      id: crypto.randomUUID(),
      cafeSlug: slug,
      customerId: customer.id,
      type: "حجز",
      title: `حجز ${reservationType}`,
      description: `طلب حجز ${reservationType} لعدد ${
        Number(guests) || 1
      } أشخاص بتاريخ ${reservationDate} الساعة ${reservationTime}`,
      createdAt,
    };

    setReservations((prev) => [newReservation, ...prev]);
    setTransactions((prev) => [newTransaction, ...prev]);

    setReservationDate("");
    setReservationTime("");
    setGuests("");
    setReservationType("طاولة");
    setNotes("");

    alert("تم إرسال طلب الحجز بنجاح");
  }

  const currentBanner = bannerOffers[activeBanner];

  return (
    <main dir="rtl" className={`min-h-screen ${theme.page}`}>
      <header className="sticky top-0 z-50 border-b border-[#E5D8CD] bg-[#F8F4EF]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4">
          <Link href={`/c/${slug}`} className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-[#3A2117] text-[#F8E8D2]">
              {cafeSettings.logoDataUrl ? (
                <img
                  src={cafeSettings.logoDataUrl}
                  alt=""
                  className="h-full w-full object-contain p-2"
                />
              ) : (
                <Coffee className="h-6 w-6" />
              )}
            </div>

            <div>
              <h1 className="text-xl font-black text-[#3A2117]">
                {cafeSettings.cafeName}
              </h1>
              <p className="text-xs font-bold text-[#7A6255]">Branda Menu</p>
            </div>
          </Link>

          <div className="flex items-center gap-2">
            {customer ? (
              <Link
                href={`/c/${slug}/account`}
                className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3 font-black text-[#3A2117] shadow-sm"
              >
                <UserRound className="h-4 w-4" />
                حسابي
              </Link>
            ) : (
              <>
                <Link
                  href={`/c/${slug}/login`}
                  className="rounded-2xl bg-white px-4 py-3 font-black text-[#3A2117] shadow-sm"
                >
                  دخول
                </Link>

                <Link
                  href={`/c/${slug}/register`}
                  className="rounded-2xl bg-[#3A2117] px-4 py-3 font-black text-[#F8E8D2] shadow-sm"
                >
                  حساب جديد
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-6 py-8">
        <section
          className={`relative overflow-hidden rounded-[42px] border border-[#E5D8CD] p-8 shadow-sm ${theme.hero}`}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_15%,rgba(255,255,255,.8),transparent_30%),radial-gradient(circle_at_85%_25%,rgba(107,58,37,.16),transparent_34%)]" />

          <div className="relative grid gap-8 lg:grid-cols-[1fr_420px] lg:items-center">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/70 px-4 py-2 text-sm font-black text-[#6B3A25]">
                <Sparkles className="h-4 w-4" />
                منيو رقمي وحجوزات ونقاط ولاء
              </div>

              <h2 className="text-6xl font-black leading-tight text-[#3A2117]">
                {cafeSettings.cafeName}
              </h2>

              <p className="mt-5 max-w-2xl text-lg font-bold leading-9 text-[#6B4A3A]">
                {cafeSettings.description ||
                  "تصفّح المنتجات، اكتشف العروض، واحجز طاولتك بسهولة."}
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={`/c/${slug}/products/popular`}
                  className={`rounded-2xl px-7 py-4 font-black shadow-lg ${theme.button}`}
                >
                  تصفح المنيو
                </Link>

                <Link
                  href={`/c/${slug}/reserve`}
                  className="rounded-2xl border border-[#CBB29C] bg-white px-7 py-4 font-black text-[#3A2117]"
                >
                  احجز طاولة
                </Link>
              </div>
            </div>

            <HeroProductCard product={popularProducts[0] || latestProducts[0]} />
          </div>
        </section>

        <section className="mt-6 grid gap-4 md:grid-cols-5">
          <NavTile href={`/c/${slug}/products/offers`} icon={Gift} title="العروض" />
          <NavTile href={`/c/${slug}/products/latest`} icon={Sparkles} title="أحدث المنتجات" />
          <NavTile href={`/c/${slug}/products/popular`} icon={Flame} title="الأكثر طلبًا" />
          <NavTile href={`/c/${slug}/reserve`} icon={CalendarDays} title="حجز طاولة" />
          <NavTile href={`/c/${slug}/products/branches`} icon={MapPin} title="الفروع" />
        </section>

        {currentBanner ? (
          <section className="mt-8">
            <div className="relative overflow-hidden rounded-[38px] border border-[#E5D8CD] bg-white shadow-sm">
              <div className="grid min-h-[360px] lg:grid-cols-[440px_1fr]">
                <div className="relative overflow-hidden bg-[#F8F4EF]">
                  <div className="absolute inset-12 rounded-full bg-[#CBB29C]/40 blur-3xl" />

                  <img
                    src={
                      currentBanner.bannerImageUrl ||
                      "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?q=80&w=1200&auto=format&fit=crop"
                    }
                    alt=""
                    className="relative h-full w-full object-contain p-8"
                  />
                </div>

                <div className="flex flex-col justify-center p-8">
                  <p className="text-sm font-black text-[#8B5E3C]">
                    {currentBanner.promoProductCategory || currentBanner.type}
                  </p>

                  <h3 className="mt-2 max-w-xl text-4xl font-black leading-tight text-[#3A2117]">
                    {currentBanner.promoProductName || currentBanner.title}
                  </h3>

                  <p className="mt-4 max-w-2xl text-lg leading-9 text-[#7A6255]">
                    {currentBanner.promoProductDescription ||
                      currentBanner.description}
                  </p>

                  <Link
                    href={
                      currentBanner.linkedProductId
                        ? `/c/${slug}/product/${currentBanner.linkedProductId}`
                        : `/c/${slug}/products/offers`
                    }
                    className="mt-7 w-fit rounded-2xl bg-[#3A2117] px-7 py-4 font-black text-[#F8E8D2]"
                  >
                    {currentBanner.ctaText || "عرض التفاصيل"}
                  </Link>
                </div>
              </div>

              {bannerOffers.length > 1 ? (
                <>
                  <button
                    onClick={prevBanner}
                    className="absolute left-5 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#3A2117] shadow"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>

                  <button
                    onClick={nextBanner}
                    className="absolute right-5 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#3A2117] shadow"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>

                  <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 gap-2">
                    {bannerOffers.map((offer, index) => (
                      <button
                        key={offer.id}
                        onClick={() => setActiveBanner(index)}
                        className={`h-2.5 rounded-full transition ${
                          index === activeBanner
                            ? "w-8 bg-[#3A2117]"
                            : "w-2.5 bg-[#CBB29C]"
                        }`}
                      />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </section>
        ) : null}

        <section className="mt-8 grid gap-6 lg:grid-cols-[1fr_360px]">
          <section className="rounded-[36px] border border-[#E5D8CD] bg-white p-6 shadow-sm">
            <div className="mb-6 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="font-black text-[#8B5E3C]">مختارات الكوفي</p>
                <h2 className="mt-1 text-4xl font-black text-[#3A2117]">
                  الأكثر طلبًا
                </h2>
              </div>

              <Link
                href={`/c/${slug}/products/popular`}
                className="rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
              >
                عرض كل المنتجات
              </Link>
            </div>

            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {popularProducts.slice(0, 6).map((product) => (
                <ProductCard key={product.id} slug={slug} product={product} />
              ))}
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-[36px] border border-[#E5D8CD] bg-white p-6 shadow-sm">
              <p className="font-black text-[#8B5E3C]">بحث سريع</p>

              <div className="relative mt-4">
                <Search className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[#8A7062]" />

                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="ابحث عن منتج..."
                  className="h-14 w-full rounded-2xl border border-[#E5D8CD] bg-white pr-12 pl-4 text-right font-bold outline-none"
                />
              </div>

              {query.trim() ? (
                <div className="mt-5 space-y-3">
                  {searchedProducts.map((product) => (
                    <Link
                      key={product.id}
                      href={`/c/${slug}/product/${product.id}`}
                      className="flex items-center gap-3 rounded-2xl bg-[#F8F4EF] p-3"
                    >
                      <div className="h-16 w-16 overflow-hidden rounded-2xl bg-white">
                        {product.imageDataUrl ? (
                          <img
                            src={product.imageDataUrl}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Coffee className="h-6 w-6 text-[#3A2117]" />
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <h3 className="truncate font-black text-[#3A2117]">
                          {product.name}
                        </h3>
                        <p className="text-sm font-bold text-[#7A6255]">
                          {formatSar(product.price)}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : null}
            </section>
          </aside>
        </section>
      </section>
    </main>
  );
}

function NavTile({
  href,
  icon: Icon,
  title,
}: {
  href: string;
  icon: React.ElementType;
  title: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-[28px] border border-[#E5D8CD] bg-white p-5 text-center shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#F8F4EF] text-[#8B5E3C] transition group-hover:bg-[#3A2117] group-hover:text-[#F8E8D2]">
        <Icon className="h-7 w-7" />
      </div>

      <h3 className="font-black text-[#3A2117]">{title}</h3>
    </Link>
  );
}

function HeroProductCard({ product }: { product?: MenuProduct }) {
  return (
    <div className="rounded-[34px] border border-white/70 bg-white/55 p-5 shadow-2xl">
      <div className="overflow-hidden rounded-[28px] bg-[#3A2117] text-[#F8E8D2]">
        <div className="relative h-72 bg-[linear-gradient(135deg,#3A2117,#8B5E3C,#CBB29C)] p-8">
          <div className="absolute inset-12 rounded-full bg-white/20 blur-3xl" />

          {product?.imageDataUrl ? (
            <img
              src={product.imageDataUrl}
              alt=""
              className="relative h-full w-full object-contain"
            />
          ) : (
            <Coffee className="relative mx-auto mt-16 h-16 w-16" />
          )}
        </div>

        <div className="bg-white p-5 text-[#3A2117]">
          <p className="text-sm font-black text-[#8B5E3C]">الأكثر طلبًا</p>
          <h3 className="mt-2 text-3xl font-black">
            {product?.name || "منتج مميز"}
          </h3>
          <p className="mt-2 line-clamp-2 text-[#7A6255]">
            {product?.description || "منتج مختار من الكوفي."}
          </p>
        </div>
      </div>
    </div>
  );
}

function ProductCard({ slug, product }: { slug: string; product: MenuProduct }) {
  return (
    <Link
      href={`/c/${slug}/product/${product.id}`}
      className="group overflow-hidden rounded-[28px] border border-[#E5D8CD] bg-[#FDFBF8] p-3 shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-52 overflow-hidden rounded-[22px] bg-[#F8F4EF]">
        <div className="absolute inset-10 rounded-full bg-[#CBB29C]/30 blur-3xl" />

        {product.imageDataUrl ? (
          <img
            src={product.imageDataUrl}
            alt=""
            className="relative h-full w-full object-contain p-4"
          />
        ) : (
          <div className="relative flex h-full items-center justify-center">
            <Coffee className="h-12 w-12 text-[#3A2117]" />
          </div>
        )}
      </div>

      <div className="p-3">
        <p className="text-sm font-black text-[#8B5E3C]">{product.category}</p>

        <h3 className="mt-2 line-clamp-1 text-2xl font-black text-[#3A2117]">
          {product.name}
        </h3>

        <p className="mt-2 line-clamp-2 text-sm leading-7 text-[#7A6255]">
          {product.description}
        </p>

        <div className="mt-4 flex items-center justify-between">
          <span className="font-black text-[#6B3A25]">
            {formatSar(product.price)}
          </span>

          <span className="rounded-xl bg-[#3A2117] px-4 py-2 text-xs font-black text-[#F8E8D2]">
            التفاصيل
          </span>
        </div>
      </div>
    </Link>
  );
}