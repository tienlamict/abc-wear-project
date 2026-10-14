import Link from "next/link";

function pageWindow(page: number, totalPages: number): (number | "…")[] {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const p of sorted) {
    const last = out[out.length - 1];
    if (typeof last === "number" && p - last > 1) out.push("…");
    out.push(p);
  }
  return out;
}

/** Page links that keep the current filters (`query` without `page`). */
export function Pagination({
  basePath,
  query,
  page,
  totalPages,
}: {
  basePath: string;
  query: URLSearchParams;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const href = (p: number) => {
    const params = new URLSearchParams(query);
    if (p > 1) params.set("page", String(p));
    const qs = params.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };
  const item = "min-w-9 rounded border px-3 py-1.5 text-center text-sm";

  return (
    <nav aria-label="Phân trang" className="mt-8 flex flex-wrap items-center justify-center gap-1">
      {page > 1 && (
        <Link href={href(page - 1)} className={`${item} hover:bg-gray-50`}>
          ‹ Trước
        </Link>
      )}
      {pageWindow(page, totalPages).map((p, i) =>
        p === "…" ? (
          <span key={`gap-${i}`} className="px-2 text-gray-400">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={href(p)}
            aria-current={p === page ? "page" : undefined}
            className={`${item} ${p === page ? "border-gray-900 bg-gray-900 text-white" : "hover:bg-gray-50"}`}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages && (
        <Link href={href(page + 1)} className={`${item} hover:bg-gray-50`}>
          Sau ›
        </Link>
      )}
    </nav>
  );
}
