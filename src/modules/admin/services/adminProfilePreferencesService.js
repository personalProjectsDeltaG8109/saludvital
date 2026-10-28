import database from "../../../../config/database.js";
import AuditLog from "../../../models/AuditLog.js";
import { Rol, User } from "../../../models/associations.js";

function serviceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function parseUserId(value) {
    const userId = Number(value);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw serviceError("La cuenta del administrador no es válida.", 400);
    }
    return userId;
}

function parsePreferences(payload) {
    if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        Object.keys(payload).length !== 1 ||
        typeof payload.showNotificationFeed !== "boolean"
    ) {
        throw serviceError("La configuración de notificaciones no es válida.", 400);
    }
    return payload.showNotificationFeed;
}

/** Save the authenticated administrator's preference for the existing dashboard feed. */
export async function updateAdminProfilePreferences(rawUserId, payload) {
    const userId = parseUserId(rawUserId);
    const showNotificationFeed = parsePreferences(payload);

    const result = await database.transaction(async (transaction) => {
        const user = await User.findByPk(userId, {
            attributes: ["id", "email", "is_active", "admin_notifications_enabled"],
            include: [{ model: Rol, as: "rol", attributes: ["name"], required: true }],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!user || !user.is_active || user.rol?.name !== "Administrator") {
            throw serviceError("No encontramos tu perfil de administrador.", 404);
        }

        const currentValue = Boolean(user.admin_notifications_enabled);
        if (currentValue === showNotificationFeed) {
            return { changed: false, showNotificationFeed };
        }

        await user.update({ admin_notifications_enabled: showNotificationFeed }, { transaction });
        await AuditLog.create(
            {
                actor_user_id: userId,
                actor_snapshot: `Administrator ${user.email}`.slice(0, 100),
                action: "AdminNotificationPreferencesUpdated",
                target_type: "User",
                target_id: String(userId),
                target_description: "Administrator notification preferences",
                changes: {
                    updatedFields: ["admin_notifications_enabled"],
                    showNotificationFeed,
                },
                reason: "Administrator updated own notification preferences.",
                result: "Success",
                occurred_at: new Date(),
            },
            { transaction },
        );

        return { changed: true, showNotificationFeed };
    });

    return {
        showNotificationFeed: result.showNotificationFeed,
        message: result.changed
            ? "Tus preferencias de notificaciones se actualizaron correctamente."
            : "No se detectaron cambios en tus preferencias.",
    };
}
