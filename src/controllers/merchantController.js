import { z } from "zod";

import {
  changeMerchantStatus,
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

const updateMerchantStatusParamsSchema = z.object({
  id: z.string().uuid()
});

const updateMerchantStatusSchema = z
  .object({
    status: z.enum(["UNDER_REVIEW", "ACTIVE", "REJECTED", "SUSPENDED", "PENDING_KYB"]),
    notes: z.string().trim().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === "REJECTED" && !value.notes) {
      ctx.addIssue({
        code: "custom",
        path: ["notes"],
        message: "Notes are required when rejecting a merchant."
      });
    }
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

export async function updateStatus(req, res, next) {
  try {
    const params = updateMerchantStatusParamsSchema.parse(req.params);
    const payload = updateMerchantStatusSchema.parse(req.body);
    const merchant = await changeMerchantStatus(
      params.id,
      payload,
      req.operator.sub
    );

    res.status(200).json(merchant);
  } catch (error) {
    next(error);
  }
}
