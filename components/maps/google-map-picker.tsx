"use client";

import { LocateFixed, MapPin, Move } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

type LocationValue = {
  lat: number;
  lng: number;
};

type Props = {
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
  heightClassName?: string;
};

type MapboxRuntime = {
  accessToken: string;
  Map: new (options: {
    container: HTMLElement;
    style: string;
    center: [number, number];
    zoom: number;
    attributionControl?: boolean;
  }) => {
    on: (event: string, handler: () => void) => void;
    remove: () => void;
    getCenter: () => { lng: number; lat: number };
    flyTo: (options: { center: [number, number]; zoom?: number }) => void;
    resize: () => void;
  };
  Marker: new (options?: { draggable?: boolean; color?: string }) => {
    setLngLat: (lngLat: [number, number]) => InstanceType<MapboxRuntime["Marker"]>;
    addTo: (map: InstanceType<MapboxRuntime["Map"]>) => InstanceType<MapboxRuntime["Marker"]>;
    on: (event: string, handler: () => void) => void;
    getLngLat: () => { lng: number; lat: number };
  };
  NavigationControl: new () => unknown;
};

declare global {
  interface Window {
    mapboxgl?: MapboxRuntime;
    __barndaksaMapboxLoader?: Promise<void>;
  }
}

const fallbackPosition: LocationValue = { lat: 24.7136, lng: 46.6753 };
const mapboxScriptUrl = "https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.js";
const mapboxStyleUrl = "https://api.mapbox.com/mapbox-gl-js/v3.9.4/mapbox-gl.css";
const geolocationOptions: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 10000,
  maximumAge: 30000,
};

function loadMapbox() {
  if (window.mapboxgl) return Promise.resolve();
  if (window.__barndaksaMapboxLoader) return window.__barndaksaMapboxLoader;

  window.__barndaksaMapboxLoader = new Promise<void>((resolve, reject) => {
    if (!document.querySelector<HTMLLinkElement>('link[data-barndaksa-mapbox-style="true"]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = mapboxStyleUrl;
      stylesheet.dataset.barndaksaMapboxStyle = "true";
      document.head.appendChild(stylesheet);
    }

    const existing = document.querySelector<HTMLScriptElement>('script[data-barndaksa-mapbox-script="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Mapbox failed to load")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = mapboxScriptUrl;
    script.async = true;
    script.dataset.barndaksaMapboxScript = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Mapbox failed to load"));
    document.body.appendChild(script);
  });

  return window.__barndaksaMapboxLoader;
}

function normalize(point: { lng: number; lat: number }): LocationValue {
  return {
    lat: Number(point.lat.toFixed(7)),
    lng: Number(point.lng.toFixed(7)),
  };
}

function isSameLocation(first: LocationValue, second: LocationValue) {
  return Math.abs(first.lat - second.lat) < 0.0000001 && Math.abs(first.lng - second.lng) < 0.0000001;
}

export function GoogleMapPicker({ value, onChange, heightClassName = "h-[360px]" }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<InstanceType<MapboxRuntime["Map"]> | null>(null);
  const markerRef = useRef<InstanceType<MapboxRuntime["Marker"]> | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const currentRef = useRef<LocationValue>(value ?? fallbackPosition);
  const hadInitialValueRef = useRef(Boolean(value));
  const autoLocateRequestedRef = useRef(false);
  const [mapError, setMapError] = useState("");
  const [current, setCurrent] = useState<LocationValue>(value ?? fallbackPosition);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const applyLocation = useCallback(
    (
      next: LocationValue,
      options: { notify?: boolean; flyTo?: boolean } = {}
    ) => {
      const normalized = normalize({ lat: next.lat, lng: next.lng });
      const notify = options.notify ?? true;
      const flyTo = options.flyTo ?? true;

      currentRef.current = normalized;
      setCurrent(normalized);
      if (notify) onChangeRef.current(normalized);

      markerRef.current?.setLngLat([normalized.lng, normalized.lat]);
      if (flyTo) {
        mapRef.current?.flyTo({
          center: [normalized.lng, normalized.lat],
          zoom: 16,
        });
      }
    },
    []
  );

  useEffect(() => {
    if (!value || isSameLocation(value, currentRef.current)) return;
    applyLocation(value, { notify: false });
  }, [applyLocation, value]);

  const requestBrowserLocation = useCallback(
    (options: { silent?: boolean } = {}) => {
      if (!navigator.geolocation) return;

      navigator.geolocation.getCurrentPosition(
        (position) => {
          applyLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => {
          if (!options.silent) setMapError("");
        },
        geolocationOptions
      );
    },
    [applyLocation]
  );

  useEffect(() => {
    if (!containerRef.current) return;
    if (!token) {
      setMapError("أضف NEXT_PUBLIC_MAPBOX_TOKEN في ملف البيئة وفي Vercel");
      return;
    }

    let map: InstanceType<MapboxRuntime["Map"]> | null = null;
    let marker: InstanceType<MapboxRuntime["Marker"]> | null = null;
    let cancelled = false;

    void loadMapbox()
      .then(() => {
        if (cancelled || !containerRef.current || !window.mapboxgl) return;
        window.mapboxgl.accessToken = token;

        const center: [number, number] = [currentRef.current.lng, currentRef.current.lat];
        map = new window.mapboxgl.Map({
          container: containerRef.current,
          style: "mapbox://styles/mapbox/streets-v12",
          center,
          zoom: 16,
          attributionControl: false,
        });

        marker = new window.mapboxgl.Marker({ draggable: true, color: "#6B3A25" })
          .setLngLat(center)
          .addTo(map);
        mapRef.current = map;
        markerRef.current = marker;

        marker.on("dragend", () => {
          if (!marker) return;
          applyLocation(normalize(marker.getLngLat()));
        });

        map.on("load", () => {
          setMapError("");
          window.setTimeout(() => map?.resize(), 120);
          if (
            !hadInitialValueRef.current &&
            !valueRef.current &&
            !autoLocateRequestedRef.current
          ) {
            autoLocateRequestedRef.current = true;
            requestBrowserLocation({ silent: true });
          }
        });

        map.on("moveend", () => {
          if (!map || !marker) return;
          applyLocation(normalize(map.getCenter()), { flyTo: false });
        });
      })
      .catch(() => setMapError("تعذر تحميل خريطة Mapbox"));

    return () => {
      cancelled = true;
      if (map) map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [applyLocation, requestBrowserLocation, token]);

  function locateMe() {
    requestBrowserLocation();
  }

  return (
    <div className="space-y-3">
      <div className={`relative overflow-hidden rounded-[28px] border border-[#E5D8CD] bg-[#F8F4EF] ${heightClassName}`}>
        <div ref={containerRef} className="h-full w-full" />
        <div className="pointer-events-none absolute right-4 top-4 rounded-2xl bg-white/95 px-4 py-2 text-sm font-black text-[#3A2117] shadow">
          اسحب الدبوس أو حرّك الخريطة
        </div>
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[#6B3A25]/70 bg-[#D9A33F]/15 shadow-[0_0_0_9999px_rgba(255,255,255,0.04)]" />
        <div className="pointer-events-none absolute bottom-4 right-4 flex items-center gap-2 rounded-2xl bg-white/95 px-4 py-3 text-sm font-black text-[#3A2117] shadow">
          <Move className="h-4 w-4" />
          يحفظ نطاق ترحيب 50 متر حول الموقع
        </div>
        {mapError ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#FCF8F3]/95 p-6 text-center font-black text-[#6B3A25]">
            {mapError}
          </div>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <div className="rounded-2xl border border-[#E5D8CD] bg-white px-4 py-3 text-sm font-bold text-[#6B3A25]">
          خط العرض {current.lat}
        </div>
        <div className="rounded-2xl border border-[#E5D8CD] bg-white px-4 py-3 text-sm font-bold text-[#6B3A25]">
          خط الطول {current.lng}
        </div>
        <button
          type="button"
          onClick={locateMe}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#6B3A25] px-5 py-3 font-black text-white"
        >
          <LocateFixed className="h-5 w-5" />
          تحديد موقعي
        </button>
      </div>
      <div className="flex items-center gap-2 rounded-2xl bg-[#FCF8F3] p-3 text-sm font-bold text-[#806A5E]">
        <MapPin className="h-5 w-5 text-[#6B3A25]" />
        يتم حفظ النقطة مع نصف قطر 50 متر للاستخدام في تجربة العميل لاحقًا
      </div>
    </div>
  );
}
