import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Mock authentication and registration dependencies before importing the controller.
jest.unstable_mockModule("jsonwebtoken", () => ({
    default: {
        sign: jest.fn(),
    },
}));

jest.unstable_mockModule("../../../config/environment.js", () => ({
    default: {
        jwt: {
            secret: "test-secret",
            expiresIn: "15m",
        },
        nodeEnv: "test",
    },
}));

jest.unstable_mockModule("../../../src/modules/auth/services/authService.js", () => ({
    authenticateUser: jest.fn(),
    AuthenticationError: class AuthenticationError extends Error {},
    EmailVerificationRequiredError: class EmailVerificationRequiredError extends Error {},
}));

jest.unstable_mockModule("../../../src/modules/auth/services/sessionActivity.js", () => ({
    startSession: jest.fn(),
    endSession: jest.fn(),
}));

jest.unstable_mockModule("../../../src/modules/auth/services/emailVerificationService.js", () => ({
    verifyEmail: jest.fn(),
}));

jest.unstable_mockModule("../../../src/modules/auth/services/registrationService.js", () => ({
    registerPatient: jest.fn(),
    RegistrationError: class RegistrationError extends Error {
        constructor(message, statusCode = 400) {
            super(message);
            this.name = "RegistrationError";
            this.statusCode = statusCode;
        }
    },
}));

// Import the mocked registration service and controller after registering mocks.
const { registerPatient, RegistrationError } =
    await import("../../../src/modules/auth/services/registrationService.js");

const { register } = await import("../../../src/modules/auth/controllers/authController.js");

// Build mock Express request and response objects for controller tests.
describe("Patient registration controller", () => {
    const validBody = {
        health_data_consent: "accepted",
        first_name: "Juan",
        last_name: "Montoya",
        email: "patient@example.com",
        medical_conditions: "None",
    };

    let req;
    let res;
    let next;

    beforeEach(() => {
        jest.clearAllMocks();

        req = { body: { ...validBody } };

        res = {
            status: jest.fn().mockReturnThis(),
            render: jest.fn().mockReturnThis(),
        };

        next = jest.fn();

        registerPatient.mockResolvedValue({
            id: 10,
            email: "patient@example.com",
            patientId: 20,
        });
    });

    // Require explicit consent before processing a registration.
    test.each([undefined, "", "rejected", ["accepted"]])(
        "rejects registration without valid consent: %s",
        async (consent) => {
            if (consent === undefined) {
                delete req.body.health_data_consent;
            } else {
                req.body.health_data_consent = consent;
            }

            await register(req, res, next);

            expect(res.status).toHaveBeenCalledWith(400);
            expect(res.render).toHaveBeenCalledWith(
                "auth/register",
                expect.objectContaining({
                    error: expect.stringContaining("autorizar el tratamiento"),
                    success: null,
                }),
            );

            expect(registerPatient).not.toHaveBeenCalled();
            expect(next).not.toHaveBeenCalled();
        },
    );

    // Create the account and show the email verification instructions.
    test("registers a patient and displays a verification message", async () => {
        await register(req, res, next);

        expect(registerPatient).toHaveBeenCalledWith(
            expect.objectContaining({
                first_name: "Juan",
                last_name: "Montoya",
                email: "patient@example.com",
                existing_conditions: "None",
            }),
        );

        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.render).toHaveBeenCalledWith(
            "auth/register",
            expect.objectContaining({
                pageTitle: "Registro completado | SaludVital",
                error: null,
                success: expect.stringContaining("patient@example.com"),
            }),
        );

        expect(next).not.toHaveBeenCalled();
    });

    // Render expected registration validation errors safely.
    test("renders a validation error from the registration service", async () => {
        registerPatient.mockRejectedValue(
            new RegistrationError("Ingresa una dirección de correo electrónico válida.", 400),
        );

        await register(req, res, next);

        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.render).toHaveBeenCalledWith(
            "auth/register",
            expect.objectContaining({
                error: "Ingresa una dirección de correo electrónico válida.",
                success: null,
            }),
        );

        expect(next).not.toHaveBeenCalled();
    });

    // Hide internal error details when registration reports a server failure.
    test("does not expose internal details for registration server errors", async () => {
        registerPatient.mockRejectedValue(
            new RegistrationError("Database connection password leaked", 500),
        );

        await register(req, res, next);

        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.render).toHaveBeenCalledWith(
            "auth/register",
            expect.objectContaining({
                error: "No fue posible completar el registro. Inténtalo más tarde.",
                success: null,
            }),
        );

        expect(res.render.mock.calls[0][1].error).not.toContain("password leaked");
        expect(next).not.toHaveBeenCalled();
    });

    // Forward unexpected failures to centralized Express error handling.
    test("forwards unexpected errors to the error middleware", async () => {
        const unexpectedError = new Error("Unexpected database failure");
        registerPatient.mockRejectedValue(unexpectedError);

        await register(req, res, next);

        expect(next).toHaveBeenCalledWith(unexpectedError);
        expect(res.render).not.toHaveBeenCalled();
    });
});
