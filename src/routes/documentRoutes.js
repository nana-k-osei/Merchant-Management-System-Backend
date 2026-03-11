import { Router } from "express";

import { review } from "../controllers/documentController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = Router();

router.patch("/:id", authMiddleware, review);

export default router;
