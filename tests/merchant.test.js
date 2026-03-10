import bcrypt from "bcrypt";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/db/index.js";

const TEST_OPERATOR = {
  email: "merchant-test@yqnpay.com",
  password: "Pay1234",
  role: "admin"
};

const TEST_MERCHANT = {
  legalName: "YQN Pay Merchant Ltd",
  registrationNumber: "YQNPAY-TEST-001",
  country: "UK",
  city: "London"
};

async function cleanupTestMerchant() {
  await pool.query("DELETE FROM merchants WHERE registration_number = $1", [
    TEST_MERCHANT.registrationNumber
  ]);
}

async function cleanupTestOperator() {
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

describe("Merchant routes", () => {
  beforeEach(async () => {
    // Reset merchant and operator rows so the test always starts clean.
    await cleanupTestMerchant();
    await cleanupTestOperator();
  });

  afterEach(async () => {
    // Remove any rows created during the test.
    await cleanupTestMerchant();
    await cleanupTestOperator();
  });

  afterAll(async () => {
    // Close the shared database pool once this test file is finished.
    await pool.end();
  });

  test("POST /merchants creates a merchant for an authenticated operator", async () => {
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
        RETURNING id
      `,
      [TEST_OPERATOR.email, passwordHash, TEST_OPERATOR.role]
    );

    const loginResponse = await request(app).post("/auth/login").send({
      email: TEST_OPERATOR.email,
      password: TEST_OPERATOR.password
    });

    expect(loginResponse.status).toBe(200);

    const createResponse = await request(app)
      .post("/merchants")
      .set("Authorization", `Bearer ${loginResponse.body.accessToken}`)
      .send(TEST_MERCHANT);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.legal_name).toBe(TEST_MERCHANT.legalName);
    expect(createResponse.body.registration_number).toBe(
      TEST_MERCHANT.registrationNumber
    );
    expect(createResponse.body.country).toBe(TEST_MERCHANT.country);
    expect(createResponse.body.city).toBe(TEST_MERCHANT.city);
    expect(createResponse.body.status).toBe("PENDING_KYB");
    expect(createResponse.body.created_by).toBeDefined();

    const merchantResult = await pool.query(
      `
        SELECT registration_number, status, created_by
        FROM merchants
        WHERE registration_number = $1
      `,
      [TEST_MERCHANT.registrationNumber]
    );

    expect(merchantResult.rowCount).toBe(1);
    expect(merchantResult.rows[0].status).toBe("PENDING_KYB");
    expect(merchantResult.rows[0].created_by).toBe(
      createResponse.body.created_by
    );
  });
});
