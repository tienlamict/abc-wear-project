export function ListingSkeleton() {
  return (
    <div role="status" aria-label="Đang tải" className="animate-pulse space-y-4">
      <div className="h-7 w-48 rounded bg-gray-200" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="aspect-[3/4] rounded-lg bg-gray-100" />
        ))}
      </div>
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
