import pool from "../db/index.js";

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

export async function reviewDocument(documentId, reviewData, operatorId) {
  const documentResult = await pool.query(
    `
      SELECT id, merchant_id, status
      FROM kyb_documents
      WHERE id = $1
      LIMIT 1
    `,
    [documentId]
  );

  const document = documentResult.rows[0];

  if (!document) {
    throw createHttpError("Document not found.", 404);
  }

  if (document.status !== "PENDING") {
    throw createHttpError("Only pending documents can be reviewed.", 409);
  }

  const result = await pool.query(
    `
      UPDATE kyb_documents
      SET status = $2,
          reviewed_by = $3,
          reviewed_at = NOW(),
          review_notes = $4
      WHERE id = $1
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
    [
      documentId,
      reviewData.status,
      operatorId,
      reviewData.reviewNotes || null
    ]
  );

  return result.rows[0];
}
