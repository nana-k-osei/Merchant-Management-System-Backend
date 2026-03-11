import { Router } from "express";

import {
  create,
  updateStatus,
  uploadDocument
} from "../controllers/merchantController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", authMiddleware, create);
router.post("/:id/documents", authMiddleware, uploadDocument);
router.patch("/:id/status", authMiddleware, updateStatus);

export default router;
