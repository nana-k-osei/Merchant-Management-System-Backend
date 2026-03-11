import { z } from "zod";

import {
  createMerchant,
  uploadMerchantDocument
} from "../services/merchantService.js";

const createMerchantSchema = z.object({
  legalName: z.string().trim().min(1),
  registrationNumber: z.string().trim().min(1),
  country: z.string().trim().min(1),
  city: z.string().trim().min(1).optional()
});

const uploadDocumentParamsSchema = z.object({
  id: z.string().uuid()
});

const uploadDocumentSchema = z.object({
  documentType: z.string().trim().min(1),
  fileUrl: z.string().url()
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

export async function uploadDocument(req, res, next) {
  try {
    const params = uploadDocumentParamsSchema.parse(req.params);
    const payload = uploadDocumentSchema.parse(req.body);
    const result = await uploadMerchantDocument(
      params.id,
      payload,
      req.operator.sub
    );

    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}
