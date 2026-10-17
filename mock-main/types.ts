/** Shapes of the mock Main System's data (seed.json, and data/store.json at runtime). */
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
  /** MinIO object keys in display order (the first is the main image); URLs in responses. */
  images: string[];
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  variants: SeedVariant[];
}

export interface Seed {
  categories: SeedCategory[];
  products: SeedProduct[];
}

/** Everything Main keeps between restarts (`mock-main/data/store.json`). */
export interface StoreData extends Seed {
  version: 1;
  orders: MockOrder[];
}

/** IF-04 payload as sent by the website (see src/modules/integration/types.ts). */
export interface MainOrderPayload {
  id: string;
  code: string;
  createdAt: string;
  customer: { name: string; email: string; phone: string };
  shippingAddress: { line1: string; ward: string; district: string; province: string };
  shippingMethod: string;
  shippingFee: number;
  itemsTotal: number;
  codAmount: number;
  items: {
    sku: string;
    productName: string;
    size: string;
    color: string;
    unitPrice: number;
    quantity: number;
  }[];
}

/** An order as Main System keeps it. */
export interface MockOrder {
  mainOrderId: string;
  status: string;
  trackingNumber: string | null;
  receivedAt: string;
  /** How many times the website sent this order (idempotent: only the first creates it). */
  deliveries: number;
  payload: MainOrderPayload;
}
