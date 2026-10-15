import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ChangePasswordForm } from "@/components/account/ChangePasswordForm";
import { ProfileForm } from "@/components/account/ProfileForm";
import { getCurrentMemberCached } from "../../_lib/auth";

export const metadata: Metadata = { title: "Tài khoản" };

/** MA-03, MA-04. middleware.ts already sends signed-out visitors to /dang-nhap. */
export default async function AccountPage() {
  const member = await getCurrentMemberCached();
  if (!member) redirect("/dang-nhap?next=/tai-khoan"); // token valid but member gone

  return (
    <div>
      <h1 className="text-2xl font-bold">Tài khoản của tôi</h1>
      <div className="mt-6 grid gap-6 md:grid-cols-[3fr_2fr]">
        <section className="rounded-lg border p-5 sm:p-6" aria-labelledby="profile-heading">
          <h2 id="profile-heading" className="mb-4 text-lg font-semibold">
            Hồ sơ và địa chỉ giao hàng
          </h2>
          <ProfileForm member={member} />
        </section>
        <section className="rounded-lg border p-5 sm:p-6" aria-labelledby="password-heading">
          <h2 id="password-heading" className="mb-4 text-lg font-semibold">
            Đổi mật khẩu
          </h2>
          <ChangePasswordForm />
        </section>
      </div>
    </div>
  );
}
