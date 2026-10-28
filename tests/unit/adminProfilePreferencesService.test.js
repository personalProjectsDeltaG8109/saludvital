import { beforeEach, describe, expect, jest, test } from "@jest/globals";

const transaction = { LOCK: { UPDATE: "UPDATE" } };

jest.unstable_mockModule("../../config/database.js", () => ({
    default: { transaction: jest.fn(async (callback) => callback(transaction)) },
}));
jest.unstable_mockModule("../../src/models/AuditLog.js", () => ({
    default: { create: jest.fn() },
}));
jest.unstable_mockModule("../../src/models/associations.js", () => ({
    Rol: {},
    User: { findByPk: jest.fn() },
}));

const database = (await import("../../config/database.js")).default;
const AuditLog = (await import("../../src/models/AuditLog.js")).default;
const { User } = await import("../../src/models/associations.js");
const { updateAdminProfilePreferences } =
    await import("../../src/modules/admin/services/adminProfilePreferencesService.js");

function createAdministrator(enabled = true) {
    const user = {
        id: 7,
        email: "admin@example.com",
        is_active: true,
        admin_notifications_enabled: enabled,
        rol: { name: "Administrator" },
        update: jest.fn(async (values) => Object.assign(user, values)),
    };
    return user;
}

describe("administrator notification preferences", () => {
    beforeEach(() => {
        jest.clearAllMocks();
        User.findByPk.mockResolvedValue(createAdministrator());
        AuditLog.create.mockResolvedValue({ id: 1 });
        database.transaction.mockImplementation(async (callback) => callback(transaction));
    });

    test("updates and audits the authenticated administrator's dashboard feed preference", async () => {
        const user = createAdministrator();
        User.findByPk.mockResolvedValue(user);

        await expect(
            updateAdminProfilePreferences("7", { showNotificationFeed: false }),
        ).resolves.toEqual({
            showNotificationFeed: false,
            message: "Tus preferencias de notificaciones se actualizaron correctamente.",
        });

        expect(user.update).toHaveBeenCalledWith(
            { admin_notifications_enabled: false },
            { transaction },
        );
        expect(AuditLog.create).toHaveBeenCalledWith(
            expect.objectContaining({
                actor_user_id: 7,
                action: "AdminNotificationPreferencesUpdated",
                target_type: "User",
                target_id: "7",
                changes: {
                    updatedFields: ["admin_notifications_enabled"],
                    showNotificationFeed: false,
                },
            }),
            { transaction },
        );
    });

    test("rejects invalid IDs, unsupported fields, and non-boolean values", async () => {
        await expect(
            updateAdminProfilePreferences("bad", { showNotificationFeed: true }),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            updateAdminProfilePreferences(7, { showNotificationFeed: "false" }),
        ).rejects.toMatchObject({ statusCode: 400 });
        await expect(
            updateAdminProfilePreferences(7, { showNotificationFeed: true, theme: "dark" }),
        ).rejects.toMatchObject({ statusCode: 400 });
        expect(User.findByPk).not.toHaveBeenCalled();
    });

    test("rejects inactive or non-administrator accounts", async () => {
        User.findByPk.mockResolvedValue({
            ...createAdministrator(),
            rol: { name: "Doctor" },
        });

        await expect(
            updateAdminProfilePreferences(7, { showNotificationFeed: false }),
        ).rejects.toMatchObject({ statusCode: 404 });
        expect(AuditLog.create).not.toHaveBeenCalled();
    });

    test("does not write an audit record when the setting is unchanged", async () => {
        await expect(
            updateAdminProfilePreferences(7, { showNotificationFeed: true }),
        ).resolves.toMatchObject({
            showNotificationFeed: true,
            message: "No se detectaron cambios en tus preferencias.",
        });
        expect(AuditLog.create).not.toHaveBeenCalled();
    });

    test("propagates audit persistence failures so the preference update rolls back", async () => {
        const user = createAdministrator();
        User.findByPk.mockResolvedValue(user);
        AuditLog.create.mockRejectedValue(new Error("audit unavailable"));

        await expect(
            updateAdminProfilePreferences(7, { showNotificationFeed: false }),
        ).rejects.toThrow("audit unavailable");
        expect(database.transaction).toHaveBeenCalled();
    });
});
