import sharp from "sharp";

/** Upload rules (spec §9.5). */
export const IMAGE_RULES = {
  maxBytes: 5 * 1024 * 1024,
  minShortSide: 400,
  maxPerProduct: 8,
  maxSide: 1200,
  quality: 80,
  formats: ["jpeg", "png", "webp"],
} as const;

export type ProcessedImage =
  { ok: true; data: Buffer; width: number; height: number } | { ok: false; error: string };

/**
 * Checks an uploaded file by its content (never its name or the browser's MIME type) and turns
 * it into the stored form: rotated per EXIF, at most 1200×1200 (never enlarged), WebP q80.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  let format: string | undefined;
  let width = 0;
  let height = 0;
  try {
    ({ format, width = 0, height = 0 } = await sharp(input).metadata());
  } catch {
    return { ok: false, error: "Không đọc được file ảnh. Chỉ nhận ảnh JPEG, PNG hoặc WebP." };
  }
  if (!format || !(IMAGE_RULES.formats as readonly string[]).includes(format)) {
    return {
      ok: false,
      error: `Định dạng ${format ? format.toUpperCase() : "này"} không được hỗ trợ. Chỉ nhận ảnh JPEG, PNG hoặc WebP.`,
    };
  }
  if (Math.min(width, height) < IMAGE_RULES.minShortSide) {
    return {
      ok: false,
      error: `Ảnh quá nhỏ (${width}×${height}). Cạnh ngắn cần từ ${IMAGE_RULES.minShortSide} px trở lên.`,
    };
  }

  try {
    const { data, info } = await sharp(input)
      .rotate()
      .resize({
        width: IMAGE_RULES.maxSide,
        height: IMAGE_RULES.maxSide,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: IMAGE_RULES.quality })
      .toBuffer({ resolveWithObject: true });
    return { ok: true, data, width: info.width, height: info.height };
  } catch {
    return { ok: false, error: "File ảnh bị lỗi, không xử lý được. Vui lòng chọn ảnh khác." };
  }
}
