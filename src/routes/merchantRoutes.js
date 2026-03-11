import { Router } from "express";

import {
  create,
  getById,
  list,
  update,
  updateStatus,
  uploadDocument
} from "../controllers/merchantController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = Router();

router.get("/", authMiddleware, list);
router.get("/:id", authMiddleware, getById);
router.post("/", authMiddleware, create);
router.patch("/:id", authMiddleware, update);
router.post("/:id/documents", authMiddleware, uploadDocument);
router.patch("/:id/status", authMiddleware, updateStatus);

export default router;
