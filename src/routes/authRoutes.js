import { Router } from "express";

import {
  login,
  logout,
  refresh
} from "../controllers/authController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = Router();

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", authMiddleware, logout);

export default router;
