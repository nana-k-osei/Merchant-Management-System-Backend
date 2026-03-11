import { z } from "zod";

import {
  AVAILABLE_WEBHOOK_EVENTS,
  createWebhookSubscriptions
} from "../services/webhookService.js";

const createWebhookSchema = z.object({
  targetUrl: z.string().url(),
  eventTypes: z.array(z.enum(AVAILABLE_WEBHOOK_EVENTS)).min(1)
});

export async function create(req, res, next) {
  try {
    const payload = createWebhookSchema.parse(req.body);
    const result = await createWebhookSubscriptions(
      payload.targetUrl,
      payload.eventTypes
    );

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
