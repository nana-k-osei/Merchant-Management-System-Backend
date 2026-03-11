import { z } from "zod";

import {
  changeMerchantStatus,
  createMerchant,
  getMerchantDetails,
  listMerchants,
  updateMerchant,
  uploadMerchantDocument
} from "../services/merchantService.js";
import { MERCHANT_STATUSES } from "../services/merchantStatusRules.js";

const createMerchantSchema = z.object({
  legalName: z.string().trim().min(1),
  registrationNumber: z.string().trim().min(1),
  category: z.string().trim().min(1),
  country: z.string().trim().min(1),
  city: z.string().trim().min(1),
  contactEmail: z.string().email()
});

const merchantParamsSchema = z.object({
  id: z.string().uuid()
});

const listMerchantsQuerySchema = z.object({
  status: z.enum(Object.values(MERCHANT_STATUSES)).optional(),
  city: z.string().trim().min(1).optional(),
  country: z.string().trim().min(1).optional(),
  category: z.string().trim().min(1).optional()
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

const updateMerchantSchema = z
  .object({
    legalName: z.string().trim().min(1).optional(),
    registrationNumber: z.string().trim().min(1).optional(),
    category: z.string().trim().min(1).optional(),
    country: z.string().trim().min(1).optional(),
    city: z.string().trim().min(1).optional(),
    contactEmail: z.string().email().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one merchant field must be provided."
  });

export async function list(req, res, next) {
  try {
    const filters = listMerchantsQuerySchema.parse(req.query);
    const merchants = await listMerchants(filters);

    res.status(200).json(merchants);
  } catch (error) {
    next(error);
  }
}

export async function getById(req, res, next) {
  try {
    const params = merchantParamsSchema.parse(req.params);
    const merchant = await getMerchantDetails(params.id);

    res.status(200).json(merchant);
  } catch (error) {
    next(error);
  }
}

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

export async function update(req, res, next) {
  try {
    const params = merchantParamsSchema.parse(req.params);
    const payload = updateMerchantSchema.parse(req.body);
    const merchant = await updateMerchant(params.id, payload);

    res.status(200).json(merchant);
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
