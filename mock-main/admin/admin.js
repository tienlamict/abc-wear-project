// Main System product admin (AD-01 → AD-05). Plain JS, no build step.
// Basic auth: the browser resends the credentials it was asked for with every fetch below.
"use strict";

// Absolute, from the origin: a page opened as http://user:pass@host/admin would otherwise make
// fetch() refuse relative URLs (they inherit the credentials).
const API = `${location.origin}/admin/api`;

/** Creates an element; text always goes through textContent (no HTML injection). */
function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else if (key === "className") el.className = value;
    else if (key === "dataset") Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const vnd = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".")} ₫`;

async function api(method, path, body) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      status: 0,
      data: { error: { message: "Không kết nối được Main System." } },
    };
  }
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

const errorText = (data) => data?.error?.message || "Đã có lỗi xảy ra. Vui lòng thử lại.";

function show(el, kind, text) {
  el.className = `msg ${kind}`;
  el.textContent = text || "";
}

/** The website sync result returned with every write. */
function showSync(el, sync) {
  if (!sync) return;
  const at = new Date(sync.at).toLocaleTimeString("vi-VN");
  show(el, sync.ok ? "ok" : "warn", `${at} · ${sync.message}`);
}

let meta = null;
async function loadMeta() {
  if (meta) return meta;
  const r = await api("GET", "/categories");
  meta = r.ok ? r.data : { categories: [], colors: [], sizes: [], limits: {} };
  return meta;
}

/** <option>s grouped by parent category; `leafOnly` for the product form. */
function categoryOptions(select, leafOnly) {
  const parents = meta.categories.filter((c) => !c.parentId);
  for (const parent of parents) {
    const children = meta.categories.filter((c) => c.parentId === parent.id);
    if (leafOnly) {
      select.append(
        h(
          "optgroup",
          { label: parent.name },
          children.map((c) => h("option", { value: c.id }, c.name)),
        ),
      );
    } else {
      select.append(h("option", { value: parent.id }, parent.name));
      for (const c of children) select.append(h("option", { value: c.id }, `— ${c.name}`));
    }
  }
}

// ---------------------------------------------------------------- list page (AD-01, AD-05)

async function listPage() {
  await loadMeta();
  const form = document.getElementById("filters");
  const rows = document.getElementById("rows");
  const count = document.getElementById("count");
  const listMsg = document.getElementById("list-msg");
  const syncLast = document.getElementById("sync-last");
  categoryOptions(document.getElementById("category"), false);

  const params = new URLSearchParams(location.search);
  for (const name of ["q", "category", "status"])
    form.elements[name].value = params.get(name) || "";

  async function refresh() {
    const query = new URLSearchParams();
    for (const name of ["q", "category", "status"]) {
      const value = form.elements[name].value.trim();
      if (value) query.set(name, value);
    }
    history.replaceState(null, "", query.size ? `?${query}` : location.pathname);
    const r = await api("GET", `/products?${query}`);
    if (!r.ok) {
      show(listMsg, "err", errorText(r.data));
      return;
    }
    count.textContent = `${r.data.total} sản phẩm`;
    rows.replaceChildren(
      ...(r.data.items.length
        ? r.data.items.map(productRow)
        : [h("tr", {}, h("td", { colspan: 8, className: "muted" }, "Không có sản phẩm phù hợp."))]),
    );
  }

  function productRow(p) {
    const toggle = h(
      "button",
      {
        type: "button",
        className: "small",
        onclick: async () => {
          toggle.disabled = true;
          const r = await api("PUT", `/products/${p.id}`, { isActive: !p.isActive });
          if (!r.ok) show(listMsg, "err", errorText(r.data));
          else showSync(syncLast, r.data.sync);
          await refresh();
        },
      },
      p.isActive ? "Ngừng bán" : "Mở bán",
    );
    return h(
      "tr",
      { dataset: { id: p.id } },
      h(
        "td",
        {},
        p.image
          ? h("img", { className: "thumb", src: p.image, alt: "", loading: "lazy" })
          : h("span", { className: "thumb empty" }, "Chưa có ảnh"),
      ),
      h("td", {}, h("code", {}, p.id)),
      h("td", {}, h("a", { href: `/admin/products/${p.id}` }, p.name)),
      h("td", {}, p.categoryName),
      h("td", { className: "num" }, vnd(p.minPrice)),
      h("td", { className: "num" }, p.totalQty),
      h(
        "td",
        {},
        h(
          "span",
          { className: `badge ${p.isActive ? "on" : "off"}` },
          p.isActive ? "Đang bán" : "Ngừng bán",
        ),
      ),
      h(
        "td",
        { className: "actions" },
        h("a", { className: "button small", href: `/admin/products/${p.id}` }, "Sửa"),
        toggle,
      ),
    );
  }

  let timer;
  form.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(refresh, 250);
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    refresh();
  });

  const syncButton = document.getElementById("sync-now");
  syncButton.addEventListener("click", async () => {
    syncButton.disabled = true;
    show(syncLast, "", "Đang đồng bộ…");
    const r = await api("POST", "/sync", { type: "catalog" });
    syncButton.disabled = false;
    if (r.ok) showSync(syncLast, r.data);
    else show(syncLast, "err", errorText(r.data));
  });

  const last = await api("GET", "/sync/last");
  if (last.ok && last.data.last) showSync(syncLast, last.data.last);
  else show(syncLast, "", "Chưa đồng bộ lần nào kể từ khi Main System khởi động.");

  await refresh();
}

// ---------------------------------------------------------------- product page (AD-02 → AD-04)

async function productPage() {
  await loadMeta();
  const match = /^\/admin\/products\/([^/]+)$/.exec(location.pathname);
  let productId = match && match[1] !== "new" ? decodeURIComponent(match[1]) : null;
  let product = null;

  const form = document.getElementById("product-form");
  const msg = document.getElementById("msg");
  const syncEl = document.getElementById("sync");
  const variantsBody = document.getElementById("variants");
  const title = document.getElementById("title");

  categoryOptions(form.elements.categoryId, true);
  document.getElementById("size-list").append(...meta.sizes.map((s) => h("option", { value: s })));
  document
    .getElementById("color-list")
    .append(...meta.colors.map((c) => h("option", { value: c.name })));
  const { maxImages, maxBytes, minShortSide } = meta.limits;
  document.getElementById("image-rules").textContent =
    `JPEG, PNG hoặc WebP · tối đa ${maxBytes / 1024 / 1024} MB mỗi file · cạnh ngắn từ ${minShortSide} px · tối đa ${maxImages} ảnh; ảnh đầu tiên là ảnh đại diện`;

  const colorCode = (color) => {
    const known = meta.colors.find((c) => c.name.toLowerCase() === color.trim().toLowerCase());
    if (known) return known.code;
    return color
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[đĐ]/g, "D")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 16);
  };
  const suggest = (size, color) =>
    productId && size.trim() && color.trim()
      ? `${productId}-${size.trim().toUpperCase()}-${colorCode(color)}`
      : "";

  // --- variants table
  function existingRow(v) {
    const price = h("input", {
      type: "number",
      min: 1,
      step: 1000,
      value: v.price,
      "aria-label": `Giá ${v.sku}`,
      name: "price",
    });
    const qty = h("input", {
      type: "number",
      min: 0,
      step: 1,
      value: v.qty,
      "aria-label": `Tồn kho ${v.sku}`,
      name: "qty",
    });
    const quick = h(
      "button",
      {
        type: "button",
        className: "small",
        title: "Lưu ngay giá và tồn kho của dòng này",
        onclick: async () => {
          quick.disabled = true;
          const r = await api("PATCH", `/variants/${encodeURIComponent(v.sku)}`, {
            price: Number(price.value),
            qty: Number(qty.value),
          });
          quick.disabled = false;
          if (!r.ok) return show(msg, "err", errorText(r.data));
          Object.assign(v, r.data.variant);
          show(msg, "ok", `Đã lưu ${v.sku}: giá ${vnd(v.price)}, tồn kho ${v.qty}.`);
          showSync(syncEl, r.data.sync);
        },
      },
      "Lưu nhanh",
    );
    return h(
      "tr",
      { dataset: { sku: v.sku, existing: "1" } },
      h("td", {}, v.size),
      h("td", {}, v.color),
      h("td", {}, h("code", {}, v.sku)),
      h("td", { className: "num" }, price),
      h("td", { className: "num" }, qty),
      h("td", { className: "actions" }, quick),
    );
  }

  function newRow(initial = {}) {
    const n = variantsBody.children.length + 1;
    const size = h("input", {
      type: "text",
      list: "size-list",
      value: initial.size || "",
      "aria-label": `Size dòng ${n}`,
      name: "size",
      maxlength: 16,
    });
    const color = h("input", {
      type: "text",
      list: "color-list",
      value: initial.color || "",
      "aria-label": `Màu dòng ${n}`,
      name: "color",
      maxlength: 64,
    });
    const sku = h("input", {
      type: "text",
      value: "",
      "aria-label": `SKU dòng ${n}`,
      name: "sku",
      maxlength: 64,
      placeholder: productId ? "" : "Tự sinh khi lưu",
    });
    const price = h("input", {
      type: "number",
      min: 1,
      step: 1000,
      value: initial.price ?? "",
      "aria-label": `Giá dòng ${n}`,
      name: "price",
    });
    const qty = h("input", {
      type: "number",
      min: 0,
      step: 1,
      value: initial.qty ?? 0,
      "aria-label": `Tồn kho dòng ${n}`,
      name: "qty",
    });
    let edited = false;
    sku.addEventListener("input", () => (edited = sku.value.trim() !== ""));
    const update = () => {
      if (!edited) sku.value = suggest(size.value, color.value);
    };
    size.addEventListener("input", update);
    color.addEventListener("input", update);
    update();
    const row = h(
      "tr",
      { dataset: { new: "1" } },
      h("td", {}, size),
      h("td", {}, color),
      h("td", {}, sku),
      h("td", { className: "num" }, price),
      h("td", { className: "num" }, qty),
      h(
        "td",
        { className: "actions" },
        h(
          "button",
          { type: "button", className: "small danger", onclick: () => row.remove() },
          "Bỏ dòng",
        ),
      ),
    );
    variantsBody.append(row);
    return row;
  }

  document
    .getElementById("add-variant")
    .addEventListener("click", () => newRow().querySelector("input").focus());

  function readVariants() {
    return [...variantsBody.querySelectorAll("tr")].map((row) => {
      const get = (name) => row.querySelector(`[name="${name}"]`);
      const num = (name) => (get(name).value === "" ? NaN : Number(get(name).value));
      if (row.dataset.existing)
        return { sku: row.dataset.sku, price: num("price"), qty: num("qty") };
      return {
        sku: get("sku").value.trim() || undefined,
        size: get("size").value,
        color: get("color").value,
        price: num("price"),
        qty: num("qty"),
      };
    });
  }

  // --- load / render
  function render() {
    title.textContent = product ? `Sửa sản phẩm ${product.id}` : "Thêm sản phẩm";
    document.title = `${title.textContent} · Main System`;
    if (product) {
      form.elements.name.value = product.name;
      form.elements.description.value = product.description;
      form.elements.categoryId.value = product.categoryId;
      form.elements.isActive.checked = product.isActive;
      variantsBody.replaceChildren(...product.variants.map(existingRow));
    } else if (!variantsBody.children.length) {
      newRow();
    }
    document.getElementById("images-locked").hidden = Boolean(product);
    document.getElementById("images-area").hidden = !product;
    if (product) renderImages(product.images);
  }

  if (productId) {
    const r = await api("GET", `/products/${encodeURIComponent(productId)}`);
    if (!r.ok) {
      show(msg, "err", errorText(r.data));
      form.hidden = true;
      return;
    }
    product = r.data;
  }
  render();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = {
      name: form.elements.name.value,
      description: form.elements.description.value,
      categoryId: form.elements.categoryId.value,
      isActive: form.elements.isActive.checked,
      variants: readVariants(),
    };
    const bad = body.variants.findIndex((v) => Number.isNaN(v.price) || Number.isNaN(v.qty));
    if (bad >= 0) return show(msg, "err", `Biến thể dòng ${bad + 1}: nhập giá và tồn kho.`);
    const save = document.getElementById("save");
    save.disabled = true;
    const r = product
      ? await api("PUT", `/products/${product.id}`, body)
      : await api("POST", "/products", body);
    save.disabled = false;
    if (!r.ok) return show(msg, "err", errorText(r.data));
    const created = !product;
    product = r.data.product;
    productId = product.id;
    if (created) history.replaceState(null, "", `/admin/products/${product.id}`);
    render();
    show(
      msg,
      "ok",
      created
        ? `Đã thêm sản phẩm ${product.id}. Có thể tải ảnh ngay bên dưới.`
        : "Đã lưu sản phẩm.",
    );
    showSync(syncEl, r.data.sync);
  });

  // --- images (AD-03)
  function renderImages(images) {
    const container = document.getElementById("images");
    container.replaceChildren(
      ...images.map((img, i) =>
        h(
          "figure",
          { className: "image-item", style: "margin:0", dataset: { imageId: img.id } },
          h("img", { src: img.url, alt: `Ảnh ${i + 1}` }),
          h(
            "div",
            { className: "bar" },
            i === 0
              ? h("span", { className: "main-label" }, "Ảnh đại diện")
              : h("span", { className: "muted" }, `Ảnh ${i + 1}`),
            h(
              "button",
              {
                type: "button",
                className: "small",
                disabled: i === 0,
                "aria-label": `Đưa ảnh ${i + 1} lên trước`,
                onclick: () => move(i, -1),
              },
              "↑",
            ),
            h(
              "button",
              {
                type: "button",
                className: "small",
                disabled: i === images.length - 1,
                "aria-label": `Đưa ảnh ${i + 1} ra sau`,
                onclick: () => move(i, 1),
              },
              "↓",
            ),
            h(
              "button",
              {
                type: "button",
                className: "small danger",
                "aria-label": `Xóa ảnh ${i + 1}`,
                onclick: () => removeImage(img, i),
              },
              "Xóa",
            ),
          ),
        ),
      ),
    );
    if (!images.length) container.append(h("p", { className: "muted" }, "Chưa có ảnh nào."));
  }

  async function move(index, delta) {
    const ids = product.images.map((img) => img.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    const r = await api("PUT", `/products/${product.id}/images/order`, { imageIds: ids });
    if (!r.ok) return show(msg, "err", errorText(r.data));
    product.images = r.data.images;
    renderImages(product.images);
    show(msg, "ok", "Đã đổi thứ tự ảnh.");
    showSync(syncEl, r.data.sync);
  }

  async function removeImage(img, index) {
    if (!confirm(`Xóa ảnh ${index + 1}? Ảnh sẽ bị xóa khỏi kho ảnh và website.`)) return;
    const r = await api("DELETE", `/products/${product.id}/images/${encodeURIComponent(img.id)}`);
    if (!r.ok) return show(msg, "err", errorText(r.data));
    product.images = r.data.images;
    renderImages(product.images);
    show(msg, "ok", "Đã xóa ảnh.");
    showSync(syncEl, r.data.sync);
  }

  const input = document.getElementById("files");
  const dropzone = document.getElementById("dropzone");
  const progress = document.getElementById("progress");
  const uploads = document.getElementById("uploads");

  input.addEventListener("change", () => {
    if (input.files.length) upload([...input.files]);
    input.value = "";
  });
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("over");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("over"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("over");
    if (e.dataTransfer.files.length) upload([...e.dataTransfer.files]);
  });

  /** One multipart request for all files; XHR for upload progress. Results come per file. */
  function upload(files) {
    const items = files.map((file) => {
      const result = h("span", { className: "result muted" }, "Đang tải…");
      const li = h(
        "li",
        {},
        h("img", { src: URL.createObjectURL(file), alt: "" }),
        h("span", {}, `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`),
        result,
      );
      return { file, li, result };
    });
    uploads.replaceChildren(...items.map((i) => i.li));

    const data = new FormData();
    for (const { file } of items) data.append("files", file, file.name);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API}/products/${product.id}/images`);
    xhr.responseType = "json";
    progress.hidden = false;
    progress.value = 0;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) progress.value = Math.round((e.loaded / e.total) * 100);
    };
    xhr.onerror = () => {
      progress.hidden = true;
      show(msg, "err", "Không tải được ảnh lên Main System. Vui lòng thử lại.");
      for (const i of items) i.result.textContent = "Lỗi kết nối";
    };
    xhr.onload = () => {
      progress.hidden = true;
      const body = xhr.response || {};
      if (xhr.status >= 400 || !Array.isArray(body.results)) {
        show(msg, "err", errorText(body));
        for (const i of items) i.result.textContent = "Không tải lên";
        return;
      }
      body.results.forEach((res, index) => {
        const item = items[index];
        if (!item) return;
        item.result.className = `result ${res.ok ? "ok" : "err"}`;
        item.result.textContent = res.ok
          ? `Đã tải lên (${res.width}×${res.height}, WebP)`
          : res.error;
      });
      const saved = body.results.filter((r) => r.ok).length;
      const failed = body.results.length - saved;
      show(
        msg,
        failed ? (saved ? "warn" : "err") : "ok",
        `Đã tải lên ${saved} ảnh${failed ? `, ${failed} ảnh bị từ chối (xem lý do bên dưới)` : ""}.`,
      );
      product.images = body.images;
      renderImages(product.images);
      showSync(syncEl, body.sync);
    };
    xhr.send(data);
  }
}

const page = document.body.dataset.page;
if (page === "list") listPage();
else if (page === "product") productPage();
