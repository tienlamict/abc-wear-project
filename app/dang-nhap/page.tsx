import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/account/AuthCard";
import { LoginForm } from "@/components/account/LoginForm";
import { safeNextPath } from "@/lib/safe-redirect";
import { getCurrentMemberCached } from "../_lib/auth";

export const metadata: Metadata = { title: "Đăng nhập" };

/** MA-02 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string | string[] };
}) {
  const next = safeNextPath(searchParams.next);
  if (await getCurrentMemberCached()) redirect(next);

  return (
    <AuthCard
      title="Đăng nhập"
      intro="Đăng nhập để xem lịch sử đơn hàng và điền sẵn địa chỉ khi đặt hàng. Bạn vẫn có thể đặt hàng mà không cần tài khoản."
    >
      <LoginForm next={next} />
    </AuthCard>
  );
}
