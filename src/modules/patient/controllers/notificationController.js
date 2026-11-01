import {
    getPatientNotificationSettings,
    markPatientNotificationsAsRead,
    updatePatientNotificationChannel,
    updatePatientNotificationPreferences,
} from "../services/notificationService.js";

export async function savePatientNotificationPreferences(req, res, next) {
    try {
        // Save channel choices and their notification-only contact destinations together.
        const preferences = await updatePatientNotificationPreferences(
            req.auth.userId,
            req.body?.preferences,
            req.body?.contacts,
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

export async function markPatientNotificationsRead(req, res, next) {
    try {
        const result = await markPatientNotificationsAsRead(req.auth.userId, req.body?.ids);
        return res.status(200).json({ success: true, data: result });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        return next(error);
    }
}

export async function savePatientNotificationChannel(req, res, next) {
    try {
        const result = await updatePatientNotificationChannel(
            req.auth.userId,
            req.body?.channel,
            req.body?.isEnabled,
        );
        return res.status(200).json({
            success: true,
            message: "Se actualizó tu canal de notificaciones.",
            data: result,
        });
    } catch (error) {
        if (error.status) {
            return res.status(error.status).json({ success: false, message: error.message });
        }
        return next(error);
    }
}
