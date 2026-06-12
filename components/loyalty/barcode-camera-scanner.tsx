"use client";

import { Camera, Keyboard, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseBrandaQrPayload, type BrandaQrKind } from "@/lib/loyalty/secure-qr-payload";

type Props = {
  label: string;
  onDetected: (value: string) => void;
  expectedKind?: BrandaQrKind;
};

type BarcodeDetectorShape = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>>;
};

type BarcodeDetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorShape;

declare global {
  interface Window {
    BarcodeDetector?: BarcodeDetectorConstructor;
  }
}

export function BarcodeCameraScanner({ label, onDetected, expectedKind }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;

    let stopped = false;
    let frame = 0;

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setError("الكاميرا غير مدعومة في هذا المتصفح");
          return;
        }

        if (!window.BarcodeDetector) {
          setError("قارئ QR غير مدعوم في هذا المتصفح استخدم Chrome أو أدخل الكود يدويًا");
          return;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        const detector = new window.BarcodeDetector({
          formats: ["qr_code", "code_128", "code_39", "ean_13"],
        });

        async function scan() {
          if (stopped || !videoRef.current) return;

          try {
            const codes = await detector.detect(videoRef.current);
            const rawValue = codes[0]?.rawValue?.trim();
            const value = rawValue ? parseBrandaQrPayload(rawValue, expectedKind) : null;
            if (value) {
              onDetected(value);
              setOpen(false);
              return;
            }
          } catch {
            // continue scanning
          }

          frame = requestAnimationFrame(scan);
        }

        frame = requestAnimationFrame(scan);
      } catch {
        setError("تعذر تشغيل الكاميرا");
      }
    }

    void start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [expectedKind, open, onDetected]);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError("");
          setOpen(true);
        }}
        className="inline-flex items-center gap-2 rounded-xl bg-[#6B3A25] px-4 py-3 text-sm font-black text-white"
      >
        <Camera className="h-4 w-4" />
        {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-[28px] bg-[#17100d] p-4 text-white">
            <div className="mb-4 flex items-center justify-between">
              <p className="font-black">{label}</p>
              <button onClick={() => setOpen(false)}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <video ref={videoRef} className="aspect-video w-full rounded-2xl bg-black object-cover" muted playsInline />

            {error ? (
              <div className="mt-4 rounded-2xl bg-white/10 p-4 text-sm font-bold">
                {error}
                <div className="mt-3 flex items-center gap-2 text-xs text-white/70">
                  <Keyboard className="h-4 w-4" />
                  يمكنك إدخال الكود يدويًا بدل الكاميرا
                </div>
              </div>
            ) : (
              <p className="mt-4 text-center text-sm font-bold text-white/70">
                وجّه الكاميرا إلى QR حتى تتم القراءة تلقائيًا
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
