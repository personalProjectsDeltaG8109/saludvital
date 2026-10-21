import {
    getAvailableSpecialties,
    getAvailableDoctors,
    bookAppointment,
} from "../services/appointmentService.js";
import { AppointmentError } from "../errors/appointmentError.js";

/**
 * Handle expected appointment errors and delegate unexpected errors.
 */
function handleAppointmentError(error, res, next) {
    // Return expected business errors as JSON responses.
    if (error instanceof AppointmentError) {
        return res.status(error.statusCode).json({
            success: false,
            message: error.message,
        });
    }

    // Delegate unexpected errors to the centralized error handler.
    return next(error);
}

/**
 * Return active medical specialties available for appointment booking.
 */
export async function listAvailableSpecialties(req, res, next) {
    try {
        const specialties = await getAvailableSpecialties();

        return res.status(200).json({
            success: true,
            data: specialties,
        });
    } catch (error) {
        return next(error);
    }
}

/**
 * Return active doctors assigned to the requested specialty.
 */
export async function listAvailableDoctors(req, res, next) {
    try {
        const doctors = await getAvailableDoctors(req.params.specialtyId);

        return res.status(200).json({
            success: true,
            data: doctors,
        });
    } catch (error) {
        return handleAppointmentError(error, res, next);
    }
}

/**
 * Create an appointment for the authenticated patient.
 */
export async function createPatientAppointment(req, res, next) {
    try {
        const appointment = await bookAppointment({
            // Use the authenticated identity instead of trusting the request body.
            userId: req.auth.userId,
            specialtyId: req.body.specialtyId,
            doctorId: req.body.doctorId,
            date: req.body.date,
            time: req.body.time,
            reason: req.body.reason,
        });

        return res.status(201).json({
            success: true,
            message: "Appointment booked successfully.",
            data: appointment,
        });
    } catch (error) {
        return handleAppointmentError(error, res, next);
    }
}
