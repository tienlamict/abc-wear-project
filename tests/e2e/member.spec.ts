import { expect, test } from "@playwright/test";
import { extractLink, waitForEmail } from "./helpers/mailpit";
import { TEST_PASSWORD, loginViaForm, registerViaApi, uniqueEmail } from "./helpers/members";

test("MA-01 register: new email signs in right away; a taken email is refused", async ({
  page,
}) => {
  const email = uniqueEmail("ma01");
  await page.goto("/dang-ky");
  const form = page.getByRole("form", { name: "Đăng ký" });
  await form.getByLabel("Họ và tên").fill("Trần Thị Mai");
  await form.getByLabel("Email").fill(email);
  await form.getByLabel("Mật khẩu", { exact: true }).fill(TEST_PASSWORD);
  await form.getByLabel("Nhập lại mật khẩu").fill(TEST_PASSWORD);
  await form.getByRole("button", { name: "Đăng ký" }).click();

  await expect(page).toHaveURL(/\/tai-khoan$/);
  await expect(page.getByTestId("member-name")).toHaveText("Trần Thị Mai");

  // Log out, then the same email cannot register again.
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page.getByRole("link", { name: "Đăng nhập" })).toBeVisible();
  await page.goto("/dang-ky");
  await form.getByLabel("Họ và tên").fill("Người khác");
  await form.getByLabel("Email").fill(email.toUpperCase());
  await form.getByLabel("Mật khẩu", { exact: true }).fill(TEST_PASSWORD);
  await form.getByLabel("Nhập lại mật khẩu").fill(TEST_PASSWORD);
  await form.getByRole("button", { name: "Đăng ký" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Email này đã được đăng ký",
  );

  // …and the original account logs in.
  await page.goto("/dang-nhap");
  await loginViaForm(page, email, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/tai-khoan$/);
  await expect(page.getByTestId("member-name")).toHaveText("Trần Thị Mai");
});

test("MA-01 register form shows field errors in Vietnamese", async ({ page }) => {
  await page.goto("/dang-ky");
  const form = page.getByRole("form", { name: "Đăng ký" });
  await form.getByLabel("Email").fill("khong-phai-email");
  await form.getByLabel("Mật khẩu", { exact: true }).fill("123");
  await form.getByLabel("Nhập lại mật khẩu").fill("123");
  await form.getByRole("button", { name: "Đăng ký" }).click();
  await expect(form.getByText("Email không hợp lệ")).toBeVisible();
  await expect(form.getByText("Mật khẩu cần ít nhất 8 ký tự")).toBeVisible();
  await expect(form.getByText("Vui lòng nhập họ tên")).toBeVisible();
});

test("MA-02 /tai-khoan needs sign-in and returns there after login", async ({ page }) => {
  const email = uniqueEmail("ma02");
  await registerViaApi(page, { email, fullName: "Lê Văn Cường" });
  await page.request.post("/api/auth/logout");

  await page.goto("/tai-khoan");
  await expect(page).toHaveURL(/\/dang-nhap\?next=%2Ftai-khoan$/);
  await loginViaForm(page, email, TEST_PASSWORD);
  await expect(page).toHaveURL(/\/tai-khoan$/);
  await expect(page.getByRole("heading", { name: "Tài khoản của tôi" })).toBeVisible();
});

test("MA-02 five wrong passwords lock the account for 15 minutes", async ({ page }) => {
  const email = uniqueEmail("lock");
  await registerViaApi(page, { email });
  await page.request.post("/api/auth/logout");

  await page.goto("/dang-nhap");
  for (let i = 1; i <= 4; i++) {
    await loginViaForm(page, email, `sai-mat-khau-${i}`);
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(
      /Email hoặc mật khẩu không đúng/,
    );
  }
  await loginViaForm(page, email, "sai-mat-khau-5");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/Tài khoản tạm khóa.*15 phút/);

  // The right password does not get in while locked.
  await loginViaForm(page, email, TEST_PASSWORD);
  await expect(page.getByRole("main").getByRole("alert")).toHaveText(/Tài khoản tạm khóa/);
  await expect(page).toHaveURL(/\/dang-nhap/);
});

test("MA-03 forgot password: emailed link sets a new password", async ({ page, request }) => {
  const email = uniqueEmail("reset");
  await registerViaApi(page, { email, fullName: "Phạm Minh Đức" });
  await page.request.post("/api/auth/logout");

  await page.goto("/dang-nhap");
  await page.getByRole("link", { name: "Quên mật khẩu?" }).click();
  await expect(page).toHaveURL(/\/quen-mat-khau$/);
  await page.getByLabel("Email đã đăng ký").fill(email);
  await page.getByRole("button", { name: "Gửi liên kết đặt lại" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("30 phút");

  const mail = await waitForEmail(request, email, "Đặt lại mật khẩu");
  expect(mail.Text).toContain("Phạm Minh Đức");
  const link = extractLink(mail, "http://localhost:3000/dat-lai-mat-khau?token=");

  const newPassword = "MatKhauMoi-123";
  await page.goto(link);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(newPassword);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(newPassword);
  await page.getByRole("button", { name: "Đặt mật khẩu mới" }).click();
  await expect(page.getByRole("main").getByRole("status")).toContainText("Đã đặt mật khẩu mới");

  // The link is single-use.
  await page.goto(link);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill("LanThuHai-123");
  await page.getByLabel("Nhập lại mật khẩu mới").fill("LanThuHai-123");
  await page.getByRole("button", { name: "Đặt mật khẩu mới" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Liên kết không hợp lệ hoặc đã hết hạn",
  );

  await page.goto("/dang-nhap");
  await loginViaForm(page, email, TEST_PASSWORD);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("không đúng");
  await loginViaForm(page, email, newPassword);
  await expect(page).toHaveURL(/\/tai-khoan$/);
});

test("MA-03 change password needs the current password", async ({ page }) => {
  const email = uniqueEmail("change");
  await registerViaApi(page, { email });
  await page.goto("/tai-khoan");

  const form = page.getByRole("form", { name: "Đổi mật khẩu" });
  await form.getByLabel("Mật khẩu hiện tại").fill("khong-dung-123");
  await form.getByLabel("Mật khẩu mới", { exact: true }).fill("MatKhauMoi-456");
  await form.getByLabel("Nhập lại mật khẩu mới").fill("MatKhauMoi-456");
  await form.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(form.getByText("Mật khẩu hiện tại không đúng", { exact: true })).toBeVisible();

  await form.getByLabel("Mật khẩu hiện tại").fill(TEST_PASSWORD);
  await form.getByRole("button", { name: "Đổi mật khẩu" }).click();
  await expect(form.getByRole("status")).toHaveText("Đã đổi mật khẩu.");

  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await page.goto("/dang-nhap");
  await loginViaForm(page, email, "MatKhauMoi-456");
  await expect(page).toHaveURL(/\/tai-khoan$/);
});

test("MA-04 edit name, phone and default address; they are saved", async ({ page }) => {
  const email = uniqueEmail("ma04");
  await registerViaApi(page, { email, fullName: "Võ Thị Hoa" });
  await page.goto("/tai-khoan");

  const form = page.getByRole("form", { name: "Hồ sơ" });
  await form.getByLabel("Họ và tên").fill("Võ Thị Hồng Hoa");
  await form.getByLabel("Số điện thoại").fill("0912 345 678");
  await form.getByLabel("Số nhà, tên đường").fill("45 Nguyễn Huệ");
  await form.getByLabel("Phường/Xã").fill("Phường Bến Nghé");
  await form.getByLabel("Quận/Huyện").fill("Quận 1");
  await form.getByLabel("Tỉnh/Thành phố").fill("TP. Hồ Chí Minh");
  await form.getByRole("button", { name: "Lưu thông tin" }).click();
  await expect(form.getByRole("status")).toHaveText("Đã lưu thông tin.");
  await expect(page.getByTestId("member-name")).toHaveText("Võ Thị Hồng Hoa");

  await page.reload();
  await expect(form.getByLabel("Họ và tên")).toHaveValue("Võ Thị Hồng Hoa");
  await expect(form.getByLabel("Số điện thoại")).toHaveValue("0912345678");
  await expect(form.getByLabel("Số nhà, tên đường")).toHaveValue("45 Nguyễn Huệ");
  await expect(form.getByLabel("Phường/Xã")).toHaveValue("Phường Bến Nghé");
  await expect(form.getByLabel("Quận/Huyện")).toHaveValue("Quận 1");
  await expect(form.getByLabel("Tỉnh/Thành phố")).toHaveValue("TP. Hồ Chí Minh");

  // An invalid phone is refused with a clear message and nothing changes.
  await form.getByLabel("Số điện thoại").fill("12345");
  await form.getByRole("button", { name: "Lưu thông tin" }).click();
  await expect(form.getByText(/Số điện thoại không hợp lệ/)).toBeVisible();
  const me = await page.request.get("/api/me");
  expect((await me.json()).member.phone).toBe("0912345678");
});

test("MA-04 /api/me requires a session", async ({ request }) => {
  const res = await request.get("/api/me");
  expect(res.status()).toBe(401);
  expect((await res.json()).error.code).toBe("UNAUTHORIZED");
});
