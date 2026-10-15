import { AccountTabs } from "@/components/account/AccountTabs";

/** Shared by /tai-khoan and /tai-khoan/don-hang/*: tabs between profile and orders. */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <AccountTabs />
      {children}
    </div>
  );
}
