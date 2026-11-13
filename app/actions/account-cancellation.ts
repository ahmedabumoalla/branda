'use server';

import { createClient as createVerifier } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { getActiveUser } from '@/lib/auth/active-user';
import { requireSupabaseAnonKey, requireSupabaseUrl } from '@/lib/barndaksa/env';
import { cancellationInput } from '@/lib/account/cancellation';

export async function cancelBrandAccount(input: unknown): Promise<{ ok: boolean; message: string }> {
  const parsed = cancellationInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'أكمل تأكيد الرابط المختصر وكلمة المرور الحالية' };
  const client = await createClient();
  const user = await getActiveUser(client);
  if (!user || (!user.email && !user.phone)) return { ok: false, message: 'سجل الدخول بحساب مالك العلامة' };
  // Isolated password proof: do not replace persistent browser cookies or revoke other devices.
  const verifier = createVerifier(requireSupabaseUrl(), requireSupabaseAnonKey(), { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  try {
    const proof = await verifier.auth.signInWithPassword(user.email ? { email: user.email, password: parsed.data.password } : { phone: user.phone!, password: parsed.data.password });
    if (proof.error || proof.data.user?.id !== user.id) return { ok: false, message: 'تعذر تأكيد كلمة المرور الحالية حاول مجددًا' };
    const result = await verifier.rpc('cancel_brand_account', { p_cafe_id: parsed.data.cafeId, p_confirmation: parsed.data.confirmation, p_reason: parsed.data.reason, p_request_id: parsed.data.requestId });
    if (result.error) return { ok: false, message: result.error.code === '22023' ? 'اكتب الرابط المختصر للعلامة كما يظهر لتأكيد الإلغاء' : result.error.code === '42501' ? 'الإلغاء متاح لمالك العلامة بعد تأكيد كلمة المرور الحالية' : 'تعذر تأكيد الإلغاء أعد المحاولة للتحقق من النتيجة' };
    if (result.data?.cafeId !== parsed.data.cafeId || !result.data?.cancelledAt) return { ok: false, message: 'تعذر تأكيد نتيجة الإلغاء أعد المحاولة' };
    return { ok: true, message: 'أُلغي حساب العلامة وأُرشفت بياناتها لدى إدارة المنصة' };
  } catch {
    return { ok: false, message: 'تعذر تأكيد الإلغاء تحقق من الاتصال وأعد المحاولة' };
  } finally {
    try { await verifier.auth.signOut({ scope: 'local' }); } catch { /* Never revoke the owner's persistent sessions. */ }
  }
}
