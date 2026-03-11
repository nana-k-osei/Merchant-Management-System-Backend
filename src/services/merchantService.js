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

export async function createMerchant(merchantData, operatorId) {
  try {
    const result = await pool.query(
      `
        INSERT INTO merchants (
          legal_name,
          registration_number,
          country,
          city,
          created_by
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING
          id,
          legal_name,
          registration_number,
          country,
          city,
          status,
          assigned_reviewer,
          review_started_at,
          created_by,
          created_at,
          updated_at
      `,
      [
        merchantData.legalName,
        merchantData.registrationNumber,
        merchantData.country,
        merchantData.city || null,
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
        RETURNING
          id,
          legal_name,
          registration_number,
          country,
          city,
          status,
          assigned_reviewer,
          review_started_at,
          created_by,
          created_at,
          updated_at
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
