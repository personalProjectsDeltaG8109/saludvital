import { beforeEach, describe, expect, jest, test } from "@jest/globals";
import {
    down,
    up,
} from "../../database/migrations/20261102120000-create-doctor-appointment-notification-reads.js";

describe("doctor appointment notification read migration", () => {
    let queryInterface;

    beforeEach(() => {
        queryInterface = {
            createTable: jest.fn().mockResolvedValue(undefined),
            addConstraint: jest.fn().mockResolvedValue(undefined),
            addIndex: jest.fn().mockResolvedValue(undefined),
            dropTable: jest.fn().mockResolvedValue(undefined),
        };
    });

    test("creates per-doctor read state linked to appointments and history", async () => {
        await up(queryInterface, { INTEGER: "INTEGER", DATE: "DATETIME" });

        expect(queryInterface.createTable).toHaveBeenCalledWith(
            "doctor_appointment_notification_reads",
            expect.objectContaining({
                doctor_id: expect.objectContaining({
                    allowNull: false,
                    references: { model: "doctors", key: "id" },
                }),
                appointment_history_id: expect.objectContaining({
                    allowNull: false,
                    references: { model: "appointment_history", key: "id" },
                }),
            }),
        );
        expect(queryInterface.addConstraint).toHaveBeenCalledWith(
            "doctor_appointment_notification_reads",
            expect.objectContaining({ fields: ["doctor_id", "appointment_history_id"] }),
        );
    });

    test("drops only the added read-state table when reverted", async () => {
        await down(queryInterface);
        expect(queryInterface.dropTable).toHaveBeenCalledWith(
            "doctor_appointment_notification_reads",
        );
    });
});
