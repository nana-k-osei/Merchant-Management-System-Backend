import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/db/index.js";

const TEST_OPERATOR = {
  email: "sam@yqnpay.com",
  password: "Pay1234",
  role: "admin"
};

async function cleanupTestOperator() {
  // Remove dependent refresh tokens first, then delete the test operator.
  await pool.query(
    `
      DELETE FROM refresh_tokens
      WHERE operator_id IN (
        SELECT id
        FROM operators
        WHERE email = $1
      )
    `,
    [TEST_OPERATOR.email]
  );

  await pool.query("DELETE FROM operators WHERE email = $1", [
    TEST_OPERATOR.email
  ]);
}

describe("Auth routes", () => {
  beforeEach(async () => {
    // Start each test from a clean database state for this operator.
    await cleanupTestOperator();
  });

  afterEach(async () => {
    // Clean up again so one test cannot affect the next one.
    await cleanupTestOperator();
  });

  afterAll(async () => {
    // Close the shared database pool so Jest can exit cleanly.
    await pool.end();
  });

  test("POST /auth/login returns 400 for an invalid payload", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "not-an-email",
      password: ""
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed.");
    expect(Array.isArray(response.body.errors)).toBe(true);
  });

  test("POST /auth/login returns access and refresh tokens for a valid operator", async () => {
    // Seed a real operator row with a bcrypt-hashed password.
    const passwordHash = await bcrypt.hash(TEST_OPERATOR.password, 10);

    await pool.query(
      `
        INSERT INTO operators (
          email,
          password_hash,
          role,
          is_active,
          failed_login_attempts,
          locked_until
        )
        VALUES ($1, $2, $3, TRUE, 0, NULL)
      `,
      [TEST_OPERATOR.email, passwordHash, TEST_OPERATOR.role]
    );

    const response = await request(app).post("/auth/login").send({
      email: TEST_OPERATOR.email,
      password: TEST_OPERATOR.password
    });

    expect(response.status).toBe(200);
    expect(typeof response.body.accessToken).toBe("string");
    expect(typeof response.body.refreshToken).toBe("string");

    // Verify both JWTs were signed correctly and contain the expected claims.
    const decodedAccessToken = jwt.verify(
      response.body.accessToken,
      process.env.JWT_SECRET
    );
    const decodedRefreshToken = jwt.verify(
      response.body.refreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    expect(decodedAccessToken.sub).toBeDefined();
    expect(decodedAccessToken.email).toBe(TEST_OPERATOR.email);
    expect(decodedAccessToken.role).toBe(TEST_OPERATOR.role);
    expect(decodedRefreshToken.sub).toBe(decodedAccessToken.sub);
    expect(decodedRefreshToken.jti).toBeDefined();
    expect(decodedRefreshToken.type).toBe("refresh");

    // The raw refresh token should never be stored directly in the database.
    const refreshTokenResult = await pool.query(
      `
        SELECT id, token_hash, revoked
        FROM refresh_tokens
        WHERE operator_id = $1
      `,
      [decodedAccessToken.sub]
    );

    expect(refreshTokenResult.rowCount).toBe(1);
    expect(refreshTokenResult.rows[0].id).toBe(decodedRefreshToken.jti);
    expect(refreshTokenResult.rows[0].revoked).toBe(false);

    const refreshTokenMatchesHash = await bcrypt.compare(
      response.body.refreshToken,
      refreshTokenResult.rows[0].token_hash
    );

    expect(refreshTokenMatchesHash).toBe(true);
  });
});
