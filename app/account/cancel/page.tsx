import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getActiveUser } from '@/lib/auth/active-user';
import { AccountCancellationControl } from '@/components/account/account-cancellation-control';
import type { CancellationBrand } from '@/lib/account/cancellation';

export default async function AccountCancellationPage() {
  const client = await createClient();
  if (!await getActiveUser(client)) redirect('/login');
  const result = await client.rpc('owner_cancellation_brands');
  if (result.error) throw new Error('تعذر تحميل حسابات علاماتك حاول مجددًا');
  const brands = (result.data ?? []) as CancellationBrand[];
  return <main dir="rtl" className="mx-auto min-h-screen max-w-4xl bg-[#fcf8f3] p-6 text-[#3b2118]">
    <h1 className="text-2xl font-bold">حسابات العلامات التجارية</h1>
    <p className="my-4">الإلغاء يخص العلامة التي تختارها وتبقى تفاصيلها محفوظة لدى إدارة المنصة</p>
    {brands.map(brand => brand.cancelledAt ? <section key={brand.id} className="my-4 rounded-xl border p-5"><h2>{brand.name}</h2><p>أُلغي الحساب بطلب المستخدم وأُرشفت بيانات العلامة لدى السوبرأدمن</p><time dateTime={brand.cancelledAt}>{new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Riyadh' }).format(new Date(brand.cancelledAt))}</time></section> : <AccountCancellationControl key={brand.id} cafeId={brand.id} slug={brand.slug} brandName={brand.name} />)}
    {!brands.length && <p>لا توجد علامات مملوكة لهذا الحساب</p>}
    <a href="/dashboard">الانتقال إلى لوحة العلامة المتاحة</a>
  </main>;
}
