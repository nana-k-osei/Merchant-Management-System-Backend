import { z } from "zod";

import {
  loginOperator,
  logoutOperator,
  refreshOperatorAccessToken
} from "../services/authService.js";

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1)
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

export async function login(req, res, next) {
  try {
    // Validate the request body before calling the auth service.
    const payload = loginSchema.parse(req.body);
    const tokens = await loginOperator(payload.email, payload.password);

    res.status(200).json(tokens);
  } catch (error) {
    next(error);
  }
}

export async function refresh(req, res, next) {
  try {
    const payload = refreshSchema.parse(req.body);
    const accessToken = await refreshOperatorAccessToken(payload.refreshToken);

    res.status(200).json(accessToken);
  } catch (error) {
    next(error);
  }
}

export async function logout(req, res, next) {
  try {
    // authMiddleware attaches the decoded operator token to req.operator.
    await logoutOperator(req.operator.sub);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
}
