export default function Loading() {
  return (
    <div role="status" aria-label="Đang tải" className="animate-pulse space-y-4">
      <div className="h-8 w-56 rounded bg-gray-200" />
      <div className="grid gap-6 md:grid-cols-[3fr_2fr]">
        <div className="h-96 rounded-lg bg-gray-100" />
        <div className="h-72 rounded-lg bg-gray-100" />
      </div>
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
