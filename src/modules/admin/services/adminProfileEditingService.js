import database from "../../../../config/database.js";
import AuditLog from "../../../models/AuditLog.js";
import { Doctor, Patient, Rol, User } from "../../../models/associations.js";
import { normalizeProfileEmail } from "./adminProfileFieldValidation.js";
import {
    normalizeProfilePhone,
    normalizeProfileText,
} from "../../../shared/services/profileFieldValidationService.js";
import { toAdminProfile } from "./adminProfileService.js";
import {
    isEmailUnavailable,
    isEmailUniqueConstraintError,
    requestEmailChange,
} from "../../auth/services/emailChangeService.js";

function serviceError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function normalizeProfileUpdate(payload) {
    const editableFields = new Set(["displayName", "email", "phone"]);
    if (
        !payload ||
        typeof payload !== "object" ||
        Array.isArray(payload) ||
        !Object.keys(payload).length ||
        Object.keys(payload).some((field) => !editableFields.has(field))
    ) {
        throw serviceError("Los datos del perfil no son válidos.", 400);
    }

    return {
        display_name: normalizeProfileText(payload.displayName, "El nombre completo", 120, true),
        email: normalizeProfileEmail(payload.email),
        phone: normalizeProfilePhone(payload.phone, "el teléfono"),
    };
}

/** Update only the authenticated administrator's supported personal information. */
export async function updateAdminProfilePersonalInformation(rawUserId, payload) {
    const userId = Number(rawUserId);
    if (!Number.isSafeInteger(userId) || userId < 1) {
        throw serviceError("La cuenta del administrador no es válida.", 400);
    }
    const nextValues = normalizeProfileUpdate(payload);

    let result;
    try {
        result = await database.transaction(async (transaction) => {
            const user = await User.findByPk(userId, {
                attributes: [
                    "id",
                    "role_id",
                    "display_name",
                    "email",
                    "email_verified_at",
                    "pending_email",
                    "phone",
                    "is_active",
                ],
                include: [
                    { model: Rol, as: "rol", attributes: ["name"], required: true },
                    { model: Doctor, as: "doctor", attributes: ["display_name"], required: false },
                    {
                        model: Patient,
                        as: "patient",
                        attributes: ["first_name", "last_name"],
                        required: false,
                    },
                ],
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (!user || !user.is_active || user.rol?.name !== "Administrator") {
                throw serviceError("No encontramos tu perfil de administrador.", 404);
            }

            const currentEmail = user.email.toLowerCase();
            const patientName = [user.patient?.first_name, user.patient?.last_name]
                .filter(Boolean)
                .join(" ")
                .trim();
            const currentDisplayName =
                user.display_name?.trim() ||
                user.doctor?.display_name?.trim() ||
                patientName ||
                null;
            const emailChanged =
                nextValues.email !== currentEmail && nextValues.email !== user.pending_email;
            const changedFields = [];

            if (nextValues.display_name !== currentDisplayName) {
                changedFields.push("display_name");
            }
            if (emailChanged) changedFields.push("email");
            if (nextValues.phone !== (user.phone || null)) changedFields.push("phone");

            if (!changedFields.length) {
                return {
                    changed: false,
                    emailVerificationRequired: false,
                    profile: toAdminProfile(user),
                };
            }

            if (emailChanged) {
                if (await isEmailUnavailable(nextValues.email, user.id, transaction)) {
                    throw serviceError("Ese correo electrónico ya está registrado.", 409);
                }
            }

            const updates = {};
            if (changedFields.includes("display_name")) {
                updates.display_name = nextValues.display_name;
            }
            if (changedFields.includes("phone")) updates.phone = nextValues.phone;
            if (Object.keys(updates).length) await user.update(updates, { transaction });
            if (emailChanged) await requestEmailChange(user, nextValues.email, transaction);

            await AuditLog.create(
                {
                    actor_user_id: userId,
                    actor_snapshot: `Administrator ${currentEmail}`.slice(0, 100),
                    action: "AdminUserProfileUpdated",
                    target_type: "User",
                    target_id: String(user.id),
                    target_description: "Administrator profile",
                    changes: {
                        updatedFields: changedFields,
                        emailVerificationRequired: emailChanged,
                    },
                    reason: "Administrator updated own profile information.",
                    result: "Success",
                    occurred_at: new Date(),
                },
                { transaction },
            );

            return {
                changed: true,
                emailVerificationRequired: emailChanged,
                profile: toAdminProfile(user),
            };
        });
    } catch (error) {
        if (isEmailUniqueConstraintError(error)) {
            throw serviceError("Ese correo electrónico ya está registrado.", 409);
        }
        throw error;
    }

    return {
        message: result.emailVerificationRequired
            ? "Tus datos se actualizaron. Tu correo actual sigue activo; verifica el nuevo correo para confirmar el cambio."
            : result.changed
              ? "Tus datos personales se actualizaron correctamente."
              : "No se detectaron cambios en tu perfil.",
        emailVerificationRequired: result.emailVerificationRequired,
        profile: result.profile,
    };
}
