import { notFound, redirect } from "next/navigation";
import { getSessionMemberId } from "@/lib/auth";
import { getMemberOrderCached } from "../../../_lib/orders";

// Checked here, outside this segment's loading.tsx boundary, so someone else's (or a missing)
// order gets a real 404 status instead of a streamed 200.
export default async function MemberOrderLayout({
  params,
  children,
}: {
  params: { code: string };
  children: React.ReactNode;
}) {
  const memberId = await getSessionMemberId();
  if (!memberId) redirect(`/dang-nhap?next=/tai-khoan/don-hang/${encodeURIComponent(params.code)}`);
  if (!(await getMemberOrderCached(memberId, params.code))) notFound();
  return children;
}
