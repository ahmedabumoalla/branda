"use client";

import { Eye, FileText, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  BentoCard,
  BentoGrid,
  DashboardPageShell,
  NeumoInput,
  NeumoTextarea,
  PrimaryButton,
  SoftCard,
} from "@/components/ui/design-system";
import { CAFE_PAGES_KEY, mockCafePages, type CafeInfoPage } from "@/lib/mock/cafe-pages";

export function PagesManagerPageClient() {
  const [pages, setPages] = useState<CafeInfoPage[]>(mockCafePages);
  const [selectedId, setSelectedId] = useState(pages[0]?.id || "");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem(CAFE_PAGES_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as CafeInfoPage[];
      setPages(parsed);
      setSelectedId(parsed[0]?.id || "");
    }
  }, []);

  useEffect(() => {
    const page = pages.find((item) => item.id === selectedId);
    if (!page) return;

    setTitle(page.title);
    setSlug(page.slug);
    setDescription(page.description);
    setContent(page.content);
    setVisible(page.visible);
  }, [selectedId, pages]);

  useEffect(() => {
    localStorage.setItem(CAFE_PAGES_KEY, JSON.stringify(pages));
  }, [pages]);

  function savePage() {
    if (!title.trim()) {
      alert("اكتب عنوان الصفحة");
      return;
    }

    const nextPage: CafeInfoPage = {
      id: selectedId || crypto.randomUUID(),
      title: title.trim(),
      slug: slug.trim() || title.trim().replaceAll(" ", "-"),
      description: description.trim(),
      content: content.trim(),
      visible,
      updatedAt: new Date().toISOString().slice(0, 10),
    };

    setPages((prev) => {
      const exists = prev.some((item) => item.id === nextPage.id);
      return exists
        ? prev.map((item) => (item.id === nextPage.id ? nextPage : item))
        : [nextPage, ...prev];
    });

    setSelectedId(nextPage.id);
    alert("تم حفظ الصفحة");
  }

  function newPage() {
    setSelectedId("");
    setTitle("");
    setSlug("");
    setDescription("");
    setContent("");
    setVisible(true);
  }

  function deletePage(id: string) {
    setPages((prev) => prev.filter((item) => item.id !== id));
    if (selectedId === id) setSelectedId("");
  }

  return (
    <div dir="rtl">
      <DashboardPageShell
        title="الصفحات التعريفية"
        subtitle="أنشئ صفحات تظهر للعميل مثل: من نحن، سياسة الحجز، الأسئلة الشائعة."
        action={
          <PrimaryButton onClick={newPage} className="inline-flex items-center gap-2">
            <Plus className="h-5 w-5" />
            صفحة جديدة
          </PrimaryButton>
        }
      >
        <BentoGrid>
          <BentoCard variant="white" span="1">
            <h2 className="mb-5 text-2xl font-black text-[#3A2117]">الصفحات</h2>

            <div className="space-y-3">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setSelectedId(page.id)}
                  className={`w-full rounded-3xl border p-4 text-right transition ${
                    selectedId === page.id
                      ? "border-[#3A2117] bg-[#F8F4EF]"
                      : "border-[#E5D8CD] bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-[#3A2117]">{page.title}</h3>
                      <p className="mt-1 text-sm font-bold text-[#7A6255]">/{page.slug}</p>
                    </div>

                    <span
                      className={`rounded-full px-3 py-1 text-xs font-black ${
                        page.visible
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-700"
                      }`}
                    >
                      {page.visible ? "ظاهر" : "مخفي"}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </BentoCard>

          <BentoCard variant="white" span="3">
            <div className="mb-6 flex items-center gap-3">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#3A2117] text-[#F8F4EF]">
                <FileText className="h-7 w-7" />
              </div>

              <div>
                <h2 className="text-2xl font-black text-[#3A2117]">تحرير الصفحة</h2>
                <p className="text-sm font-bold text-[#7A6255]">
                  المحتوى هنا يستخدم لاحقًا في صفحة الكوفي.
                </p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Field label="عنوان الصفحة" value={title} onChange={setTitle} />
              <Field label="الرابط المختصر" value={slug} onChange={setSlug} />
            </div>

            <label className="mt-4 block">
              <span className="text-xs font-black text-[#7A6255]">وصف مختصر</span>
              <NeumoInput
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-2"
              />
            </label>

            <label className="mt-4 block">
              <span className="text-xs font-black text-[#7A6255]">محتوى الصفحة</span>
              <NeumoTextarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="mt-2 h-72"
              />
            </label>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => setVisible((prev) => !prev)}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#F8F4EF] px-5 py-3 font-black text-[#3A2117]"
              >
                <Eye className="h-5 w-5" />
                {visible ? "الصفحة ظاهرة" : "الصفحة مخفية"}
              </button>

              <div className="flex gap-2">
                {selectedId ? (
                  <button
                    onClick={() => deletePage(selectedId)}
                    className="inline-flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-3 font-black text-red-700"
                  >
                    <Trash2 className="h-5 w-5" />
                    حذف
                  </button>
                ) : null}

                <PrimaryButton
                  onClick={savePage}
                  className="inline-flex items-center gap-2 px-6 py-3"
                >
                  <Save className="h-5 w-5" />
                  حفظ الصفحة
                </PrimaryButton>
              </div>
            </div>
          </BentoCard>
        </BentoGrid>
      </DashboardPageShell>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-black text-[#7A6255]">{label}</span>
      <NeumoInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-2"
      />
    </label>
  );
}
