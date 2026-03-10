import request from "supertest";

import app from "../src/app.js";

describe("Auth routes", () => {
  test("POST /auth/login returns 400 for an invalid payload", async () => {
    const response = await request(app).post("/auth/login").send({
      email: "not-an-email",
      password: ""
    });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe("Validation failed.");
    expect(Array.isArray(response.body.errors)).toBe(true);
  });
});
