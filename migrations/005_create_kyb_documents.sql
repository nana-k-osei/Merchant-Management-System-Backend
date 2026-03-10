CREATE TABLE IF NOT EXISTS kyb_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,

  document_type TEXT NOT NULL,
  file_url TEXT NOT NULL,

  status document_status NOT NULL DEFAULT 'PENDING',

  uploaded_by UUID REFERENCES operators(id) ON DELETE SET NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  reviewed_by UUID REFERENCES operators(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,

  review_notes TEXT
);
