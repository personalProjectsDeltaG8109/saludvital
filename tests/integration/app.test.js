import request from "supertest";
import app from "../../app.js";

describe("SaludVital application", () => {
  test("GET /health returns the application status", async () => {
    const response = await request(app).get("/health");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      application: "SaludVital",
    });
  });

  test("GET / renders the homepage", async () => {
    const response = await request(app).get("/");

    expect(response.status).toBe(200);
    expect(response.text).toContain("SaludVital");
    expect(response.text).toContain("Your health, connected.");
  });

  test("unknown routes return 404", async () => {
    const response = await request(app).get("/route-that-does-not-exist");

    expect(response.status).toBe(404);
  });
});
