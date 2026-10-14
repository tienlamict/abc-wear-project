"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import type { MemberProfile } from "@/lib/auth";
import { FormMessage, SubmitButton, TextField, callApi, formValues, useFormState } from "../form";

/** MA-04: name, phone and the one default shipping address used to prefill checkout. */
export function ProfileForm({ member }: { member: MemberProfile }) {
  const router = useRouter();
  const { pending, setPending, error, setError, success, setSuccess } = useFormState();

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSuccess(null);
    const result = await callApi("/api/me", formValues(e.currentTarget), "PATCH");
    if (result.ok) {
      setSuccess("Đã lưu thông tin.");
      router.refresh(); // the header shows the new name
    } else {
      setError(result.error);
    }
    setPending(false);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4" aria-label="Hồ sơ">
      <FormMessage error={error?.message} success={success} />
      <div>
        <p className="mb-1 text-sm font-medium">Email</p>
        <p className="text-sm text-gray-700">{member.email}</p>
      </div>
      <TextField
        label="Họ và tên"
        name="fullName"
        autoComplete="name"
        defaultValue={member.fullName}
        required
        error={error?.fields.fullName}
      />
      <TextField
        label="Số điện thoại"
        name="phone"
        type="tel"
        autoComplete="tel"
        defaultValue={member.phone ?? ""}
        error={error?.fields.phone}
      />
      <fieldset className="space-y-4 border-t pt-4">
        <legend className="pr-2 text-sm font-semibold">Địa chỉ giao hàng mặc định</legend>
        <TextField
          label="Số nhà, tên đường"
          name="shipLine1"
          autoComplete="address-line1"
          defaultValue={member.shipLine1 ?? ""}
          error={error?.fields.shipLine1}
        />
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            label="Phường/Xã"
            name="shipWard"
            defaultValue={member.shipWard ?? ""}
            error={error?.fields.shipWard}
          />
          <TextField
            label="Quận/Huyện"
            name="shipDistrict"
            defaultValue={member.shipDistrict ?? ""}
            error={error?.fields.shipDistrict}
          />
          <TextField
            label="Tỉnh/Thành phố"
            name="shipProvince"
            defaultValue={member.shipProvince ?? ""}
            error={error?.fields.shipProvince}
          />
        </div>
      </fieldset>
      <SubmitButton pending={pending}>Lưu thông tin</SubmitButton>
    </form>
  );
}
