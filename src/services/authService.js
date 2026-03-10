import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";

import pool from "../db/index.js";

const MAX_FAILED_LOGIN_ATTEMPTS = Number(
  process.env.MAX_FAILED_LOGIN_ATTEMPTS || 5
);
const ACCOUNT_LOCK_DURATION_MINUTES = Number(
  process.env.ACCOUNT_LOCK_DURATION_MINUTES || 15
);
const ACCESS_TOKEN_EXPIRY =
  process.env.ACCESS_TOKEN_EXPIRY || process.env.JWT_EXPIRY || "15m";
const REFRESH_TOKEN_EXPIRY = process.env.REFRESH_TOKEN_EXPIRY || "7d";
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
const REFRESH_TOKEN_SALT_ROUNDS = Number(
  process.env.REFRESH_TOKEN_SALT_ROUNDS || 10
);

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function assertSecretsConfigured() {
  if (!ACCESS_TOKEN_SECRET) {
    throw createHttpError("JWT_SECRET is not configured.", 500);
  }

  if (!REFRESH_TOKEN_SECRET) {
    throw createHttpError("REFRESH_TOKEN_SECRET is not configured.", 500);
  }
}

function createAccessToken(operator) {
  // Access tokens are short-lived and used on protected API requests.
  return jwt.sign(
    {
      sub: operator.id,
      email: operator.email,
      role: operator.role
    },
    ACCESS_TOKEN_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );
}

function createRefreshToken(operatorId) {
  const tokenId = randomUUID();
  // Refresh tokens last longer and are tied to a unique token id (jti).
  const token = jwt.sign(
    {
      sub: operatorId,
      jti: tokenId,
      type: "refresh"
    },
    REFRESH_TOKEN_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  const decodedToken = jwt.decode(token);

  if (!decodedToken || typeof decodedToken === "string" || !decodedToken.exp) {
    throw createHttpError("Failed to create refresh token.", 500);
  }

  return {
    token,
    tokenId,
    expiresAt: new Date(decodedToken.exp * 1000)
  };
}

async function getOperatorByEmail(email) {
  const result = await pool.query(
    `
      SELECT
        id,
        email,
        password_hash,
        role,
        is_active,
        failed_login_attempts,
        locked_until
      FROM operators
      WHERE email = $1
      LIMIT 1
    `,
    [email]
  );

  return result.rows[0] || null;
}

async function getRefreshTokenRecord(tokenId, operatorId) {
  const result = await pool.query(
    `
      SELECT id, operator_id, token_hash, expires_at, revoked
      FROM refresh_tokens
      WHERE id = $1 AND operator_id = $2
      LIMIT 1
    `,
    [tokenId, operatorId]
  );

  return result.rows[0] || null;
}

async function resetFailedLoginState(operatorId) {
  await pool.query(
    `
      UPDATE operators
      SET failed_login_attempts = 0,
          locked_until = NULL
      WHERE id = $1
    `,
    [operatorId]
  );
}

async function registerFailedLogin(operator) {
  const nextAttempts = operator.failed_login_attempts + 1;
  // Lock the account for a short period once the failure limit is reached.
  const shouldLock = nextAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
  const lockedUntil = shouldLock
    ? new Date(Date.now() + ACCOUNT_LOCK_DURATION_MINUTES * 60 * 1000)
    : null;

  await pool.query(
    `
      UPDATE operators
      SET failed_login_attempts = $2,
          locked_until = $3
      WHERE id = $1
    `,
    [operator.id, nextAttempts, lockedUntil]
  );
}

async function persistRefreshToken(operatorId, refreshTokenData) {
  // Store only a hash so the raw refresh token is never saved in the database.
  const tokenHash = await bcrypt.hash(
    refreshTokenData.token,
    REFRESH_TOKEN_SALT_ROUNDS
  );

  await pool.query(
    `
      INSERT INTO refresh_tokens (
        id,
        operator_id,
        token_hash,
        expires_at,
        revoked
      )
      VALUES ($1, $2, $3, $4, FALSE)
      ON CONFLICT (operator_id)
      DO UPDATE SET
        id = EXCLUDED.id,
        token_hash = EXCLUDED.token_hash,
        expires_at = EXCLUDED.expires_at,
        revoked = FALSE
    `,
    [
      refreshTokenData.tokenId,
      operatorId,
      tokenHash,
      refreshTokenData.expiresAt
    ]
  );
}

export async function loginOperator(email, password) {
  assertSecretsConfigured();

  const operator = await getOperatorByEmail(email);

  if (!operator) {
    throw createHttpError("Invalid email or password.", 401);
  }

  if (!operator.is_active) {
    throw createHttpError("Operator account is inactive.", 403);
  }

  if (operator.locked_until && new Date(operator.locked_until) > new Date()) {
    throw createHttpError("Account is temporarily locked.", 423);
  }

  const passwordMatches = await bcrypt.compare(password, operator.password_hash);

  if (!passwordMatches) {
    await registerFailedLogin(operator);
    throw createHttpError("Invalid email or password.", 401);
  }

  // A successful login clears any previous failed-attempt state.
  await resetFailedLoginState(operator.id);

  const accessToken = createAccessToken(operator);
  const refreshTokenData = createRefreshToken(operator.id);

  await persistRefreshToken(operator.id, refreshTokenData);

  return {
    accessToken,
    refreshToken: refreshTokenData.token
  };
}

export async function refreshOperatorAccessToken(refreshToken) {
  assertSecretsConfigured();

  let decodedToken;

  try {
    decodedToken = jwt.verify(refreshToken, REFRESH_TOKEN_SECRET);
  } catch {
    throw createHttpError("Invalid refresh token.", 401);
  }

  if (!decodedToken?.sub || !decodedToken?.jti || decodedToken.type !== "refresh") {
    throw createHttpError("Invalid refresh token.", 401);
  }

  const refreshTokenRecord = await getRefreshTokenRecord(
    decodedToken.jti,
    decodedToken.sub
  );

  // The token must exist in the database and match the stored hash.
  if (!refreshTokenRecord) {
    throw createHttpError("Refresh token not found.", 401);
  }

  if (refreshTokenRecord.revoked) {
    throw createHttpError("Refresh token has been revoked.", 401);
  }

  if (new Date(refreshTokenRecord.expires_at) <= new Date()) {
    throw createHttpError("Refresh token has expired.", 401);
  }

  const tokenMatches = await bcrypt.compare(
    refreshToken,
    refreshTokenRecord.token_hash
  );

  if (!tokenMatches) {
    throw createHttpError("Invalid refresh token.", 401);
  }

  const operatorResult = await pool.query(
    `
      SELECT id, email, role, is_active
      FROM operators
      WHERE id = $1
      LIMIT 1
    `,
    [decodedToken.sub]
  );

  const operator = operatorResult.rows[0];

  if (!operator || !operator.is_active) {
    throw createHttpError("Operator account is inactive.", 403);
  }

  return {
    accessToken: createAccessToken(operator)
  };
}

export async function logoutOperator(operatorId) {
  // One refresh token per operator means logout can remove that single row.
  await pool.query("DELETE FROM refresh_tokens WHERE operator_id = $1", [
    operatorId
  ]);
}
