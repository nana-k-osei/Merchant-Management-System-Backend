import { z } from "zod";

import { createMerchant } from "../services/merchantService.js";

const createMerchantSchema = z.object({
  legalName: z.string().trim().min(1),
  registrationNumber: z.string().trim().min(1),
  country: z.string().trim().min(1),
  city: z.string().trim().min(1).optional()
});

export async function create(req, res, next) {
  try {
    const payload = createMerchantSchema.parse(req.body);
    const merchant = await createMerchant(payload, req.operator.sub);

    res.status(201).json(merchant);
  } catch (error) {
    next(error);
  }
}
