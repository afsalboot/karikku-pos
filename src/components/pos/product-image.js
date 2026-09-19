/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { GlassWater } from "lucide-react";

export default function ProductImage({ src, size = 42, fit = "contain", desktopFit }) {
  const [failed, setFailed] = useState(null);
  return (
    <div className="relative grid h-full w-full place-items-center text-[#8aa375]">
      {(!src || failed === src) && <GlassWater size={size} strokeWidth={1.5} aria-hidden="true" />}
      {src && failed !== src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className={`absolute inset-0 h-full w-full object-center ${fit === "cover" ? "object-cover" : "object-contain"} ${desktopFit === "cover" ? "lg:object-cover" : ""}`}
          onError={() => setFailed(src)}
        />
      )}
    </div>
  );
}
