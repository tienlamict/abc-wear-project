export default function Loading() {
  return (
    <div role="status" aria-label="Đang tải" className="animate-pulse space-y-4">
      <div className="h-8 w-64 rounded bg-gray-200" />
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="h-64 rounded-lg bg-gray-100" />
        <div className="h-64 rounded-lg bg-gray-100" />
      </div>
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
