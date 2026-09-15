"use client";

import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

type Props = {
  children: ReactNode;
  productName: string;
  categoryLabel: string;
  promoLabel?: string;
  availabilityLabel?: string;
  className?: string;
  hasVideo?: boolean;
};

type NavigatorWithConnection = Navigator & {
  connection?: { saveData?: boolean };
};

export function ProductCinematicShowcase({
  children,
  productName,
  className = "",
  hasVideo = false,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<number | null>(null);
  const reducedMotionRef = useRef(hasVideo);
  const targetRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const saveData = (navigator as NavigatorWithConnection).connection?.saveData === true;
    reducedMotionRef.current = mediaQuery.matches || saveData || hasVideo;
    const stage = stageRef.current;
    if (stage) {
      stage.dataset.motion = reducedMotionRef.current ? "reduced" : "full";
    }
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [hasVideo]);

  function paintTilt() {
    frameRef.current = null;
    const stage = stageRef.current;
    if (!stage) return;
    stage.style.setProperty("--cinematic-x", `${targetRef.current.x.toFixed(2)}`);
    stage.style.setProperty("--cinematic-y", `${targetRef.current.y.toFixed(2)}`);
  }

  function scheduleTilt() {
    if (frameRef.current === null) {
      frameRef.current = requestAnimationFrame(paintTilt);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (
      reducedMotionRef.current ||
      event.pointerType !== "mouse" ||
      !event.currentTarget.matches(":hover") ||
      (event.target as HTMLElement).closest("video,button,input,select,textarea")
    ) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    targetRef.current = {
      x: Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2)),
      y: Math.max(-1, Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2)),
    };
    scheduleTilt();
  }

  function resetTilt() {
    if (reducedMotionRef.current) return;
    targetRef.current = { x: 0, y: 0 };
    scheduleTilt();
  }

  return (
    <div
      ref={stageRef}
      className={`product-cinematic-showcase relative isolate flex h-[min(460px,54vh)] min-h-[300px] touch-pan-y items-center justify-center overflow-hidden rounded-[24px] bg-[var(--ci-page-bg,var(--barndaksa-cream-base))] ${className}`}
      onPointerMove={handlePointerMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
      aria-label={`عرض ${productName}`}
    >
      <div className="cinematic-ambient pointer-events-none absolute inset-0" />
      <div className="cinematic-vignette pointer-events-none absolute inset-0" />
      <div className="cinematic-glow pointer-events-none absolute left-1/2 top-[46%] h-[62%] w-[72%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
      <div className="cinematic-shadow pointer-events-none absolute bottom-[8%] left-1/2 h-[9%] w-[52%] -translate-x-1/2 rounded-[50%]" />

      <div className="cinematic-media relative z-10 flex h-full w-full items-center justify-center">
        {children}
      </div>
      <div className="cinematic-foreground pointer-events-none absolute inset-x-[8%] bottom-0 z-10 h-[18%]" />
      {!hasVideo ? <div className="cinematic-sheen pointer-events-none absolute inset-y-[8%] z-10 w-[18%] -skew-x-12" /> : null}

      <style jsx global>{`
        .product-cinematic-showcase {
          --cinematic-x: 0;
          --cinematic-y: 0;
          perspective: 1100px;
          transform-style: preserve-3d;
          background: var(--ci-page-bg, var(--barndaksa-cream-base));
        }
        .cinematic-ambient {
          background:
            linear-gradient(145deg, var(--ci-surface, #f7f0e8), var(--ci-page-bg, #efe2d3)),
            radial-gradient(circle at 18% 16%, var(--ci-accent, #6b3a25), transparent 42%);
          opacity: 0.72;
        }
        .cinematic-vignette {
          background:
            radial-gradient(circle at 50% 44%, transparent 42%, color-mix(in srgb, var(--ci-text, #311912) 8%, transparent) 100%);
        }
        .cinematic-glow {
          background: radial-gradient(circle, color-mix(in srgb, var(--ci-accent, #6b3a25) 20%, transparent), transparent 70%);
          filter: blur(12px);
          transform:
            translate3d(calc(-50% + var(--cinematic-x) * -4px), calc(-50% + var(--cinematic-y) * -3px), -18px)
            scale(1.01);
          transition: transform 260ms ease-out;
        }
        .cinematic-shadow {
          background: color-mix(in srgb, var(--ci-text, #311912) 24%, transparent);
          filter: blur(13px);
          transform:
            translate3d(calc(-50% + var(--cinematic-x) * 2px), calc(var(--cinematic-y) * 1px), -24px)
            scaleX(calc(1 - var(--cinematic-y) * 0.025));
          transition: transform 260ms ease-out;
        }
        .cinematic-media {
          transform:
            translate3d(calc(var(--cinematic-x) * 6px), calc(var(--cinematic-y) * 5px), 20px)
            rotateX(calc(var(--cinematic-y) * -2.5deg))
            rotateY(calc(var(--cinematic-x) * 3.5deg))
            scale(1.01);
          transform-style: preserve-3d;
          transition: transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
        }
        .cinematic-foreground {
          background: linear-gradient(to top, color-mix(in srgb, var(--ci-text, #311912) 9%, transparent), transparent);
        }
        .cinematic-sheen {
          left: -28%;
          background: linear-gradient(90deg, transparent, color-mix(in srgb, white 28%, transparent), transparent);
          animation: cinematic-sheen-pass 620ms 480ms ease-out 1 both;
        }
        .product-cinematic-showcase[data-motion="reduced"] .cinematic-media,
        .product-cinematic-showcase[data-motion="reduced"] .cinematic-glow,
        .product-cinematic-showcase[data-motion="reduced"] .cinematic-shadow {
          transform: none;
          transition: none;
        }
        .product-cinematic-showcase[data-motion="reduced"] .cinematic-sheen {
          display: none;
        }
        @keyframes cinematic-sheen-pass {
          from { opacity: 0; transform: translateX(0) skewX(-12deg); }
          25% { opacity: 0.55; }
          to { opacity: 0; transform: translateX(760%) skewX(-12deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .product-cinematic-showcase,
          .product-cinematic-showcase *,
          .cinematic-info-heading,
          .cinematic-info-price,
          .cinematic-info-ordering {
            animation: none !important;
            transition: none !important;
          }
          .cinematic-sheen {
            display: none;
          }
        }
        @media (max-width: 430px) {
          .product-cinematic-showcase {
            min-height: 280px;
            height: min(390px, 48vh);
          }
        }
      `}</style>
    </div>
  );
}
