import pool from "../db/index.js";
import {
  canTransitionMerchantStatus,
  MERCHANT_STATUSES
} from "./merchantStatusRules.js";
import { dispatchMerchantStatusWebhook } from "./webhookService.js";

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

const merchantSelectFields = `
  id,
  legal_name,
  registration_number,
  category,
  country,
  city,
  contact_email,
  status,
  assigned_reviewer,
  review_started_at,
  created_by,
  created_at,
  updated_at
`;

export async function createMerchant(merchantData, operatorId) {
  try {
    const result = await pool.query(
      `
        INSERT INTO merchants (
          legal_name,
          registration_number,
          category,
          country,
          city,
          contact_email,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING ${merchantSelectFields}
      `,
      [
        merchantData.legalName,
        merchantData.registrationNumber,
        merchantData.category,
        merchantData.country,
        merchantData.city || null,
        merchantData.contactEmail,
        operatorId
      ]
    );

    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      throw createHttpError(
        "A merchant with this registration number already exists.",
        409
      );
    }

    throw error;
  }
}

export async function listMerchants(filters) {
  const conditions = [];
  const values = [];

  if (filters.status) {
    values.push(filters.status);
    conditions.push(`status = $${values.length}`);
  }

  if (filters.city) {
    values.push(filters.city);
    conditions.push(`city = $${values.length}`);
  }

  if (filters.country) {
    values.push(filters.country);
    conditions.push(`country = $${values.length}`);
  }

  if (filters.category) {
    values.push(filters.category);
    conditions.push(`category = $${values.length}`);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query(
    `
      SELECT ${merchantSelectFields}
      FROM merchants
      ${whereClause}
      ORDER BY created_at DESC
    `,
    values
  );

  return result.rows;
}

export async function getMerchantDetails(merchantId) {
  const merchantResult = await pool.query(
    `
      SELECT ${merchantSelectFields}
      FROM merchants
      WHERE id = $1
      LIMIT 1
    `,
    [merchantId]
  );

  const merchant = merchantResult.rows[0];

  if (!merchant) {
    throw createHttpError("Merchant not found.", 404);
  }

  const [documentsResult, statusHistoryResult] = await Promise.all([
    pool.query(
      `
        SELECT
          id,
          merchant_id,
          document_type,
          file_url,
          status,
          uploaded_by,
          uploaded_at,
          reviewed_by,
          reviewed_at,
          review_notes
        FROM kyb_documents
        WHERE merchant_id = $1
        ORDER BY uploaded_at ASC
      `,
      [merchantId]
    ),
    pool.query(
      `
        SELECT
          id,
          merchant_id,
          old_status,
          new_status,
          changed_by,
          changed_at,
          notes
        FROM merchant_status_history
        WHERE merchant_id = $1
        ORDER BY changed_at ASC
      `,
      [merchantId]
    )
  ]);

  return {
    merchant,
    documents: documentsResult.rows,
    statusHistory: statusHistoryResult.rows
  };
}

export async function updateMerchant(merchantId, merchantData) {
  const updates = [];
  const values = [];
  const fieldMap = {
    legalName: "legal_name",
    registrationNumber: "registration_number",
    category: "category",
    country: "country",
    city: "city",
    contactEmail: "contact_email"
  };

  for (const [key, column] of Object.entries(fieldMap)) {
    if (merchantData[key] !== undefined) {
      values.push(merchantData[key]);
      updates.push(`${column} = $${values.length}`);
    }
  }

  if (updates.length === 0) {
    throw createHttpError("No merchant fields were provided for update.", 400);
  }

  values.push(merchantId);

  try {
    const result = await pool.query(
      `
        UPDATE merchants
        SET ${updates.join(", ")}
        WHERE id = $${values.length}
        RETURNING ${merchantSelectFields}
      `,
      values
    );

    if (result.rowCount === 0) {
      throw createHttpError("Merchant not found.", 404);
    }

    return result.rows[0];
  } catch (error) {
    if (error.code === "23505") {
      throw createHttpError(
        "A merchant with this registration number already exists.",
        409
      );
    }

    throw error;
  }
}

export async function uploadMerchantDocument(
  merchantId,
  documentData,
  operatorId
) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const merchantResult = await client.query(
      `
        SELECT id, status
        FROM merchants
        WHERE id = $1
        LIMIT 1
      `,
      [merchantId]
    );

    const merchant = merchantResult.rows[0];

    if (!merchant) {
      throw createHttpError("Merchant not found.", 404);
    }

    const documentResult = await client.query(
      `
        INSERT INTO kyb_documents (
          merchant_id,
          document_type,
          file_url,
          uploaded_by
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          merchant_id,
          document_type,
          file_url,
          status,
          uploaded_by,
          uploaded_at,
          reviewed_by,
          reviewed_at,
          review_notes
      `,
      [merchantId, documentData.documentType, documentData.fileUrl, operatorId]
    );

    let merchantStatus = merchant.status;

    if (
      canTransitionMerchantStatus(
        merchant.status,
        MERCHANT_STATUSES.DOCUMENTS_SUBMITTED
      )
    ) {
      merchantStatus = MERCHANT_STATUSES.DOCUMENTS_SUBMITTED;

      await client.query(
        `
          UPDATE merchants
          SET status = $2
          WHERE id = $1
        `,
        [merchantId, merchantStatus]
      );

      await client.query(
        `
          INSERT INTO merchant_status_history (
            merchant_id,
            old_status,
            new_status,
            changed_by,
            notes
          )
          VALUES ($1, $2, $3, $4, $5)
        `,
        [
          merchantId,
          merchant.status,
          merchantStatus,
          operatorId,
          "Merchant documents submitted."
        ]
      );
    }

    await client.query("COMMIT");

    if (merchantStatus !== merchant.status) {
      dispatchMerchantStatusWebhook(merchantId, merchantStatus);
    }

    return {
      document: documentResult.rows[0],
      merchantStatus
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function changeMerchantStatus(merchantId, statusData, operatorId) {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const merchantResult = await client.query(
      `
        SELECT id, status
        FROM merchants
        WHERE id = $1
        LIMIT 1
      `,
      [merchantId]
    );

    const merchant = merchantResult.rows[0];

    if (!merchant) {
      throw createHttpError("Merchant not found.", 404);
    }

    if (!canTransitionMerchantStatus(merchant.status, statusData.status)) {
      throw createHttpError("Invalid merchant status transition.", 409);
    }

    if (statusData.status === MERCHANT_STATUSES.ACTIVE) {
      const unresolvedDocumentsResult = await client.query(
        `
          SELECT COUNT(*)::INTEGER AS count
          FROM kyb_documents
          WHERE merchant_id = $1
            AND status != 'VERIFIED'
        `,
        [merchantId]
      );

      if (unresolvedDocumentsResult.rows[0].count > 0) {
        throw createHttpError(
          "Merchant cannot be activated until all documents are verified.",
          409
        );
      }
    }

    const updateResult = await client.query(
      `
        UPDATE merchants
        SET status = $2
        WHERE id = $1
        RETURNING ${merchantSelectFields}
      `,
      [merchantId, statusData.status]
    );

    await client.query(
      `
        INSERT INTO merchant_status_history (
          merchant_id,
          old_status,
          new_status,
          changed_by,
          notes
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [
        merchantId,
        merchant.status,
        statusData.status,
        operatorId,
        statusData.notes || null
      ]
    );

    await client.query("COMMIT");

    dispatchMerchantStatusWebhook(merchantId, statusData.status);

    return updateResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
