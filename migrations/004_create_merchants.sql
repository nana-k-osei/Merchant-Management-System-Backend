CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  registration_number TEXT NOT NULL UNIQUE,
  country TEXT NOT NULL,
  city TEXT,
  status merchant_status NOT NULL DEFAULT 'PENDING_KYB',

  assigned_reviewer UUID REFERENCES operators(id) ON DELETE SET NULL,
  review_started_at TIMESTAMPTZ,

  created_by UUID REFERENCES operators(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
