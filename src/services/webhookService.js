import { createHmac, randomBytes } from "node:crypto";

import pool from "../db/index.js";

const merchantStatusEventMap = {
  DOCUMENTS_SUBMITTED: "merchant.documents_submitted",
  UNDER_REVIEW: "merchant.under_review",
  ACTIVE: "merchant.activated",
  REJECTED: "merchant.rejected",
  SUSPENDED: "merchant.suspended",
  PENDING_KYB: "merchant.pending_kyb"
};

export const AVAILABLE_WEBHOOK_EVENTS = Object.values(merchantStatusEventMap);
const MAX_WEBHOOK_DELIVERY_ATTEMPTS = 3;

function createHttpError(message, status) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function buildSignature(secret, payload) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function getMerchantStatusEventName(status) {
  return merchantStatusEventMap[status] || null;
}

async function deliverWebhookWithRetries(subscription, payload, eventName) {
  const signature = buildSignature(subscription.secret, payload);

  for (let attempt = 1; attempt <= MAX_WEBHOOK_DELIVERY_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetch(subscription.target_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Signature": signature
        },
        body: payload
      });

      if (response.ok) {
        return;
      }

      if (attempt === MAX_WEBHOOK_DELIVERY_ATTEMPTS) {
        console.error(
          `Webhook delivery failed for ${eventName} after ${attempt} attempts.`
        );
      }
    } catch (error) {
      if (attempt === MAX_WEBHOOK_DELIVERY_ATTEMPTS) {
        console.error(
          `Webhook delivery failed for ${eventName} after ${attempt} attempts.`,
          error
        );
      }
    }
  }
}

export async function createWebhookSubscriptions(targetUrl, eventTypes) {
  const duplicateResult = await pool.query(
    `
      SELECT event_type
      FROM webhook_subscriptions
      WHERE target_url = $1
        AND event_type = ANY($2::text[])
    `,
    [targetUrl, eventTypes]
  );

  if (duplicateResult.rowCount > 0) {
    throw createHttpError(
      "One or more webhook subscriptions already exist for this target URL.",
      409
    );
  }

  const secret = randomBytes(32).toString("hex");
  const createdSubscriptions = [];

  for (const eventType of eventTypes) {
    const result = await pool.query(
      `
        INSERT INTO webhook_subscriptions (
          target_url,
          event_type,
          secret,
          is_active
        )
        VALUES ($1, $2, $3, TRUE)
        RETURNING id, target_url, event_type, is_active, created_at, updated_at
      `,
      [targetUrl, eventType, secret]
    );

    createdSubscriptions.push(result.rows[0]);
  }

  return {
    secret,
    subscriptions: createdSubscriptions
  };
}

export async function emitMerchantStatusWebhook(merchantId, status) {
  const eventName = getMerchantStatusEventName(status);

  if (!eventName) {
    return;
  }

  const subscriptionsResult = await pool.query(
    `
      SELECT target_url, secret
      FROM webhook_subscriptions
      WHERE event_type = $1
        AND is_active = TRUE
    `,
    [eventName]
  );

  const payload = JSON.stringify({
    event: eventName,
    merchantId,
    status,
    timestamp: new Date().toISOString()
  });

  for (const subscription of subscriptionsResult.rows) {
    await deliverWebhookWithRetries(subscription, payload, eventName);
  }
}

export function dispatchMerchantStatusWebhook(merchantId, status) {
  setImmediate(() => {
    emitMerchantStatusWebhook(merchantId, status).catch((error) => {
      console.error("Background webhook dispatch failed.", error);
    });
  });
}
