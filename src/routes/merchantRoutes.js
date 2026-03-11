import { Router } from "express";

import {
  create,
  uploadDocument
} from "../controllers/merchantController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = Router();

router.post("/", authMiddleware, create);
router.post("/:id/documents", authMiddleware, uploadDocument);

export default router;
