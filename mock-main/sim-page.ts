import type { MockOrder } from "./types";

const esc = (text: unknown) =>
  String(text ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const vnd = (n: number) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;

const NEXT_LABEL: Record<string, string | undefined> = {
  RECEIVED: "→ PICKING",
  PICKING: "→ SHIPPING",
  SHIPPING: "→ DELIVERED",
};

/** The mock's demo page (`GET /sim`): plain HTML plus a few fetch calls, no build step. */
export function simPage(
  orders: MockOrder[],
  fail: { mode: string; remaining: number | null; only: string | null },
): string {
  const rows = orders
    .map((o) => {
      const next = NEXT_LABEL[o.status];
      const buttons = [
        next &&
          `<button data-advance="${esc(o.mainOrderId)}">Chuyển trạng thái ${esc(next)}</button>`,
        o.status === "SHIPPING" &&
          `<button data-advance="${esc(o.mainOrderId)}" data-to="DELIVERY_FAILED">Giao thất bại</button>`,
        o.status !== "RECEIVED" &&
          `<button data-advance="${esc(o.mainOrderId)}" data-to="${esc(o.status)}" title="Gửi lại webhook với trạng thái hiện tại">Gửi lại</button>`,
      ]
        .filter(Boolean)
        .join(" ");
      return `<tr>
<td><code>${esc(o.mainOrderId)}</code></td>
<td><code>${esc(o.payload.code)}</code></td>
<td>${esc(o.payload.customer.name)}<br><small>${esc(o.payload.customer.email)}</small></td>
<td style="text-align:right">${vnd(o.payload.codAmount)}</td>
<td><strong data-status="${esc(o.mainOrderId)}">${esc(o.status)}</strong></td>
<td>${esc(o.trackingNumber ?? "")}</td>
<td style="text-align:center">${o.deliveries}</td>
<td>${buttons}</td>
</tr>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mock Main System</title>
<style>
body{font-family:system-ui,sans-serif;margin:24px;color:#111827}
table{border-collapse:collapse;width:100%;font-size:14px}
th,td{border-bottom:1px solid #e5e7eb;padding:8px;text-align:left;vertical-align:top}
button{cursor:pointer;padding:4px 10px;margin:2px 0}
section{margin:24px 0}
#msg{white-space:pre-wrap;background:#f3f4f6;padding:8px;border-radius:6px;min-height:1.5em}
</style></head><body>
<h1>Mock Main System</h1>
<p>Đơn đã nhận từ website (IF-04). Bấm "Chuyển trạng thái" để đổi trạng thái và gọi webhook IF-05 về website.</p>
<p id="msg" role="status"></p>
<table>
<thead><tr><th>Mã Main</th><th>Mã đơn web</th><th>Khách</th><th>COD</th><th>Trạng thái</th><th>Mã vận đơn</th><th>Số lần nhận</th><th></th></tr></thead>
<tbody>${rows || '<tr><td colspan="8">Chưa có đơn nào.</td></tr>'}</tbody>
</table>

<section>
<h2>Tồn kho</h2>
<form id="stock">SKU <input name="sku" required placeholder="P001-DEN-M"> Số lượng <input name="qty" type="number" min="0" required> <button>Cập nhật</button></form>
<p><small>Website cập nhật sau lần đồng bộ IF-02 kế tiếp (≤ 1 phút).</small></p>
</section>

<section>
<h2>Giả lập sự cố</h2>
<p>Hiện tại: <strong>${esc(fail.mode)}</strong>${fail.remaining !== null ? ` (còn ${fail.remaining} request)` : ""}${fail.only ? ` chỉ ${esc(fail.only)}` : ""}</p>
<button data-fail="none">Bình thường</button>
<button data-fail="error">Lỗi 503</button>
<button data-fail="timeout">Treo (timeout)</button>
<button data-fail="error" data-only="/main/orders" data-count="2">Lỗi 2 lần gửi đơn</button>
</section>

<script>
const msg = document.getElementById("msg");
async function post(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, json };
}
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button[data-advance],button[data-fail]");
  if (!b) return;
  b.disabled = true;
  const r = b.dataset.advance
    ? await post("/sim/orders/" + encodeURIComponent(b.dataset.advance) + "/advance", b.dataset.to ? { to: b.dataset.to } : {})
    : await post("/sim/fail-mode", { mode: b.dataset.fail, ...(b.dataset.only ? { only: b.dataset.only } : {}), ...(b.dataset.count ? { count: Number(b.dataset.count) } : {}) });
  sessionStorage.setItem("sim-msg", JSON.stringify(r.json, null, 2));
  location.reload();
});
document.getElementById("stock").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = new FormData(e.target);
  const r = await post("/sim/stock", { sku: f.get("sku"), qty: Number(f.get("qty")) });
  msg.textContent = JSON.stringify(r.json, null, 2);
});
msg.textContent = sessionStorage.getItem("sim-msg") ?? "";
sessionStorage.removeItem("sim-msg");
</script>
</body></html>`;
}
