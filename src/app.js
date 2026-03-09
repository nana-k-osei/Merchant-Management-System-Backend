import express from "express";

import authRoutes from "./routes/authRoutes.js";
import merchantRoutes from "./routes/merchantRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/auth", authRoutes);
app.use("/merchants", merchantRoutes);
app.use("/webhooks", webhookRoutes);

app.use(errorHandler);

export default app;
