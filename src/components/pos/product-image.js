/* eslint-disable @next/next/no-img-element */
import { useState } from "react";
import { GlassWater } from "lucide-react";

export default function ProductImage({ src, size = 42 }) {
  const [failed, setFailed] = useState(null);
  return (
    <div className="relative grid h-full w-full place-items-center text-[#8aa375]">
      <GlassWater size={size} strokeWidth={1.5} aria-hidden="true" />
      {src && failed !== src && (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
          onError={() => setFailed(src)}
        />
      )}
    </div>
  );
}
