import { Router } from "express";

const router = Router();

router.post("/", (req, res) => {
  res.status(200).json({
    message: "Welcome to Webhook Routes!"
  });
});

export default router;
