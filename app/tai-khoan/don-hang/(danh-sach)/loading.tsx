export default function Loading() {
  return (
    <div role="status" aria-label="Đang tải" className="animate-pulse space-y-3">
      <div className="h-8 w-56 rounded bg-gray-200" />
      {Array.from({ length: 4 }, (_, i) => (
        <div key={i} className="h-16 rounded-lg bg-gray-100" />
      ))}
      <span className="sr-only">Đang tải…</span>
    </div>
  );
}
