"use client";

import { ImagePlus, X } from "lucide-react";
import { useId, useState } from "react";

type Props = {
  label: string;
  value?: string;
  onChange: (value?: string) => void;
  removeLightBackground?: boolean;
  tolerance?: number;
  onRemoveLightBackgroundChange?: (value: boolean) => void;
  onToleranceChange?: (value: number) => void;
};

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function removeLightBackground(dataUrl: string, tolerance: number) {
  return new Promise<string>((resolve) => {
    const image = new Image();

    image.onload = () => {
      const sourceWidth = image.naturalWidth || image.width || 1;
      const sourceHeight = image.naturalHeight || image.height || 1;
      const width = Math.min(900, sourceWidth);
      const height = Math.round((width / sourceWidth) * sourceHeight);
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });

      canvas.width = width;
      canvas.height = height;

      if (!context) {
        resolve(dataUrl);
        return;
      }

      context.drawImage(image, 0, 0, width, height);
      const imageData = context.getImageData(0, 0, width, height);
      const threshold = 255 - tolerance;

      for (let index = 0; index < imageData.data.length; index += 4) {
        const red = imageData.data[index] ?? 0;
        const green = imageData.data[index + 1] ?? 0;
        const blue = imageData.data[index + 2] ?? 0;
        const light = red >= threshold && green >= threshold && blue >= threshold;
        const neutral = Math.abs(red - green) <= tolerance && Math.abs(red - blue) <= tolerance;
        if (light && neutral) imageData.data[index + 3] = 0;
      }

      context.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };

    image.onerror = () => resolve(dataUrl);
    image.src = dataUrl;
  });
}

export function LoyaltyLogoUploader({
  label,
  value,
  onChange,
  removeLightBackground: shouldRemoveLightBackground = false,
  tolerance = 24,
  onRemoveLightBackgroundChange,
  onToleranceChange,
}: Props) {
  const inputId = useId();
  const [processing, setProcessing] = useState(false);

  async function handleFile(file?: File) {
    if (!file) return;
    setProcessing(true);

    try {
      const dataUrl = await readFileAsDataUrl(file);
      const preview = shouldRemoveLightBackground
        ? await removeLightBackground(dataUrl, tolerance)
        : dataUrl;
      onChange(preview);
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="rounded-[14px] border border-[#E7D7C6] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-black text-[#311912]">{label}</p>
          <p className="mt-1 text-xs font-bold text-[#806A5E]">معاينة محلية فقط بدون رفع حقيقي.</p>
        </div>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="inline-flex items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black text-red-700"
          >
            <X className="h-4 w-4" />
            إزالة
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <label
          htmlFor={inputId}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#4A281D] px-4 py-3 text-sm font-black text-[#FCF8F3]"
        >
          <ImagePlus className="h-4 w-4" />
          {processing ? "جاري المعالجة" : "اختيار ملف"}
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/*,.svg"
          className="sr-only"
          onChange={(event) => handleFile(event.target.files?.[0])}
        />
        {value ? (
          <img src={value} alt="" className="h-12 w-12 rounded-xl border border-[#E7D7C6] bg-[#FCF8F3] object-contain p-1" />
        ) : (
          <span className="text-xs font-bold text-[#806A5E]">لم يتم اختيار صورة.</span>
        )}
      </div>

      {onRemoveLightBackgroundChange ? (
        <div className="mt-4 rounded-xl bg-[#FCF8F3] p-3">
          <label className="flex items-center gap-2 text-xs font-black text-[#6B3A25]">
            <input
              type="checkbox"
              checked={shouldRemoveLightBackground}
              onChange={(event) => onRemoveLightBackgroundChange(event.target.checked)}
            />
            محاولة إزالة الخلفية الفاتحة محلياً
          </label>
          {onToleranceChange ? (
            <label className="mt-3 block">
              <span className="mb-2 block text-xs font-black text-[#806A5E]">
                حساسية الإزالة: {tolerance}
              </span>
              <input
                type="range"
                min={8}
                max={70}
                value={tolerance}
                onChange={(event) => onToleranceChange(Number(event.target.value))}
                className="w-full accent-[#6B3A25]"
              />
            </label>
          ) : null}
          <p className="mt-2 text-[11px] font-bold leading-5 text-[#806A5E]">
            المعالجة الحالية معاينة محلية وسيتم تحسين الإزالة عند الربط الفعلي.
          </p>
        </div>
      ) : null}
    </div>
  );
}
