ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assigned_delivery_user_id UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS delivery_notes TEXT,
  ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_updated_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending_verification',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS verification_notes TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_status_check CHECK (
  delivery_status IN ('unassigned', 'assigned', 'out_for_delivery', 'delivered', 'not_delivered')
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_verification_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_verification_status_check CHECK (
  verification_status IN ('pending_verification', 'verified_delivered', 'verified_failed')
);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_delivery_user ON orders (assigned_delivery_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders (delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_verification_status ON orders (verification_status);
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS assigned_delivery_user_id UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'unassigned',
  ADD COLUMN IF NOT EXISTS delivery_notes TEXT,
  ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_updated_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending_verification',
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES admin_users(id),
  ADD COLUMN IF NOT EXISTS verification_notes TEXT;

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_status_check CHECK (
  delivery_status IN ('unassigned', 'assigned', 'out_for_delivery', 'delivered', 'not_delivered')
);

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_verification_status_check;
ALTER TABLE orders ADD CONSTRAINT orders_verification_status_check CHECK (
  verification_status IN ('pending_verification', 'verified_delivered', 'verified_failed')
);

CREATE INDEX IF NOT EXISTS idx_orders_assigned_delivery_user ON orders (assigned_delivery_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_status ON orders (delivery_status);
CREATE INDEX IF NOT EXISTS idx_orders_verification_status ON orders (verification_status);
