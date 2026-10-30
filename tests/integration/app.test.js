import request from "supertest";
import { createHmac } from "node:crypto";
import app from "../../app.js";

describe("SaludVital application", () => {
    test("Meta webhook verification requires the configured challenge token", async () => {
        const previousToken = process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
        process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = "webhook-test-token";
        try {
            const accepted = await request(app).get(
                "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=webhook-test-token&hub.challenge=challenge-123",
            );
            const rejected = await request(app).get(
                "/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-123",
            );
            expect(accepted.status).toBe(200);
            expect(accepted.text).toBe("challenge-123");
            expect(rejected.status).toBe(403);
        } finally {
            if (previousToken === undefined) delete process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN;
            else process.env.META_WHATSAPP_WEBHOOK_VERIFY_TOKEN = previousToken;
        }
    });

    test("Meta webhook POST rejects invalid signatures and accepts a valid signed payload", async () => {
        const previousSecret = process.env.META_WHATSAPP_APP_SECRET;
        process.env.META_WHATSAPP_APP_SECRET = "webhook-app-secret";
        const payload = { object: "whatsapp_business_account", entry: [] };
        const rawBody = JSON.stringify(payload);
        const signature = `sha256=${createHmac("sha256", "webhook-app-secret")
            .update(rawBody)
            .digest("hex")}`;
        try {
            const rejected = await request(app).post("/api/whatsapp/webhook").send(payload);
            const accepted = await request(app)
                .post("/api/whatsapp/webhook")
                .set("x-hub-signature-256", signature)
                .send(payload);
            expect(rejected.status).toBe(401);
            expect(accepted.status).toBe(200);
        } finally {
            if (previousSecret === undefined) delete process.env.META_WHATSAPP_APP_SECRET;
            else process.env.META_WHATSAPP_APP_SECRET = previousSecret;
        }
    });
    test("GET / redirects to the login page", async () => {
        const response = await request(app).get("/");

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("GET /login renders the login page", async () => {
        const response = await request(app).get("/login");

        expect(response.status).toBe(200);
        expect(response.text).toContain("SaludVital");
    });

    test("GET /health returns 404 when no health route is configured", async () => {
        const response = await request(app).get("/health");

        expect(response.status).toBe(404);
    });

    test("unknown routes return 404", async () => {
        const response = await request(app).get("/route-that-does-not-exist");

        expect(response.status).toBe(404);
    });

    test("doctor detail pages require an authenticated administrator", async () => {
        const response = await request(app).get("/admin/doctors/1").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor profile page requires an authenticated doctor", async () => {
        const response = await request(app).get("/doctor/profile").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor profile updates require an authenticated doctor", async () => {
        const response = await request(app)
            .put("/api/doctor/profile")
            .send({
                phone: "+573112223344",
                alternatePhone: "",
                address: "",
                department: "",
                city: "",
            })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor profile photo uploads require an authenticated doctor", async () => {
        const response = await request(app)
            .post("/api/doctor/profile/photo")
            .send({ photo: "data:image/png;base64,aW1hZ2U=" })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor detail API requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/doctors/1").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("specialty management page requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/specialties").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("WhatsApp overview requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/whatsapp").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("WhatsApp overview API requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/whatsapp").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("WhatsApp appointment request filters require an authenticated administrator", async () => {
        const response = await request(app)
            .get("/api/admin/whatsapp?tab=requests&status=Pending")
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("WhatsApp delivery monitoring requires an authenticated administrator", async () => {
        const response = await request(app)
            .get("/api/admin/whatsapp?tab=deliveries&status=Failed")
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("WhatsApp conversation history requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/whatsapp/conversations/1").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("chatbot flow retrieval requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/whatsapp?tab=flows").redirects(0);
        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("chatbot flow details require an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/whatsapp/flows/1").redirects(0);
        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("chatbot flow drafts can only be created by authenticated administrators", async () => {
        const response = await request(app)
            .post("/api/admin/whatsapp/flows")
            .send({ name: "Draft", description: "", definition: {} })
            .redirects(0);
        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("chatbot flow drafts can only be edited by authenticated administrators", async () => {
        const response = await request(app)
            .patch("/api/admin/whatsapp/flows/1")
            .send({ name: "Draft", description: "", definition: {} })
            .redirects(0);
        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("specialty directory API requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/specialties").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("specialty creation page requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/specialties/new").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("specialty creation endpoint requires an authenticated administrator", async () => {
        const response = await request(app)
            .post("/api/admin/specialties")
            .send({ name: "Pediatría" })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("specialty edit page requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/specialties/1/edit").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("specialty update endpoint requires an authenticated administrator", async () => {
        const response = await request(app)
            .patch("/api/admin/specialties/1")
            .send({ name: "Medicina General", description: "Atención primaria." })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("specialty status endpoint requires an authenticated administrator", async () => {
        const response = await request(app)
            .patch("/api/admin/specialties/1/status")
            .send({ isActive: false })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor schedule page requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/doctor-schedules").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor schedule directory API requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/doctor-schedules").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("weekly doctor schedule endpoint requires an authenticated administrator", async () => {
        const response = await request(app)
            .get("/api/admin/doctor-schedules/7/week?weekStart=2026-10-26")
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor schedule configuration endpoint requires an authenticated administrator", async () => {
        const response = await request(app)
            .post("/api/admin/doctor-schedules")
            .send({ doctorId: 1, blocks: [] })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor schedule update endpoint requires an authenticated administrator", async () => {
        const response = await request(app)
            .patch("/api/admin/doctor-schedules/1")
            .send({ blocks: [] })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("administrator appointments page requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/appointments").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("administrator appointments API requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/appointments").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("appointment CSV export requires an authenticated administrator", async () => {
        const response = await request(app)
            .get("/api/admin/appointments/export?status=Confirmed")
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("appointment PDF report requires an authenticated administrator", async () => {
        const response = await request(app)
            .get("/admin/appointments/export/pdf?status=Confirmed")
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("the appointment report print script is served under the site's script policy", async () => {
        const response = await request(app).get("/js/admin-appointment-report.js");

        expect(response.status).toBe(200);
        expect(response.headers["content-security-policy"]).toContain("script-src 'self'");
        expect(response.text).toContain('printButton?.addEventListener("click", printReport)');
    });

    test("appointment status changes require an authenticated administrator", async () => {
        const response = await request(app)
            .patch("/api/admin/appointments/1/status")
            .send({ reason: "test" })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("appointment details page requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/appointments/1").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("appointment edit page requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/appointments/1/edit").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test.each([
        ["GET", "/api/admin/appointment-edit/specialties"],
        ["GET", "/api/admin/appointment-edit/doctors?specialtyId=1"],
        ["PATCH", "/api/admin/appointments/1/reschedule"],
    ])("%s %s requires an authenticated administrator", async (method, url) => {
        const response = await request(app)[method.toLowerCase()](url).send({}).redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("appointment creation page requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/appointments/new").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test.each([
        ["GET", "/api/admin/appointment-booking/options"],
        ["GET", "/api/admin/appointment-booking/doctors?specialtyId=1"],
        [
            "GET",
            "/api/admin/appointment-booking/availability?patientId=1&specialtyId=1&doctorId=1&date=2026-11-04",
        ],
        ["POST", "/api/admin/appointments"],
    ])("%s %s requires an authenticated administrator", async (method, url) => {
        const response = await request(app)[method.toLowerCase()](url).send({}).redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("appointment details API requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/appointments/1").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor status impact requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/doctors/1/status-impact").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor status changes require an authenticated administrator", async () => {
        const response = await request(app)
            .patch("/api/admin/doctors/1/status")
            .send({ isActive: false })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor profile updates require an authenticated administrator", async () => {
        const response = await request(app)
            .patch("/api/admin/users/7/profile")
            .send({ email: "doctor@example.com", doctor: {} })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("doctor schedule interval deletion requires an authenticated administrator", async () => {
        const response = await request(app)
            .delete("/api/admin/doctor-schedules/1")
            .send({ confirmImpact: false })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("schedule exception management endpoints require an authenticated administrator", async () => {
        const requests = [
            request(app).get("/api/admin/doctor-schedule-exceptions"),
            request(app).post("/api/admin/doctor-schedule-exceptions").send({ doctorId: 1 }),
            request(app)
                .patch("/api/admin/doctor-schedule-exceptions/1")
                .send({ reason: "Permiso" }),
            request(app)
                .patch("/api/admin/doctor-schedule-exceptions/1/status")
                .send({ isActive: false }),
        ];

        for (const pendingRequest of requests) {
            const response = await pendingRequest.redirects(0);
            expect(response.status).toBe(303);
            expect(response.headers.location).toBe("/login");
        }
    });

    test("GET /register renders the patient registration form", async () => {
        const response = await request(app).get("/register");

        expect(response.status).toBe(200);
        expect(response.text).toContain("Crear cuenta de paciente");
        expect(response.text).toContain('action="/register"');
        expect(response.text).toContain('name="health_data_consent"');
    });

    test("POST /register without health data consent rejects registration", async () => {
        const response = await request(app).post("/register").type("form").send({
            first_name: "Test",
            last_name: "Patient",
            email: "integration-test@example.com",
        });

        expect(response.status).toBe(400);
        expect(response.text).toContain("autorizar el tratamiento");
    });

    // Verify that the password recovery form is available without authentication.
    test("GET /forgot-password renders the password recovery form", async () => {
        const response = await request(app).get("/forgot-password");

        expect(response.status).toBe(200);
        expect(response.text).toContain('action="/forgot-password"');
        expect(response.text).toContain("Recuperar contraseña");
    });

    // Verify that the password reset form is available with a token parameter.
    test("GET /reset-password renders the password reset form", async () => {
        const response = await request(app)
            .get("/reset-password")
            .query({ token: "a".repeat(64) });

        expect(response.status).toBe(200);
        expect(response.text).toContain('action="/reset-password"');
        expect(response.text).toContain("Restablecer contraseña");
        expect(response.headers["referrer-policy"]).toBe("no-referrer");
        expect(response.headers["cache-control"]).toContain("no-store");
    });

    test("audit page requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/audit").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("audit log endpoint requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/audit-logs").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("audit event details require an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/audit-logs/21").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("administrator reports page requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/reports").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("administrator reports data requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/reports").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("administrator notification dashboard requires an authenticated administrator", async () => {
        const response = await request(app).get("/admin/notifications").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("administrator notification data requires an authenticated administrator", async () => {
        const response = await request(app).get("/api/admin/notifications").redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("administrator profile page requires authentication", async () => {
        const response = await request(app).get("/admin/profile").redirects(0);
        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });

    test("administrator notification preference updates require authentication", async () => {
        const response = await request(app)
            .patch("/api/admin/profile/preferences")
            .send({ showNotificationFeed: false })
            .redirects(0);

        expect(response.status).toBe(303);
        expect(response.headers.location).toBe("/login");
    });
});
