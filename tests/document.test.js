import bcrypt from "bcrypt";
import request from "supertest";

import app from "../src/app.js";
import pool from "../src/db/index.js";

const TEST_OPERATOR = {
  email: "document-test@yqnpay.com",
  password: "Pay1234",
  role: "admin"
};

const TEST_MERCHANT = {
  legalName: "YQN Pay Documents Ltd",
  registrationNumber: "YQNPAY-DOC-001",
  country: "UK",
  city: "London"
};

const TEST_DOCUMENT = {
  documentType: "certificate_of_incorporation",
  fileUrl: "https://storage.example.com/review-doc-001.pdf"
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

async function createAuthenticatedMerchant() {
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

  const createMerchantResponse = await request(app)
    .post("/merchants")
    .set("Authorization", `Bearer ${loginResponse.body.accessToken}`)
    .send(TEST_MERCHANT);

  const uploadDocumentResponse = await request(app)
    .post(`/merchants/${createMerchantResponse.body.id}/documents`)
    .set("Authorization", `Bearer ${loginResponse.body.accessToken}`)
    .send(TEST_DOCUMENT);

  return {
    accessToken: loginResponse.body.accessToken,
    merchantId: createMerchantResponse.body.id,
    operatorId: createMerchantResponse.body.created_by,
    documentId: uploadDocumentResponse.body.document.id
  };
}

describe("Document routes", () => {
  beforeEach(async () => {
    await cleanupTestMerchant();
    await cleanupTestOperator();
  });

  afterEach(async () => {
    await cleanupTestMerchant();
    await cleanupTestOperator();
  });

  afterAll(async () => {
    await pool.end();
  });

  test("PATCH /documents/:id reviews a pending document", async () => {
    const setup = await createAuthenticatedMerchant();

    const reviewResponse = await request(app)
      .patch(`/documents/${setup.documentId}`)
      .set("Authorization", `Bearer ${setup.accessToken}`)
      .send({
        status: "VERIFIED"
      });

    expect(reviewResponse.status).toBe(200);
    expect(reviewResponse.body.status).toBe("VERIFIED");
    expect(reviewResponse.body.reviewed_by).toBe(setup.operatorId);
    expect(reviewResponse.body.reviewed_at).toBeDefined();
    expect(reviewResponse.body.review_notes).toBeNull();

    const documentResult = await pool.query(
      `
        SELECT status, reviewed_by, reviewed_at, review_notes
        FROM kyb_documents
        WHERE id = $1
      `,
      [setup.documentId]
    );

    expect(documentResult.rowCount).toBe(1);
    expect(documentResult.rows[0].status).toBe("VERIFIED");
    expect(documentResult.rows[0].reviewed_by).toBe(setup.operatorId);
    expect(documentResult.rows[0].reviewed_at).toBeDefined();
    expect(documentResult.rows[0].review_notes).toBeNull();
  });

  test("PATCH /documents/:id rejects a second review attempt", async () => {
    const setup = await createAuthenticatedMerchant();

    const firstReviewResponse = await request(app)
      .patch(`/documents/${setup.documentId}`)
      .set("Authorization", `Bearer ${setup.accessToken}`)
      .send({
        status: "REJECTED",
        reviewNotes: "Document is not readable"
      });

    expect(firstReviewResponse.status).toBe(200);

    const secondReviewResponse = await request(app)
      .patch(`/documents/${setup.documentId}`)
      .set("Authorization", `Bearer ${setup.accessToken}`)
      .send({
        status: "VERIFIED"
      });

    expect(secondReviewResponse.status).toBe(409);
    expect(secondReviewResponse.body.message).toBe(
      "Only pending documents can be reviewed."
    );

    const documentResult = await pool.query(
      `
        SELECT status, review_notes
        FROM kyb_documents
        WHERE id = $1
      `,
      [setup.documentId]
    );

    expect(documentResult.rowCount).toBe(1);
    expect(documentResult.rows[0].status).toBe("REJECTED");
    expect(documentResult.rows[0].review_notes).toBe(
      "Document is not readable"
    );
  });
});
