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
  category: "Fintech",
  country: "UK",
  city: "London",
  contactEmail: "merchant@yqnpay.com"
};

const TEST_DOCUMENT = {
  documentType: "certificate_of_incorporation",
  fileUrl: "https://storage.example.com/doc-001.pdf"
};

const SECOND_TEST_DOCUMENT = {
  documentType: "proof_of_address",
  fileUrl: "https://storage.example.com/doc-002.pdf"
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
    const accessToken = await createAuthenticatedOperator();

    const createResponse = await request(app)
      .post("/merchants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_MERCHANT);

    expect(createResponse.status).toBe(201);
    expect(createResponse.body.legal_name).toBe(TEST_MERCHANT.legalName);
    expect(createResponse.body.registration_number).toBe(
      TEST_MERCHANT.registrationNumber
    );
    expect(createResponse.body.category).toBe(TEST_MERCHANT.category);
    expect(createResponse.body.country).toBe(TEST_MERCHANT.country);
    expect(createResponse.body.city).toBe(TEST_MERCHANT.city);
    expect(createResponse.body.contact_email).toBe(TEST_MERCHANT.contactEmail);
    expect(createResponse.body.status).toBe("PENDING_KYB");
    expect(createResponse.body.created_by).toBeDefined();

    const merchantResult = await pool.query(
      `
        SELECT registration_number, category, contact_email, status, created_by
        FROM merchants
        WHERE registration_number = $1
      `,
      [TEST_MERCHANT.registrationNumber]
    );

    expect(merchantResult.rowCount).toBe(1);
    expect(merchantResult.rows[0].category).toBe(TEST_MERCHANT.category);
    expect(merchantResult.rows[0].contact_email).toBe(TEST_MERCHANT.contactEmail);
    expect(merchantResult.rows[0].status).toBe("PENDING_KYB");
    expect(merchantResult.rows[0].created_by).toBe(
      createResponse.body.created_by
    );
  });

  test("GET /merchants returns merchants filtered by status and city", async () => {
    const accessToken = await createAuthenticatedOperator();

    const createResponse = await request(app)
      .post("/merchants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_MERCHANT);

    expect(createResponse.status).toBe(201);

    const listResponse = await request(app)
      .get("/merchants")
      .query({
        status: "PENDING_KYB",
        city: TEST_MERCHANT.city
      })
      .set("Authorization", `Bearer ${accessToken}`);

    expect(listResponse.status).toBe(200);
    expect(Array.isArray(listResponse.body)).toBe(true);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0].id).toBe(createResponse.body.id);
    expect(listResponse.body[0].category).toBe(TEST_MERCHANT.category);
    expect(listResponse.body[0].contact_email).toBe(TEST_MERCHANT.contactEmail);
  });

  test("GET /merchants/:id returns merchant details with documents and status history", async () => {
    const accessToken = await createAuthenticatedOperator();

    const createResponse = await request(app)
      .post("/merchants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_MERCHANT);

    const uploadResponse = await request(app)
      .post(`/merchants/${createResponse.body.id}/documents`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_DOCUMENT);

    expect(uploadResponse.status).toBe(201);

    const detailResponse = await request(app)
      .get(`/merchants/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`);

    expect(detailResponse.status).toBe(200);
    expect(detailResponse.body.merchant.id).toBe(createResponse.body.id);
    expect(detailResponse.body.merchant.category).toBe(TEST_MERCHANT.category);
    expect(detailResponse.body.merchant.contact_email).toBe(
      TEST_MERCHANT.contactEmail
    );
    expect(detailResponse.body.documents).toHaveLength(1);
    expect(detailResponse.body.documents[0].document_type).toBe(
      TEST_DOCUMENT.documentType
    );
    expect(detailResponse.body.statusHistory).toHaveLength(1);
    expect(detailResponse.body.statusHistory[0].new_status).toBe(
      "DOCUMENTS_SUBMITTED"
    );
  });

  test("PATCH /merchants/:id updates editable merchant fields without changing status", async () => {
    const accessToken = await createAuthenticatedOperator();

    const createResponse = await request(app)
      .post("/merchants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_MERCHANT);

    const updateResponse = await request(app)
      .patch(`/merchants/${createResponse.body.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        legalName: "Updated YQN Pay Merchant Ltd",
        category: "Payments",
        city: "Casablanca",
        contactEmail: "ops@yqnpay.com"
      });

    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.legal_name).toBe("Updated YQN Pay Merchant Ltd");
    expect(updateResponse.body.category).toBe("Payments");
    expect(updateResponse.body.city).toBe("Casablanca");
    expect(updateResponse.body.contact_email).toBe("ops@yqnpay.com");
    expect(updateResponse.body.status).toBe("PENDING_KYB");

    const merchantResult = await pool.query(
      `
        SELECT legal_name, category, city, contact_email, status
        FROM merchants
        WHERE id = $1
      `,
      [createResponse.body.id]
    );

    expect(merchantResult.rowCount).toBe(1);
    expect(merchantResult.rows[0].legal_name).toBe(
      "Updated YQN Pay Merchant Ltd"
    );
    expect(merchantResult.rows[0].category).toBe("Payments");
    expect(merchantResult.rows[0].city).toBe("Casablanca");
    expect(merchantResult.rows[0].contact_email).toBe("ops@yqnpay.com");
    expect(merchantResult.rows[0].status).toBe("PENDING_KYB");
  });

  test("POST /merchants/:id/documents uploads a KYB document and updates merchant status once", async () => {
    const accessToken = await createAuthenticatedOperator();

    const createResponse = await request(app)
      .post("/merchants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_MERCHANT);

    expect(createResponse.status).toBe(201);

    const firstUploadResponse = await request(app)
      .post(`/merchants/${createResponse.body.id}/documents`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_DOCUMENT);

    expect(firstUploadResponse.status).toBe(201);
    expect(firstUploadResponse.body.document.document_type).toBe(
      TEST_DOCUMENT.documentType
    );
    expect(firstUploadResponse.body.document.file_url).toBe(TEST_DOCUMENT.fileUrl);
    expect(firstUploadResponse.body.document.status).toBe("PENDING");
    expect(firstUploadResponse.body.merchantStatus).toBe("DOCUMENTS_SUBMITTED");

    const secondUploadResponse = await request(app)
      .post(`/merchants/${createResponse.body.id}/documents`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(SECOND_TEST_DOCUMENT);

    expect(secondUploadResponse.status).toBe(201);
    expect(secondUploadResponse.body.document.document_type).toBe(
      SECOND_TEST_DOCUMENT.documentType
    );
    expect(secondUploadResponse.body.merchantStatus).toBe("DOCUMENTS_SUBMITTED");

    const documentResult = await pool.query(
      `
        SELECT document_type, file_url, status
        FROM kyb_documents
        WHERE merchant_id = $1
        ORDER BY uploaded_at ASC
      `,
      [createResponse.body.id]
    );

    expect(documentResult.rowCount).toBe(2);
    expect(documentResult.rows[0].document_type).toBe(TEST_DOCUMENT.documentType);
    expect(documentResult.rows[0].status).toBe("PENDING");
    expect(documentResult.rows[1].document_type).toBe(
      SECOND_TEST_DOCUMENT.documentType
    );

    const merchantResult = await pool.query(
      `
        SELECT status
        FROM merchants
        WHERE id = $1
      `,
      [createResponse.body.id]
    );

    expect(merchantResult.rowCount).toBe(1);
    expect(merchantResult.rows[0].status).toBe("DOCUMENTS_SUBMITTED");

    const historyResult = await pool.query(
      `
        SELECT old_status, new_status, changed_by, notes
        FROM merchant_status_history
        WHERE merchant_id = $1
      `,
      [createResponse.body.id]
    );

    expect(historyResult.rowCount).toBe(1);
    expect(historyResult.rows[0].old_status).toBe("PENDING_KYB");
    expect(historyResult.rows[0].new_status).toBe("DOCUMENTS_SUBMITTED");
    expect(historyResult.rows[0].changed_by).toBe(createResponse.body.created_by);
    expect(historyResult.rows[0].notes).toBe("Merchant documents submitted.");
  });

  test("PATCH /merchants/:id/status moves a reviewed merchant to ACTIVE", async () => {
    const accessToken = await createAuthenticatedOperator();

    const createResponse = await request(app)
      .post("/merchants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_MERCHANT);

    const uploadResponse = await request(app)
      .post(`/merchants/${createResponse.body.id}/documents`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_DOCUMENT);

    const reviewResponse = await request(app)
      .patch(`/documents/${uploadResponse.body.document.id}`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "VERIFIED"
      });

    expect(reviewResponse.status).toBe(200);

    const moveToUnderReviewResponse = await request(app)
      .patch(`/merchants/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "UNDER_REVIEW"
      });

    expect(moveToUnderReviewResponse.status).toBe(200);
    expect(moveToUnderReviewResponse.body.status).toBe("UNDER_REVIEW");

    const activateResponse = await request(app)
      .patch(`/merchants/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "ACTIVE"
      });

    expect(activateResponse.status).toBe(200);
    expect(activateResponse.body.status).toBe("ACTIVE");

    const merchantResult = await pool.query(
      `
        SELECT status
        FROM merchants
        WHERE id = $1
      `,
      [createResponse.body.id]
    );

    expect(merchantResult.rowCount).toBe(1);
    expect(merchantResult.rows[0].status).toBe("ACTIVE");

    const historyResult = await pool.query(
      `
        SELECT old_status, new_status
        FROM merchant_status_history
        WHERE merchant_id = $1
        ORDER BY changed_at ASC
      `,
      [createResponse.body.id]
    );

    expect(historyResult.rowCount).toBe(3);
    expect(historyResult.rows[1].old_status).toBe("DOCUMENTS_SUBMITTED");
    expect(historyResult.rows[1].new_status).toBe("UNDER_REVIEW");
    expect(historyResult.rows[2].old_status).toBe("UNDER_REVIEW");
    expect(historyResult.rows[2].new_status).toBe("ACTIVE");
  });

  test("PATCH /merchants/:id/status blocks activation when documents are not all verified", async () => {
    const accessToken = await createAuthenticatedOperator();

    const createResponse = await request(app)
      .post("/merchants")
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_MERCHANT);

    await request(app)
      .post(`/merchants/${createResponse.body.id}/documents`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send(TEST_DOCUMENT);

    const moveToUnderReviewResponse = await request(app)
      .patch(`/merchants/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "UNDER_REVIEW"
      });

    expect(moveToUnderReviewResponse.status).toBe(200);

    const activateResponse = await request(app)
      .patch(`/merchants/${createResponse.body.id}/status`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({
        status: "ACTIVE"
      });

    expect(activateResponse.status).toBe(409);
    expect(activateResponse.body.message).toBe(
      "Merchant cannot be activated until all documents are verified."
    );

    const merchantResult = await pool.query(
      `
        SELECT status
        FROM merchants
        WHERE id = $1
      `,
      [createResponse.body.id]
    );

    expect(merchantResult.rowCount).toBe(1);
    expect(merchantResult.rows[0].status).toBe("UNDER_REVIEW");
  });
});
