export default function Loading() {
  return (
    <div role="status" aria-label="Đang tải" className="grid animate-pulse gap-8 md:grid-cols-2">
      <div className="aspect-[3/4] rounded-lg bg-gray-100" />
      <div className="space-y-4">
        <div className="h-8 w-3/4 rounded bg-gray-200" />
        <div className="h-6 w-1/3 rounded bg-gray-200" />
        <div className="h-10 w-full rounded bg-gray-100" />
        <div className="h-12 w-40 rounded bg-gray-200" />
      </div>
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
