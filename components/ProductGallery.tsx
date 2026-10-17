"use client";

import Image from "next/image";
import { useState } from "react";
import { ImagePlaceholder } from "./ImagePlaceholder";

/** PS-04: large image plus a strip of thumbnails to switch it; the first image shows first. */
export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [current, setCurrent] = useState(0);
  const src = images[current] ?? images[0];

  return (
    <div>
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-gray-100">
        {src ? (
          <Image
            key={src}
            src={src}
            alt={`${name} — ảnh ${current + 1}`}
            fill
            priority
            sizes="(min-width: 768px) 50vw, 100vw"
            className="object-cover"
            data-testid="gallery-main"
          />
        ) : (
          <ImagePlaceholder />
        )}
      </div>
      {images.length > 1 && (
        <ul aria-label="Ảnh sản phẩm" className="mt-2 flex gap-2 overflow-x-auto pb-1">
          {images.map((image, i) => (
            <li key={image} className="shrink-0">
              <button
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Xem ảnh ${i + 1}`}
                aria-current={i === current}
                className={`relative block h-20 w-16 overflow-hidden rounded border-2 bg-gray-100 ${
                  i === current ? "border-gray-900" : "border-transparent hover:border-gray-300"
                }`}
              >
                <Image src={image} alt="" fill sizes="64px" className="object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
