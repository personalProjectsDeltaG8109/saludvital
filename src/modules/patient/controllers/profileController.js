import { updatePatientProfile } from "../services/profileService.js";
import {
    deactivatePatientAccount,
    updatePatientProfilePhoto,
} from "../services/profileMediaService.js";

export async function savePatientProfile(req, res, next) {
    try {
        const result = await updatePatientProfile(req.auth.userId, req.body);
        return res.status(200).json({
            success: true,
            message: result.emailChanged
                ? "Perfil actualizado. Revisa tu nuevo correo para confirmar el cambio."
                : "Tu perfil se actualizó correctamente.",
            data: result,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        return next(error);
    }
}

export async function savePatientProfilePhoto(req, res, next) {
    try {
        const photoUrl = await updatePatientProfilePhoto(req.auth.userId, req.body?.photo);
        return res.status(200).json({ success: true, photoUrl });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        return next(error);
    }
}

export async function deletePatientAccount(req, res, next) {
    try {
        await deactivatePatientAccount(req.auth.userId, req.body?.password);
        res.clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/",
        });
        return res.status(200).json({
            success: true,
            message: "Tu cuenta fue desactivada y ya no podrás iniciar sesión.",
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        return next(error);
    }
}
