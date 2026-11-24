import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    AccountInvitation,
    AuditLog,
    Patient,
    PatientConsent,
    Rol,
    User,
} from "../../../models/associations.js";
import {
    hasPatientRegistrationConsent,
    PATIENT_REGISTRATION_CONSENT,
} from "./patientRegistrationConsent.js";
import { isValidPassword } from "./passwordPolicy.js";
import { RegistrationError, validatePatientRegistration } from "./registrationService.js";

function hashInvitationToken(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) return null;
    return createHash("sha256").update(token).digest("hex");
}

function normalizeAdminName(value) {
    if (typeof value !== "string") return "";
    const name = value.trim().replace(/\s+/gu, " ");
    return name.length <= 120 && /^\p{L}[\p{L}\p{M} .'-]*$/u.test(name) ? name : "";
}

function invalidInvitationError() {
    const error = new RegistrationError("El enlace no es válido, ya se usó o venció.", 400);
    error.name = "AccountInvitationError";
    return error;
}

function invitationInclude() {
    return [
        {
            model: User,
            as: "user",
            include: [{ model: Rol, as: "rol", attributes: ["id", "name"] }],
        },
    ];
}

/** Return only safe details for a live account invitation. */
export async function getAccountInvitationByToken(token) {
    const tokenHash = hashInvitationToken(token);
    if (!tokenHash) return null;

    const invitation = await AccountInvitation.findOne({
        where: {
            token_hash: tokenHash,
            expires_at: { [Op.gt]: new Date() },
            accepted_at: null,
            cancelled_at: null,
        },
        include: invitationInclude(),
    });
    if (!invitation?.user || invitation.user.email_verified_at) return null;

    const role = invitation.user.rol?.name;
    if (!["Patient", "Administrator"].includes(role) || invitation.user.is_active) return null;

    return {
        id: invitation.id,
        token,
        email: invitation.user.email,
        displayName: invitation.user.display_name || "",
        role,
        accountType: role === "Administrator" ? "administrator" : "patient",
    };
}

/** Complete an invited patient or administrator account after identity confirmation. */
export async function completeAccountInvitation(token, data) {
    const tokenHash = hashInvitationToken(token);
    const invitationData = await getAccountInvitationByToken(token);
    if (!tokenHash || !invitationData) throw invalidInvitationError();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new RegistrationError("Los datos de registro no son válidos.");
    }

    let patientData = null;
    let adminName = "";
    if (invitationData.role === "Patient") {
        if (!hasPatientRegistrationConsent(data.health_data_consent)) {
            throw new RegistrationError(
                "Debes autorizar el tratamiento de datos personales y de salud para activar la cuenta.",
            );
        }
        patientData = { ...data, email: invitationData.email };
        validatePatientRegistration(patientData);
    } else {
        adminName = normalizeAdminName(data.display_name);
        if (!adminName) throw new RegistrationError("Escribe un nombre válido para la cuenta.");
        if (!isValidPassword(data.password)) {
            throw new RegistrationError(
                "La contraseña debe tener entre 10 y 50 caracteres e incluir mayúscula, minúsculas, número y carácter especial.",
            );
        }
        if (data.password !== data.password_confirmation) {
            throw new RegistrationError("Las contraseñas no coinciden.");
        }
    }

    if (!isValidPassword(data.password)) {
        throw new RegistrationError(
            "La contraseña debe tener entre 10 y 50 caracteres e incluir mayúscula, minúsculas, número y carácter especial.",
        );
    }
    if (data.password !== data.password_confirmation) {
        throw new RegistrationError("Las contraseñas no coinciden.");
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    try {
        return await database.transaction(async (transaction) => {
            const invitation = await AccountInvitation.findOne({
                where: {
                    token_hash: tokenHash,
                    expires_at: { [Op.gt]: new Date() },
                    accepted_at: null,
                    cancelled_at: null,
                },
                include: invitationInclude(),
                transaction,
                lock: transaction.LOCK.UPDATE,
            });
            const user = invitation?.user;
            if (
                !invitation ||
                !user ||
                user.email_verified_at ||
                user.is_active ||
                user.rol?.name !== invitationData.role
            ) {
                throw invalidInvitationError();
            }

            let fullName = adminName;
            const updateValues = {
                password_hash: passwordHash,
                display_name: adminName || null,
                is_active: true,
                email_verified_at: new Date(),
                email_verification_token_hash: null,
                email_verification_expires_at: null,
                email_verification_requested_at: null,
            };

            if (invitationData.role === "Patient") {
                const normalized = validatePatientRegistration(patientData);
                const documentType = patientData.document_type;
                const documentNumber = patientData.document_number.trim();
                const existingPatient = await Patient.findOne({
                    where: { document_type: documentType, document_number: documentNumber },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                if (existingPatient) {
                    throw new RegistrationError(
                        "Ya existe un paciente registrado con este documento de identidad.",
                        409,
                    );
                }

                fullName = `${normalized.firstName} ${normalized.lastName}`;
                updateValues.display_name = fullName;
                updateValues.phone = patientData.phone.trim();
                await PatientConsent.create(
                    {
                        user_id: user.id,
                        consent_scope: PATIENT_REGISTRATION_CONSENT.scope,
                        notice_version: PATIENT_REGISTRATION_CONSENT.noticeVersion,
                        accepted_at: new Date(),
                    },
                    { transaction },
                );
                await Patient.create(
                    {
                        user_id: user.id,
                        first_name: normalized.firstName,
                        last_name: normalized.lastName,
                        phone: patientData.phone.trim(),
                        date_of_birth: patientData.date_of_birth,
                        document_type: documentType,
                        document_number: documentNumber,
                        department: normalized.location.department,
                        municipality: normalized.location.municipality,
                        blood_type: patientData.blood_type || null,
                        allergies: patientData.allergies?.trim() || null,
                        existing_conditions: patientData.existing_conditions?.trim() || null,
                        address: patientData.address?.trim() || null,
                    },
                    { transaction },
                );
            }

            await user.update(updateValues, { transaction });
            await invitation.update(
                { accepted_at: new Date(), token_hash: null, expires_at: null },
                { transaction },
            );
            await AuditLog.create(
                {
                    actor_user_id: user.id,
                    actor_snapshot: `${invitationData.role} ${user.email}`.slice(0, 100),
                    action: "AccountInvitationAccepted",
                    target_type: "User",
                    target_id: String(user.id),
                    target_description: `${fullName} (${user.email})`.slice(0, 255),
                    changes: { role: invitationData.role, emailVerified: true },
                    reason: "Account owner accepted an invitation and activated the account.",
                    result: "Success",
                    occurred_at: new Date(),
                },
                { transaction },
            );

            return { role: invitationData.role, email: user.email, displayName: fullName };
        });
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            throw new RegistrationError(
                "Ya existe un paciente registrado con este documento de identidad.",
                409,
            );
        }
        throw error;
    }
}
