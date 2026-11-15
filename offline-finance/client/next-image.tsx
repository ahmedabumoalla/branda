import React from "react";
export default function Image({ src, alt, fill, priority: _priority, unoptimized: _unoptimized, quality: _quality, placeholder: _placeholder, blurDataURL: _blur, loader: _loader, style, ...props }: any) {
  return <img {...props} src={typeof src === "string" ? src : src?.src} alt={alt || ""} style={fill ? { position: "absolute", inset: 0, width: "100%", height: "100%", ...style } : style} />;
}
