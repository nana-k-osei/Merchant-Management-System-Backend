import express from "express";

import pool from "./db/index.js";
import authRoutes from "./routes/authRoutes.js";
import documentRoutes from "./routes/documentRoutes.js";
import merchantRoutes from "./routes/merchantRoutes.js";
import webhookRoutes from "./routes/webhookRoutes.js";
import errorHandler from "./middleware/errorHandler.js";

const app = express();

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

// Test database connection
app.get("/db-test", async (req, res, next) => {
  try {
    const result = await pool.query("SELECT NOW() AS now");
    res.json({ dbTime: result.rows[0].now });
  } catch (error) {
    next(error);
  }
});

app.use("/auth", authRoutes);
app.use("/documents", documentRoutes);
app.use("/merchants", merchantRoutes);
app.use("/webhooks", webhookRoutes);

app.use(errorHandler);

export default app;
