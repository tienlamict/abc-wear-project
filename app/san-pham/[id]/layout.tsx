import { notFound } from "next/navigation";
import { getProductCached } from "../../_lib/catalog";

// Checked here, outside this segment's loading.tsx boundary, so a missing product gets a real
// 404 status instead of a streamed 200.
export default async function ProductLayout({
  params,
  children,
}: {
  params: { id: string };
  children: React.ReactNode;
}) {
  if (!(await getProductCached(params.id))) notFound();
  return children;
}
