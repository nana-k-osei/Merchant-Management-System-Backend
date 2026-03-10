-- Domain enums used by core tables.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'merchant_status'
  ) THEN
    CREATE TYPE merchant_status AS ENUM (
      'PENDING_KYB',
      'DOCUMENTS_SUBMITTED',
      'UNDER_REVIEW',
      'ACTIVE',
      'REJECTED',
      'SUSPENDED'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type
    WHERE typname = 'document_status'
  ) THEN
    CREATE TYPE document_status AS ENUM (
      'PENDING',
      'VERIFIED',
      'REJECTED'
    );
  END IF;
END $$;
