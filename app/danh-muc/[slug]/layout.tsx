import { notFound } from "next/navigation";
import { getCategoryCached } from "../../_lib/catalog";

// Checked here, outside this segment's loading.tsx boundary, so a missing category gets a real
// 404 status instead of a streamed 200.
export default async function CategoryLayout({
  params,
  children,
}: {
  params: { slug: string };
  children: React.ReactNode;
}) {
  if (!(await getCategoryCached(params.slug))) notFound();
  return children;
}
