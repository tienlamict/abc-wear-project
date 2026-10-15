export default function Loading() {
  return (
    <div role="status" aria-label="Đang tải" className="animate-pulse space-y-4">
      <div className="h-8 w-40 rounded bg-gray-200" />
      <div className="h-10 rounded bg-gray-100" />
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="h-80 rounded-lg bg-gray-100" />
        <div className="h-40 rounded-lg bg-gray-100" />
      </div>
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
