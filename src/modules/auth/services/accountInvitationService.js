import bcrypt from "bcrypt";
import { createHash } from "node:crypto";
import { Op } from "sequelize";
import database from "../../../../config/database.js";
import {
    AccountInvitation,
    AuditLog,
    Doctor,
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

function normalizeDoctorProfile(data, invitation) {
    const firstName =
        typeof data.first_name === "string" ? data.first_name.trim().replace(/\s+/gu, " ") : "";
    const lastName =
        typeof data.last_name === "string" ? data.last_name.trim().replace(/\s+/gu, " ") : "";
    const phone = typeof data.phone === "string" ? data.phone.replace(/\D/gu, "") : "";
    const documentNumber =
        typeof data.document_number === "string" ? data.document_number.replace(/\s/gu, "") : "";
    const documentType = typeof data.document_type === "string" ? data.document_type : "";
    const professionalRegistrationNumber =
        typeof data.professional_registration_number === "string"
            ? data.professional_registration_number.trim()
            : "";

    if (!/^\p{L}[\p{L}\p{M} .'-]{0,79}$/u.test(firstName)) {
        throw new RegistrationError("Ingresa nombres válidos de hasta 80 caracteres.");
    }
    if (!/^\p{L}[\p{L}\p{M} .'-]{0,79}$/u.test(lastName)) {
        throw new RegistrationError("Ingresa apellidos válidos de hasta 80 caracteres.");
    }
    if (`${firstName} ${lastName}`.length > 120) {
        throw new RegistrationError(
            "La suma de nombres y apellidos no puede superar 120 caracteres.",
        );
    }
    if (!/^[0-9]{7,15}$/.test(phone)) {
        throw new RegistrationError("Ingresa un número de celular válido de 7 a 15 dígitos.");
    }
    if (!["CC", "CE"].includes(documentType)) {
        throw new RegistrationError("Selecciona un tipo de documento válido.");
    }
    if (!/^[0-9]{1,15}$/.test(documentNumber)) {
        throw new RegistrationError("Ingresa un número de documento válido.");
    }
    if (!/^[A-Za-z0-9./-]{3,40}$/.test(professionalRegistrationNumber)) {
        throw new RegistrationError("Ingresa una tarjeta profesional válida de 3 a 40 caracteres.");
    }

    return {
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`,
        phone,
        documentType,
        documentNumber,
        professionalRegistrationNumber,
        specialtyId: invitation.specialtyId,
    };
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
            include: [
                { model: Rol, as: "rol", attributes: ["id", "name"] },
                {
                    model: Doctor,
                    as: "doctor",
                    attributes: [
                        "id",
                        "specialty_id",
                        "first_name",
                        "last_name",
                        "document_type",
                        "document_number",
                        "professional_registration_number",
                        "profile_review_status",
                        "profile_review_note",
                    ],
                    include: [{ association: "specialty", attributes: ["name"] }],
                },
            ],
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
    if (!invitation?.user) return null;

    const role = invitation.user.rol?.name;
    if (!["Patient", "Administrator", "Doctor"].includes(role) || invitation.user.is_active) {
        return null;
    }

    const doctor = invitation.user.doctor;
    const isDoctorCorrection =
        role === "Doctor" && doctor?.profile_review_status === "changes_requested";
    if (invitation.user.email_verified_at && !isDoctorCorrection) return null;
    if (role === "Doctor" && !doctor) return null;

    return {
        id: invitation.id,
        token,
        email: invitation.user.email,
        displayName: invitation.user.display_name || "",
        role,
        accountType:
            role === "Administrator" ? "administrator" : role === "Doctor" ? "doctor" : "patient",
        specialtyId: doctor?.specialty_id || null,
        specialtyName: doctor?.specialty?.name || "",
        isCorrection: isDoctorCorrection,
        reviewNote: isDoctorCorrection ? doctor.profile_review_note : "",
        profile: doctor
            ? {
                  first_name: doctor.first_name || "",
                  last_name: doctor.last_name || "",
                  phone: invitation.user.phone || "",
                  document_type: doctor.document_type || "",
                  document_number: doctor.document_number || "",
                  professional_registration_number: doctor.professional_registration_number || "",
              }
            : null,
    };
}

/** Complete an invitation while keeping doctor accounts inactive until review. */
export async function completeAccountInvitation(token, data) {
    const tokenHash = hashInvitationToken(token);
    const invitationData = await getAccountInvitationByToken(token);
    if (!tokenHash || !invitationData) throw invalidInvitationError();
    if (!data || typeof data !== "object" || Array.isArray(data)) {
        throw new RegistrationError("Los datos de registro no son válidos.");
    }

    let patientData = null;
    let adminName = "";
    let doctorData = null;
    if (invitationData.role === "Patient") {
        if (!hasPatientRegistrationConsent(data.health_data_consent)) {
            throw new RegistrationError(
                "Debes autorizar el tratamiento de datos personales y de salud para activar la cuenta.",
            );
        }
        patientData = { ...data, email: invitationData.email };
        validatePatientRegistration(patientData);
    } else if (invitationData.role === "Administrator") {
        adminName = normalizeAdminName(data.display_name);
        if (!adminName) throw new RegistrationError("Escribe un nombre válido para la cuenta.");
    } else {
        doctorData = normalizeDoctorProfile(data, invitationData);
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
            const doctor = user?.doctor;
            const isDoctorCorrection =
                invitationData.role === "Doctor" &&
                user?.email_verified_at &&
                doctor?.profile_review_status === "changes_requested";
            if (
                !invitation ||
                !user ||
                (user.email_verified_at && !isDoctorCorrection) ||
                user.is_active ||
                user.rol?.name !== invitationData.role
            ) {
                throw invalidInvitationError();
            }

            let fullName = adminName;
            const updateValues = {
                password_hash: passwordHash,
                display_name: adminName || null,
                is_active: invitationData.role !== "Doctor",
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

            if (invitationData.role === "Doctor") {
                if (!doctor) throw invalidInvitationError();
                const matchingDoctor = await Doctor.findOne({
                    where: {
                        document_type: doctorData.documentType,
                        document_number: doctorData.documentNumber,
                    },
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });
                if (matchingDoctor && matchingDoctor.id !== doctor.id) {
                    throw new RegistrationError(
                        "Ya existe un médico registrado con ese documento.",
                        409,
                    );
                }

                fullName = doctorData.fullName;
                updateValues.display_name = fullName;
                updateValues.phone = doctorData.phone;
                updateValues.is_active = false;
                await doctor.update(
                    {
                        display_name: doctorData.fullName,
                        first_name: doctorData.firstName,
                        last_name: doctorData.lastName,
                        document_type: doctorData.documentType,
                        document_number: doctorData.documentNumber,
                        professional_registration_number: doctorData.professionalRegistrationNumber,
                        profile_review_status: "pending",
                        profile_review_note: null,
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
                    action:
                        invitationData.role === "Doctor"
                            ? "DoctorProfileSubmittedForReview"
                            : "AccountInvitationAccepted",
                    target_type: invitationData.role === "Doctor" ? "Doctor" : "User",
                    target_id: String(invitationData.role === "Doctor" ? doctor.id : user.id),
                    target_description: `${fullName} (${user.email})`.slice(0, 255),
                    changes:
                        invitationData.role === "Doctor"
                            ? { role: invitationData.role, profileReviewStatus: "pending" }
                            : { role: invitationData.role, emailVerified: true },
                    reason:
                        invitationData.role === "Doctor"
                            ? "Doctor submitted profile for administrator review."
                            : "Account owner accepted an invitation and activated the account.",
                    result: "Success",
                    occurred_at: new Date(),
                },
                { transaction },
            );

            return {
                role: invitationData.role,
                email: user.email,
                displayName: fullName,
                pendingReview: invitationData.role === "Doctor",
            };
        });
    } catch (error) {
        if (error.name === "SequelizeUniqueConstraintError") {
            throw new RegistrationError(
                invitationData.role === "Doctor"
                    ? "Ya existe un médico registrado con ese documento."
                    : "Ya existe un paciente registrado con este documento de identidad.",
                409,
            );
        }
        throw error;
    }
}
