import bcrypt from "bcrypt";
import { createHmac } from "node:crypto";
import { jest } from "@jest/globals";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/db/index.js";

const TEST_OPERATOR = {
  email: "webhook-test@yqnpay.com",
  password: "Pay1234",
  role: "admin"
};

const TEST_MERCHANT = {
  legalName: "YQN Pay Webhook Ltd",
  registrationNumber: "YQNPAY-WEBHOOK-001",
  country: "UK",
  city: "London"
};

const TEST_DOCUMENT = {
  documentType: "certificate_of_incorporation",
  fileUrl: "https://storage.example.com/webhook-doc-001.pdf"
};

const TEST_WEBHOOK = {
  targetUrl: "https://example.com/webhooks/merchant-activated",
  eventType: "merchant.activated"
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

async function cleanupWebhookSubscription() {
  await pool.query("DELETE FROM webhook_subscriptions WHERE target_url = $1", [
    TEST_WEBHOOK.targetUrl
  ]);
}

async function createAuthenticatedOperator() {
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

  const loginResponse = await request(app).post("/auth/login").send({
    email: TEST_OPERATOR.email,
    password: TEST_OPERATOR.password
  });

  expect(loginResponse.status).toBe(200);

  return loginResponse.body.accessToken;
}

async function waitForFetchCalls(expectedCalls) {
  const timeoutMs = 1000;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (global.fetch.mock.calls.length >= expectedCalls) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  throw new Error(`Expected ${expectedCalls} webhook delivery calls.`);
}

describe("Webhook delivery", () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    await cleanupTestMerchant();
    await cleanupTestOperator();
    await cleanupWebhookSubscription();

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200
    });
  });

  afterEach(async () => {
    await cleanupTestMerchant();
    await cleanupTestOperator();
    await cleanupWebhookSubscription();

    global.fetch = originalFetch;
  });

  afterAll(async () => {
    await pool.end();
  });

  test("merchant activation sends a signed webhook event to active subscribers", async () => {
    const accessToken = await createAuthenticatedOperator();

    const registerResponse = await request(app)
      .post("/webhooks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        targetUrl: TEST_WEBHOOK.targetUrl,
        eventTypes: [TEST_WEBHOOK.eventType]
      });

    expect(registerResponse.status).toBe(201);
    expect(registerResponse.body.subscriptions).toHaveLength(1);
    expect(registerResponse.body.subscriptions[0].event_type).toBe(
      TEST_WEBHOOK.eventType
    );
    expect(typeof registerResponse.body.secret).toBe("string");

    const createResponse = await request(app)
      .post("/merchants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_MERCHANT);

    const uploadResponse = await request(app)
      .post(`/merchants/${createResponse.body.id}/documents`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_DOCUMENT);

    await request(app)
      .patch(`/documents/${uploadResponse.body.document.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "VERIFIED"
      });

    await request(app)
      .patch(`/merchants/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "UNDER_REVIEW"
      });

    const activateResponse = await request(app)
      .patch(`/merchants/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "ACTIVE"
      });

    expect(activateResponse.status).toBe(200);
    await waitForFetchCalls(1);

    const [targetUrl, requestOptions] = global.fetch.mock.calls[0];

    expect(targetUrl).toBe(TEST_WEBHOOK.targetUrl);
    expect(requestOptions.method).toBe("POST");
    expect(requestOptions.headers["Content-Type"]).toBe("application/json");

    const payload = JSON.parse(requestOptions.body);

    expect(payload.event).toBe("merchant.activated");
    expect(payload.merchantId).toBe(createResponse.body.id);
    expect(payload.status).toBe("ACTIVE");
    expect(payload.timestamp).toBeDefined();

    const expectedSignature = createHmac("sha256", registerResponse.body.secret)
      .update(requestOptions.body)
      .digest("hex");

    expect(requestOptions.headers["X-Signature"]).toBe(expectedSignature);
  });

  test("webhook delivery retries up to three times before succeeding", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    const accessToken = await createAuthenticatedOperator();

    const registerResponse = await request(app)
      .post("/webhooks")
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        targetUrl: TEST_WEBHOOK.targetUrl,
        eventTypes: [TEST_WEBHOOK.eventType]
      });

    expect(registerResponse.status).toBe(201);

    const createResponse = await request(app)
      .post("/merchants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_MERCHANT);

    const uploadResponse = await request(app)
      .post(`/merchants/${createResponse.body.id}/documents`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_DOCUMENT);

    await request(app)
      .patch(`/documents/${uploadResponse.body.document.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "VERIFIED"
      });

    await request(app)
      .patch(`/merchants/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "UNDER_REVIEW"
      });

    const activateResponse = await request(app)
      .patch(`/merchants/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "ACTIVE"
      });

    expect(activateResponse.status).toBe(200);
    await waitForFetchCalls(3);
    expect(global.fetch).toHaveBeenCalledTimes(3);
  });
});
