/** Shown where a product has no image yet (Main System has not uploaded any). */
export function ImagePlaceholder({ compact = false }: { compact?: boolean }) {
  return (
    <div
      data-testid="image-placeholder"
      className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-gray-400"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className={compact ? "h-6 w-6" : "h-10 w-10"}
      >
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="m21 17-5-5-9 8" />
      </svg>
      {!compact && <span className="text-xs">Chưa có ảnh</span>}
    </div>
  );
}
