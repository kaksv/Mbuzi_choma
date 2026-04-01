-- Checkout: subtotal + delivery fee, fulfillment option, payment method & Pesapal metadata.

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS subtotal_ugx INTEGER,
  ADD COLUMN IF NOT EXISTS delivery_fee_ugx INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'delivery',
  ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'cash_on_delivery',
  ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS pesapal_order_tracking_id TEXT;

UPDATE orders SET subtotal_ugx = total_ugx WHERE subtotal_ugx IS NULL;

ALTER TABLE orders ALTER COLUMN subtotal_ugx SET NOT NULL;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_fulfillment_type_check;
ALTER TABLE orders ADD CONSTRAINT orders_fulfillment_type_check CHECK (
  fulfillment_type IN ('pickup', 'delivery', 'delivery_pending')
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_method_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_method_check CHECK (
  payment_method IN ('pesapal', 'cash_on_delivery')
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_payment_status_check CHECK (
  payment_status IN ('pending', 'paid', 'failed')
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_total_matches_line_plus_delivery;
ALTER TABLE orders ADD CONSTRAINT orders_total_matches_line_plus_delivery CHECK (
  total_ugx = subtotal_ugx + delivery_fee_ugx
);
