/** Shapes of the mock Main System's in-memory data (also the format of seed.json). */
export interface SeedCategory {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
}

export interface SeedVariant {
  sku: string;
  size: string;
  color: string;
  price: number;
  qty: number;
}

export interface SeedProduct {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  /** Paths served by the mock itself (`/images/...`); made absolute in responses. */
  images: string[];
  isActive: boolean;
  createdAt: string;
  variants: SeedVariant[];
}

export interface Seed {
  categories: SeedCategory[];
  products: SeedProduct[];
}
