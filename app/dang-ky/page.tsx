import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthCard } from "@/components/account/AuthCard";
import { RegisterForm } from "@/components/account/RegisterForm";
import { safeNextPath } from "@/lib/safe-redirect";
import { getCurrentMemberCached } from "../_lib/auth";

export const metadata: Metadata = { title: "Đăng ký" };

/** MA-01 */
export default async function RegisterPage({
  searchParams,
}: {
  searchParams: { next?: string | string[] };
}) {
  const next = safeNextPath(searchParams.next);
  if (await getCurrentMemberCached()) redirect(next);

  return (
    <AuthCard title="Tạo tài khoản" intro="Tài khoản dùng được ngay sau khi đăng ký.">
      <RegisterForm next={next} />
    </AuthCard>
  );
}
