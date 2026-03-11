import { z } from "zod";

import { reviewDocument } from "../services/documentService.js";

const reviewDocumentParamsSchema = z.object({
  id: z.string().uuid()
});

const reviewDocumentSchema = z
  .object({
    status: z.enum(["VERIFIED", "REJECTED"]),
    reviewNotes: z.string().trim().min(1).optional()
  })
  .superRefine((value, ctx) => {
    if (value.status === "REJECTED" && !value.reviewNotes) {
      ctx.addIssue({
        code: "custom",
        path: ["reviewNotes"],
        message: "Review notes are required when rejecting a document."
      });
    }
  });

export async function review(req, res, next) {
  try {
    const params = reviewDocumentParamsSchema.parse(req.params);
    const payload = reviewDocumentSchema.parse(req.body);
    const document = await reviewDocument(params.id, payload, req.operator.sub);

    res.status(200).json(document);
  } catch (error) {
    next(error);
  }
}
