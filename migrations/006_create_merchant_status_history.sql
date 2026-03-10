CREATE TABLE merchant_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  old_status merchant_status,
  new_status merchant_status NOT NULL,

  changed_by UUID REFERENCES operators(id) ON DELETE SET NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  notes TEXT
);

