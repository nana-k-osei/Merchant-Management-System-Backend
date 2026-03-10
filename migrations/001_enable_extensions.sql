-- Enable extensions required by this schema.
-- pgcrypto provides gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- citext provides case-insensitive text comparisons (useful for emails).
CREATE EXTENSION IF NOT EXISTS citext;
