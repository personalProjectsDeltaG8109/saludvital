import { jest, describe, test, expect, beforeEach } from "@jest/globals";
import {
    up,
    down,
} from "../../database/migrations/20261015020858-fix-schedule-exception-actor-delete-policy.js";

// Verify that the migration changes the actor foreign key safely.
describe("Schedule exception actor deletion policy migration", () => {
    let queryInterface;

    beforeEach(() => {
        // Create fresh mocks for each test to avoid sharing call history.
        queryInterface = {
            removeConstraint: jest.fn().mockResolvedValue(undefined),
            addConstraint: jest.fn().mockResolvedValue(undefined),
        };
    });

    test("up removes the old foreign key and recreates it with SET NULL", async () => {
        await up(queryInterface);

        // Remove the existing constraint before adding the replacement.
        expect(queryInterface.removeConstraint).toHaveBeenCalledWith(
            "doctor_schedule_exceptions",
            "doctor_schedule_exceptions_ibfk_2",
        );

        expect(queryInterface.addConstraint).toHaveBeenCalledWith(
            "doctor_schedule_exceptions",
            expect.objectContaining({
                fields: ["created_by"],
                type: "foreign key",
                name: "doctor_schedule_exceptions_created_by_fk",
                references: {
                    table: "users",
                    field: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "SET NULL",
            }),
        );

        // Ensure the old constraint is removed before the new one is created.
        expect(queryInterface.removeConstraint.mock.invocationCallOrder[0]).toBeLessThan(
            queryInterface.addConstraint.mock.invocationCallOrder[0],
        );
    });

    test("down restores the original RESTRICT deletion policy", async () => {
        await down(queryInterface);

        expect(queryInterface.removeConstraint).toHaveBeenCalledWith(
            "doctor_schedule_exceptions",
            "doctor_schedule_exceptions_created_by_fk",
        );

        expect(queryInterface.addConstraint).toHaveBeenCalledWith(
            "doctor_schedule_exceptions",
            expect.objectContaining({
                fields: ["created_by"],
                type: "foreign key",
                name: "doctor_schedule_exceptions_ibfk_2",
                references: {
                    table: "users",
                    field: "id",
                },
                onUpdate: "CASCADE",
                onDelete: "RESTRICT",
            }),
        );
    });
});
