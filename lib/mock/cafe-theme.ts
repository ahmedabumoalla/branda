export type CafeThemeId = "classic" | "luxury" | "minimal" | "dark";

export type CafeTheme = {
  id: CafeThemeId;
  name: string;
  description: string;
  preview: string;
};

export const CAFE_THEME_KEY = "branda_qatrah_theme";

export const cafeThemes: CafeTheme[] = [
  {
    id: "classic",
    name: "كلاسيك برندة",
    description: "ألوان القهوة الدافئة والتصميم الحالي.",
    preview: "bg-[#3A2117]",
  },
  {
    id: "luxury",
    name: "فاخر",
    description: "واجهة فاخرة بتباين أعلى وبطاقات كبيرة.",
    preview: "bg-[#1F130E]",
  },
  {
    id: "minimal",
    name: "هادئ",
    description: "تصميم بسيط أبيض ومساحات واسعة.",
    preview: "bg-[#F8F4EF]",
  },
  {
    id: "dark",
    name: "ليلي",
    description: "ثيم داكن مناسب للكافيهات الراقية.",
    preview: "bg-[#15100D]",
  },
];

export function getThemeClasses(theme: CafeThemeId) {
  if (theme === "luxury") {
    return {
      page: "bg-[#F4ECE2] text-[#1F130E]",
      hero: "bg-[#1F130E] text-[#F8E8D2]",
      card: "bg-white border-[#E5D8CD]",
      button: "bg-[#1F130E] text-[#F8E8D2]",
    };
  }

  if (theme === "minimal") {
    return {
      page: "bg-white text-[#2B1710]",
      hero: "bg-[#F8F4EF] text-[#2B1710]",
      card: "bg-[#FDFBF8] border-[#EFE8DF]",
      button: "bg-[#3A2117] text-[#F8E8D2]",
    };
  }

  if (theme === "dark") {
    return {
      page: "bg-[#15100D] text-[#F8E8D2]",
      hero: "bg-[#241610] text-[#F8E8D2]",
      card: "bg-[#211711] border-white/10",
      button: "bg-[#F8E8D2] text-[#241610]",
    };
  }

  return {
    page: "bg-[#F8F4EF] text-[#2B1710]",
    hero: "bg-[#EFE2D3] text-[#2B1710]",
    card: "bg-white border-[#E5D8CD]",
    button: "bg-[#3A2117] text-[#F8E8D2]",
  };
}