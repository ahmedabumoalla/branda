"use client";

import { LocateFixed, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type LocationValue = {
  lat: number;
  lng: number;
};

type Props = {
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
  heightClassName?: string;
};

type LeafletPoint = {
  lat: number;
  lng: number;
};

type LeafletMap = {
  on: (event: string, handler: (event: { latlng: LeafletPoint }) => void) => LeafletMap;
  setView: (position: [number, number], zoom: number) => LeafletMap;
  remove: () => void;
  invalidateSize: () => void;
};

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  on: (event: string, handler: () => void) => LeafletMarker;
  setLatLng: (position: [number, number]) => LeafletMarker;
  getLatLng: () => LeafletPoint;
};

type LeafletRuntime = {
  map: (
    node: HTMLElement,
    options: {
      center: [number, number];
      zoom: number;
      zoomControl: boolean;
    }
  ) => LeafletMap;
  tileLayer: (
    url: string,
    options: {
      attribution: string;
      maxZoom: number;
    }
  ) => { addTo: (map: LeafletMap) => void };
  marker: (
    position: [number, number],
    options: { draggable: boolean; autoPan: boolean }
  ) => LeafletMarker;
};

declare global {
  interface Window {
    L?: LeafletRuntime;
    __brandaLeafletLoader?: Promise<void>;
  }
}

const fallbackPosition: LocationValue = { lat: 24.7136, lng: 46.6753 };
const leafletScriptUrl = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const leafletStyleUrl = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

function loadLeaflet() {
  if (window.L) return Promise.resolve();
  if (window.__brandaLeafletLoader) return window.__brandaLeafletLoader;

  window.__brandaLeafletLoader = new Promise<void>((resolve, reject) => {
    if (!document.querySelector<HTMLLinkElement>('link[data-branda-leaflet-style="true"]')) {
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = leafletStyleUrl;
      stylesheet.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
      stylesheet.crossOrigin = "";
      stylesheet.dataset.brandaLeafletStyle = "true";
      document.head.appendChild(stylesheet);
    }

    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-branda-leaflet-script="true"]'
    );

    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("Leaflet failed to load")),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = leafletScriptUrl;
    script.integrity = "sha256-o9N1jGDZrf5tS+Ft4gbIK7mYMipq9lqpVJ91xHSyKhg=";
    script.crossOrigin = "";
    script.async = true;
    script.dataset.brandaLeafletScript = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Leaflet failed to load"));
    document.head.appendChild(script);
  });

  return window.__brandaLeafletLoader;
}

export function GoogleMapPicker({
  value,
  onChange,
  heightClassName = "h-[320px]",
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const [mapError, setMapError] = useState("");
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let active = true;

    void loadLeaflet()
      .then(() => {
        if (!active || !containerRef.current || !window.L || mapRef.current) return;

        const position = value ?? fallbackPosition;
        const point: [number, number] = [position.lat, position.lng];

        const map = window.L.map(containerRef.current, {
          center: point,
          zoom: value ? 16 : 6,
          zoomControl: true,
        });

        window.L
          .tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          })
          .addTo(map);

        const marker = window.L
          .marker(point, { draggable: true, autoPan: true })
          .addTo(map);

        marker.on("dragend", () => {
          const nextPosition = marker.getLatLng();
          onChange({ lat: nextPosition.lat, lng: nextPosition.lng });
        });

        map.on("click", (event) => {
          marker.setLatLng([event.latlng.lat, event.latlng.lng]);
          onChange({ lat: event.latlng.lat, lng: event.latlng.lng });
        });

        mapRef.current = map;
        markerRef.current = marker;
        window.setTimeout(() => map.invalidateSize(), 30);
      })
      .catch(() => {
        if (active) setMapError("تعذر تحميل الخريطة حاول مرة أخرى");
      });

    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, [onChange]);

  useEffect(() => {
    if (!value || !mapRef.current || !markerRef.current) return;

    const point: [number, number] = [value.lat, value.lng];
    markerRef.current.setLatLng(point);
    mapRef.current.setView(point, 16);
  }, [value]);

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setMapError("تحديد الموقع غير مدعوم في هذا المتصفح");
      return;
    }

    setLocating(true);
    setMapError("");

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const position = { lat: coords.latitude, lng: coords.longitude };
        onChange(position);
        markerRef.current?.setLatLng([position.lat, position.lng]);
        mapRef.current?.setView([position.lat, position.lng], 16);
        setLocating(false);
      },
      () => {
        setMapError("لم يتم السماح بالوصول إلى الموقع");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={useCurrentLocation}
        disabled={locating}
        className="inline-flex items-center gap-2 rounded-xl bg-[#6B3A25] px-4 py-3 text-sm font-black text-[#FCF8F3] disabled:opacity-60"
      >
        <LocateFixed className="h-4 w-4" />
        {locating ? "جاري تحديد موقعك" : "استخدام موقعي الحالي"}
      </button>

      <div
        ref={containerRef}
        className={`${heightClassName} relative z-0 overflow-hidden rounded-2xl border border-[#E7D7C6] bg-[#F8F4EF]`}
      />

      {value ? (
        <div className="flex items-center gap-2 rounded-xl bg-[#F8F4EF] px-4 py-3 text-xs font-black text-[#6B3A25]">
          <MapPin className="h-4 w-4" />
          تم تحديد الموقع على الخريطة
        </div>
      ) : null}

      {mapError ? <p className="text-sm font-black text-red-600">{mapError}</p> : null}
    </div>
  );
}
