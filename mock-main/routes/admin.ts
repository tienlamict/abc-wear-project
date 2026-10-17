import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import basicAuth from "@fastify/basic-auth";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import type { FastifyError, FastifyInstance } from "fastify";
import { z } from "zod";
import {
  COLOR_CODES,
  SIZES,
  fold,
  imageIdOf,
  imageKey,
  nextProductId,
  suggestSku,
} from "../catalog-rules";
import type { MockContext } from "../context";
import { IMAGE_RULES, processImage } from "../images";
import type { ChangeType, SyncOutcome } from "../notify";
import type { SeedProduct, SeedVariant } from "../types";

const ADMIN_DIR = fileURLToPath(new URL("../admin/", import.meta.url));

export interface AdminCredentials {
  user: string;
  password: string;
}

/** `{ error: { code, message, details? } }` with a Vietnamese message, like the website's API. */
export class AdminError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string>,
  ) {
    super(message);
  }
}

const notFound = () => new AdminError(404, "NOT_FOUND", "Không tìm thấy sản phẩm.");

// --- Input schemas (spec §9.5: product rules) ---

const PRICE_MSG = "Giá phải là số nguyên VND lớn hơn 0.";
const QTY_MSG = "Tồn kho phải là số nguyên từ 0 trở lên.";
const price = z
  .number({ error: PRICE_MSG })
  .int(PRICE_MSG)
  .positive(PRICE_MSG)
  .max(1_000_000_000, "Giá quá lớn.");
const qty = z
  .number({ error: QTY_MSG })
  .int(QTY_MSG)
  .min(0, QTY_MSG)
  .max(1_000_000, "Tồn kho quá lớn.");
const size = z
  .string({ error: "Nhập size." })
  .trim()
  .min(1, "Nhập size.")
  .max(16, "Size tối đa 16 ký tự.")
  .transform((s) => s.toUpperCase());
const color = z
  .string({ error: "Nhập màu." })
  .trim()
  .min(1, "Nhập màu.")
  .max(64, "Màu tối đa 64 ký tự.");
const sku = z
  .string()
  .trim()
  .transform((s) => s.toUpperCase())
  .pipe(
    z
      .string()
      .regex(/^([A-Z0-9][A-Z0-9_-]{1,63})?$/, "SKU chỉ gồm chữ không dấu, số và dấu gạch ngang."),
  )
  .optional();

const name = z
  .string({ error: "Nhập tên sản phẩm." })
  .trim()
  .min(1, "Nhập tên sản phẩm.")
  .max(255, "Tên tối đa 255 ký tự.");
const description = z.string().trim().max(5000, "Mô tả tối đa 5000 ký tự.");
const categoryId = z.string({ error: "Chọn danh mục." }).min(1, "Chọn danh mục.");

const newVariantSchema = z.object({ sku, size, color, price, qty });

const createSchema = z.object({
  name,
  description: description.default(""),
  categoryId,
  isActive: z.boolean().default(true),
  variants: z
    .array(newVariantSchema, { error: "Cần ít nhất 1 biến thể." })
    .min(1, "Cần ít nhất 1 biến thể."),
});

// Existing variants (matched by SKU) change price and stock only; others are added.
const updateSchema = z.object({
  name: name.optional(),
  description: description.optional(),
  categoryId: categoryId.optional(),
  isActive: z.boolean().optional(),
  variants: z
    .array(z.object({ sku, size: size.optional(), color: color.optional(), price, qty }))
    .optional(),
});

const patchVariantSchema = z
  .object({ price: price.optional(), qty: qty.optional() })
  .refine((v) => v.price !== undefined || v.qty !== undefined, "Nhập giá hoặc tồn kho cần đổi.");

const orderSchema = z.object({ imageIds: z.array(z.string()) });
const syncSchema = z.object({ type: z.enum(["catalog", "stock"]) });
const listQuerySchema = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  status: z.enum(["", "active", "inactive"]).optional(),
});

function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data ?? {});
  if (result.success) return result.data;
  const details: Record<string, string> = {};
  for (const issue of result.error.issues) {
    details[issue.path.join(".") || "_"] ??= issue.message;
  }
  const first = result.error.issues[0];
  const where =
    first && first.path[0] === "variants" && typeof first.path[1] === "number"
      ? `Biến thể dòng ${first.path[1] + 1}: `
      : "";
  throw new AdminError(
    400,
    "VALIDATION_ERROR",
    `${where}${first?.message ?? "Dữ liệu không hợp lệ."}`,
    details,
  );
}

const sameSecret = (a: string, b: string) =>
  timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

/**
 * Main System's product management (AD-01 → AD-05), prefix /admin, behind basic auth:
 * the pages in mock-main/admin/ and their JSON API under /admin/api.
 */
export function adminRoutes(ctx: MockContext, credentials: AdminCredentials) {
  return async (app: FastifyInstance) => {
    await app.register(basicAuth, {
      validate: async (user, password) => {
        // Evaluate both so a wrong user takes as long as a wrong password.
        const ok = sameSecret(user, credentials.user) && sameSecret(password, credentials.password);
        if (!ok) throw new Error("wrong credentials");
      },
      authenticate: { realm: "ABC Wear Main System" },
    });
    app.addHook("onRequest", app.basicAuth);

    app.setErrorHandler((err: FastifyError | AdminError, req, reply) => {
      if (err instanceof AdminError) {
        return reply.code(err.status).send({
          error: {
            code: err.code,
            message: err.message,
            ...(err.details && { details: err.details }),
          },
        });
      }
      if (err.statusCode === 401) {
        return reply.code(401).send({
          error: {
            code: "UNAUTHORIZED",
            message: "Cần đăng nhập trang quản lý (sai tài khoản hoặc mật khẩu).",
          },
        });
      }
      if (err.statusCode && err.statusCode < 500) {
        return reply.code(err.statusCode).send({
          error: { code: "BAD_REQUEST", message: "Yêu cầu không hợp lệ." },
        });
      }
      req.log.error(err);
      return reply.code(500).send({
        error: { code: "INTERNAL_ERROR", message: "Đã có lỗi ở Main System. Vui lòng thử lại." },
      });
    });

    await app.register(fastifyStatic, { root: ADMIN_DIR, prefix: "/", index: false });
    app.get("/", (_req, reply) => reply.sendFile("index.html"));
    app.get("/products/new", (_req, reply) => reply.sendFile("product.html"));
    app.get("/products/:id", (_req, reply) => reply.sendFile("product.html"));

    await app.register(adminApi(ctx), { prefix: "/api" });
  };
}

function adminApi(ctx: MockContext) {
  return async (app: FastifyInstance) => {
    const { store, notifier } = ctx;

    await app.register(multipart, {
      // Over-size files are cut off and reported per file instead of failing the whole request.
      throwFileSizeLimit: false,
      limits: { fileSize: IMAGE_RULES.maxBytes, files: 20, fields: 10 },
    });

    const categoryName = (id: string) => store.categories.find((c) => c.id === id)?.name ?? id;

    const imagesView = (p: SeedProduct) =>
      p.images.map((key) => ({ id: imageIdOf(key), url: ctx.imageUrl(key) }));

    const productView = (p: SeedProduct) => ({
      id: p.id,
      categoryId: p.categoryId,
      categoryName: categoryName(p.categoryId),
      name: p.name,
      description: p.description,
      isActive: p.isActive,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt ?? p.createdAt,
      variants: p.variants,
      images: imagesView(p),
    });

    const mustProduct = (id: string) => {
      const product = store.product(id);
      if (!product) throw notFound();
      return product;
    };

    const mustStorage = () => {
      if (!ctx.storage) {
        throw new AdminError(
          503,
          "STORAGE_UNAVAILABLE",
          "Chưa cấu hình kho ảnh MinIO (biến MINIO_* trong .env).",
        );
      }
      return ctx.storage;
    };

    /** Products attach to leaf categories only (the website shows parents as groups). */
    const checkCategory = (id: string) => {
      if (!store.categories.some((c) => c.id === id)) {
        throw new AdminError(400, "VALIDATION_ERROR", "Danh mục không tồn tại.", {
          categoryId: "Danh mục không tồn tại.",
        });
      }
      if (store.categories.some((c) => c.parentId === id)) {
        throw new AdminError(
          400,
          "VALIDATION_ERROR",
          "Chọn danh mục con (ví dụ Áo thun nam), không chọn nhóm.",
          {
            categoryId: "Chọn danh mục con.",
          },
        );
      }
    };

    /** Validates new variants for `product` (SKU unique system-wide, one per size + color). */
    const buildVariants = (
      product: SeedProduct,
      input: { sku?: string; size: string; color: string; price: number; qty: number }[],
    ): SeedVariant[] => {
      const taken = new Set(store.products.flatMap((p) => p.variants.map((v) => v.sku)));
      const combos = new Set(product.variants.map((v) => `${v.size}|${fold(v.color)}`));
      return input.map((v) => {
        const finalSku = v.sku || suggestSku(product.id, v.size, v.color);
        if (taken.has(finalSku)) {
          throw new AdminError(
            409,
            "SKU_TAKEN",
            `SKU ${finalSku} đã tồn tại. Vui lòng dùng SKU khác.`,
            {
              sku: "SKU đã tồn tại.",
            },
          );
        }
        const combo = `${v.size}|${fold(v.color)}`;
        if (combos.has(combo)) {
          throw new AdminError(
            409,
            "VARIANT_EXISTS",
            `Đã có biến thể size ${v.size} màu ${v.color}.`,
          );
        }
        taken.add(finalSku);
        combos.add(combo);
        return { sku: finalSku, size: v.size, color: v.color, price: v.price, qty: v.qty };
      });
    };

    const touch = (p: SeedProduct) => {
      p.updatedAt = new Date().toISOString();
    };

    /** Saves, then asks the website to sync; the answer carries the outcome for the page. */
    const commit = async (type: ChangeType): Promise<SyncOutcome> => {
      store.save();
      return notifier.notify(type);
    };

    // AD-01
    app.get("/categories", async () => ({
      categories: store.categories.map((c) => ({
        ...c,
        parentName: c.parentId ? categoryName(c.parentId) : null,
        leaf: !store.categories.some((x) => x.parentId === c.id),
      })),
      colors: Object.entries(COLOR_CODES).map(([name, code]) => ({ name, code })),
      sizes: SIZES,
      limits: {
        maxImages: IMAGE_RULES.maxPerProduct,
        maxBytes: IMAGE_RULES.maxBytes,
        minShortSide: IMAGE_RULES.minShortSide,
      },
    }));

    app.get("/products", async (req) => {
      const { q, category, status } = parse(listQuerySchema, req.query);
      const term = q?.trim() ? fold(q.trim()) : "";
      const inCategory = category
        ? new Set([
            category,
            ...store.categories.filter((c) => c.parentId === category).map((c) => c.id),
          ])
        : null;
      const items = store.products
        .filter((p) => !inCategory || inCategory.has(p.categoryId))
        .filter((p) => !status || p.isActive === (status === "active"))
        .filter(
          (p) =>
            !term ||
            fold(p.name).includes(term) ||
            fold(p.id).includes(term) ||
            p.variants.some((v) => fold(v.sku).includes(term)),
        )
        .sort((a, b) => b.id.localeCompare(a.id)) // newest first
        .map((p) => {
          const prices = p.variants.map((v) => v.price);
          return {
            id: p.id,
            name: p.name,
            categoryId: p.categoryId,
            categoryName: categoryName(p.categoryId),
            image: p.images[0] ? ctx.imageUrl(p.images[0]) : null,
            imageCount: p.images.length,
            minPrice: prices.length ? Math.min(...prices) : 0,
            totalQty: p.variants.reduce((n, v) => n + v.qty, 0),
            variantCount: p.variants.length,
            isActive: p.isActive,
          };
        });
      return { items, total: items.length };
    });

    app.get<{ Params: { id: string } }>("/products/:id", async (req) =>
      productView(mustProduct(req.params.id)),
    );

    // AD-02: new product with its variants. Images come after, once it has an id.
    app.post("/products", async (req, reply) => {
      const input = parse(createSchema, req.body);
      checkCategory(input.categoryId);
      const now = new Date().toISOString();
      const product: SeedProduct = {
        id: nextProductId(store.products.map((p) => p.id)),
        categoryId: input.categoryId,
        name: input.name,
        description: input.description,
        images: [],
        isActive: input.isActive,
        createdAt: now,
        updatedAt: now,
        variants: [],
      };
      product.variants = buildVariants(product, input.variants);
      store.products.push(product);
      const sync = await commit("catalog");
      return reply.code(201).send({ product: productView(product), sync });
    });

    // AD-02 / AD-04: edit info, add variants or change their price and stock, stop/resume selling.
    app.put<{ Params: { id: string } }>("/products/:id", async (req) => {
      const product = mustProduct(req.params.id);
      const input = parse(updateSchema, req.body);
      if (input.categoryId !== undefined) checkCategory(input.categoryId);

      const updates: { variant: SeedVariant; price: number; qty: number }[] = [];
      const added: Parameters<typeof buildVariants>[1] = [];
      for (const [i, v] of (input.variants ?? []).entries()) {
        const existing = v.sku ? product.variants.find((x) => x.sku === v.sku) : undefined;
        if (existing) {
          const changesKey =
            (v.size !== undefined && v.size !== existing.size) ||
            (v.color !== undefined && fold(v.color) !== fold(existing.color));
          if (changesKey) {
            throw new AdminError(
              400,
              "VALIDATION_ERROR",
              `Biến thể dòng ${i + 1}: không đổi size/màu của biến thể đã có; hãy thêm biến thể mới.`,
            );
          }
          updates.push({ variant: existing, price: v.price, qty: v.qty });
        } else {
          if (!v.size || !v.color) {
            throw new AdminError(
              400,
              "VALIDATION_ERROR",
              `Biến thể dòng ${i + 1}: nhập size và màu.`,
            );
          }
          added.push({ sku: v.sku, size: v.size, color: v.color, price: v.price, qty: v.qty });
        }
      }
      const newVariants = buildVariants(product, added); // validates before anything changes

      if (input.name !== undefined) product.name = input.name;
      if (input.description !== undefined) product.description = input.description;
      if (input.categoryId !== undefined) product.categoryId = input.categoryId;
      if (input.isActive !== undefined) product.isActive = input.isActive;
      for (const u of updates) {
        u.variant.price = u.price;
        u.variant.qty = u.qty;
      }
      product.variants.push(...newVariants);
      touch(product);
      const sync = await commit("catalog");
      return { product: productView(product), sync };
    });

    // AD-04: quick price/stock change. Stock alone only needs an IF-02 sync.
    app.patch<{ Params: { sku: string } }>("/variants/:sku", async (req) => {
      const found = store.variant(req.params.sku);
      if (!found) throw new AdminError(404, "NOT_FOUND", "Không tìm thấy biến thể (SKU).");
      const input = parse(patchVariantSchema, req.body);
      const priceChanged = input.price !== undefined && input.price !== found.variant.price;
      if (input.price !== undefined) found.variant.price = input.price;
      if (input.qty !== undefined) found.variant.qty = input.qty;
      touch(found.product);
      const sync = await commit(priceChanged ? "catalog" : "stock");
      return { productId: found.product.id, variant: found.variant, sync };
    });

    // AD-03: upload several images. Each file is checked on its own; valid ones are kept.
    app.post<{ Params: { id: string } }>("/products/:id/images", async (req) => {
      const product = mustProduct(req.params.id);
      const storage = mustStorage();
      if (!req.isMultipart()) {
        throw new AdminError(
          400,
          "VALIDATION_ERROR",
          "Gửi ảnh dạng multipart/form-data, trường files.",
        );
      }

      type Result =
        | {
            file: string;
            ok: true;
            image: { id: string; url: string };
            width: number;
            height: number;
          }
        | { file: string; ok: false; error: string };
      const results: Result[] = [];
      const full = () => product.images.length >= IMAGE_RULES.maxPerProduct;
      const fullMsg = `Mỗi sản phẩm tối đa ${IMAGE_RULES.maxPerProduct} ảnh. Xóa bớt ảnh cũ trước khi thêm.`;

      for await (const part of req.parts()) {
        if (part.type !== "file") continue;
        const file = part.filename || "(không tên)";
        const buffer = await part.toBuffer(); // always drain the stream, even for skipped files
        if (part.fieldname !== "files") continue;
        if (part.file.truncated) {
          results.push({
            file,
            ok: false,
            error: `File vượt quá ${IMAGE_RULES.maxBytes / 1024 / 1024} MB.`,
          });
          continue;
        }
        if (full()) {
          results.push({ file, ok: false, error: fullMsg });
          continue;
        }
        const processed = await processImage(buffer);
        if (!processed.ok) {
          results.push({ file, ok: false, error: processed.error });
          continue;
        }

        const imageId = randomUUID();
        const key = imageKey(product.id, imageId);
        try {
          await storage.put(key, processed.data);
        } catch (err) {
          req.log.error(err);
          results.push({
            file,
            ok: false,
            error: "Không lưu được ảnh vào kho ảnh MinIO. Vui lòng thử lại.",
          });
          continue;
        }
        if (full()) {
          // Another upload filled the slots while this one was being processed.
          await storage.remove(key).catch(() => undefined);
          results.push({ file, ok: false, error: fullMsg });
          continue;
        }
        product.images.push(key);
        touch(product);
        store.save();
        results.push({
          file,
          ok: true,
          image: { id: imageId, url: ctx.imageUrl(key) },
          width: processed.width,
          height: processed.height,
        });
      }

      if (results.length === 0) {
        throw new AdminError(400, "VALIDATION_ERROR", "Chưa chọn ảnh nào (trường files).");
      }
      const sync = results.some((r) => r.ok) ? await commit("catalog") : null;
      return { results, images: imagesView(product), sync };
    });

    // AD-03: delete from MinIO first, then drop it from the product.
    app.delete<{ Params: { id: string; imageId: string } }>(
      "/products/:id/images/:imageId",
      async (req) => {
        const product = mustProduct(req.params.id);
        const storage = mustStorage();
        const key = product.images.find((k) => imageIdOf(k) === req.params.imageId);
        if (!key) throw new AdminError(404, "NOT_FOUND", "Không tìm thấy ảnh.");
        try {
          await storage.remove(key);
        } catch (err) {
          req.log.error(err);
          throw new AdminError(
            503,
            "STORAGE_UNAVAILABLE",
            "Không xóa được ảnh trên MinIO. Vui lòng thử lại.",
          );
        }
        product.images = product.images.filter((k) => k !== key);
        touch(product);
        const sync = await commit("catalog");
        return { images: imagesView(product), sync };
      },
    );

    // AD-03: new display order; the first image is the main one.
    app.put<{ Params: { id: string } }>("/products/:id/images/order", async (req) => {
      const product = mustProduct(req.params.id);
      const { imageIds } = parse(orderSchema, req.body);
      const byId = new Map(product.images.map((k) => [imageIdOf(k), k]));
      const reordered = imageIds.map((id) => byId.get(id));
      if (
        imageIds.length !== product.images.length ||
        new Set(imageIds).size !== imageIds.length ||
        reordered.some((k) => !k)
      ) {
        throw new AdminError(
          400,
          "VALIDATION_ERROR",
          "Danh sách ảnh không khớp với ảnh hiện có. Tải lại trang rồi thử lại.",
        );
      }
      product.images = reordered as string[];
      touch(product);
      const sync = await commit("catalog");
      return { images: imagesView(product), sync };
    });

    // AD-05
    app.post("/sync", async (req) => {
      const { type } = parse(syncSchema, req.body);
      return notifier.notify(type);
    });

    app.get("/sync/last", async () => ({ last: notifier.last }));
  };
}
