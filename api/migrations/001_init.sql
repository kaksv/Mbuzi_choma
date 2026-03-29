CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  weight_kg NUMERIC(8, 3) NOT NULL,
  price_ugx INTEGER NOT NULL CHECK (price_ugx > 0),
  photo_url TEXT NOT NULL,
  popular BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id TEXT NOT NULL REFERENCES products (id),
  quantity INTEGER NOT NULL CHECK (quantity >= 1 AND quantity <= 100),
  unit_price_ugx INTEGER NOT NULL CHECK (unit_price_ugx > 0),
  total_ugx INTEGER NOT NULL CHECK (total_ugx > 0),
  customer_full_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_location TEXT NOT NULL,
  customer_notes TEXT,
  transaction_ref TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_orders_created_at ON orders (created_at DESC);
CREATE INDEX idx_orders_product_id ON orders (product_id);
