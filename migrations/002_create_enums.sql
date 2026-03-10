-- Domain enums used by core tables.

CREATE TYPE merchant_status AS ENUM (
  'PENDING_KYB',
  'DOCUMENTS_SUBMITTED',
  'UNDER_REVIEW',
  'ACTIVE',
  'REJECTED',
  'SUSPENDED'
);

CREATE TYPE document_status AS ENUM (
  'PENDING',
  'VERIFIED',
  'REJECTED'
);

