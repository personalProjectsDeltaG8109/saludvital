import {
    getPatientNotificationSettings,
    updatePatientNotificationPreferences,
} from "../services/notificationService.js";

export async function savePatientNotificationPreferences(req, res, next) {
    try {
        const preferences = await updatePatientNotificationPreferences(
            req.auth.userId,
            req.body?.preferences,
        );

        return res.status(200).json({
            success: true,
            message: "Tus preferencias de notificación se guardaron correctamente.",
            data: preferences,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        return next(error);
    }
}

export async function listPatientNotifications(req, res, next) {
    try {
        const notifications = await getPatientNotificationSettings(req.auth.userId);
        return res.status(200).json({ success: true, data: notifications });
    } catch (error) {
        return next(error);
    }
}
