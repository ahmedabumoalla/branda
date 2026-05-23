export type BrandaUserRole = "admin" | "cafe_owner";

export type BrandaAuthUser = {
  id: string;
  fullName: string;
  email: string;
  password: string;
  role: BrandaUserRole;
  cafeSlug?: string;
  cafeId?: string;
  status: "نشط" | "موقوف";
};

export const BRANDA_AUTH_SESSION_KEY = "branda_auth_session";

export const mockAuthUsers: BrandaAuthUser[] = [
  {
    id: "admin_1",
    fullName: "مدير منصة برندة",
    email: "admin@branda.com",
    password: "admin123",
    role: "admin",
    status: "نشط",
  },
  {
    id: "cafe_owner_1",
    fullName: "مالك كوفي قطرة",
    email: "owner@qatrah.com",
    password: "123456",
    role: "cafe_owner",
    cafeId: "cafe_qatrah",
    cafeSlug: "qatrah",
    status: "نشط",
  },
];

export function loginWithRole(email: string, password: string) {
  const user = mockAuthUsers.find(
    (item) =>
      item.email.toLowerCase() === email.toLowerCase() &&
      item.password === password
  );

  if (!user) {
    return {
      ok: false,
      message: "بيانات الدخول غير صحيحة",
      redirectTo: null,
      user: null,
    };
  }

  if (user.status !== "نشط") {
    return {
      ok: false,
      message: "هذا الحساب موقوف، تواصل مع إدارة المنصة",
      redirectTo: null,
      user: null,
    };
  }

  const session = {
    id: user.id,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    cafeId: user.cafeId,
    cafeSlug: user.cafeSlug,
    loginAt: new Date().toISOString(),
  };

  localStorage.setItem(BRANDA_AUTH_SESSION_KEY, JSON.stringify(session));

  return {
    ok: true,
    message: "تم تسجيل الدخول بنجاح",
    redirectTo: user.role === "admin" ? "/admin" : "/dashboard",
    user: session,
  };
}

export function getBrandaAuthSession() {
  if (typeof window === "undefined") return null;

  const saved = localStorage.getItem(BRANDA_AUTH_SESSION_KEY);
  if (!saved) return null;

  try {
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

export const BRANDA_ADMIN_SESSION_KEY = "branda_admin_session";
export const BRANDA_CAFE_SESSION_KEY = "branda_cafe_session";

export function logoutBrandaAuth() {
  localStorage.removeItem(BRANDA_AUTH_SESSION_KEY);
  localStorage.removeItem(BRANDA_ADMIN_SESSION_KEY);
  localStorage.removeItem(BRANDA_CAFE_SESSION_KEY);
}