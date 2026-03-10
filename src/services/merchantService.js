import pool from "../db/index.js";

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
