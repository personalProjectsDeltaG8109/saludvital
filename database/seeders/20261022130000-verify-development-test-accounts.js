"use strict";

// Verify only the local test accounts needed for appointment booking.
export async function up(queryInterface) {
    // Prevent development account changes from running in production.
    if (process.env.NODE_ENV === "production") {
        throw new Error("Development test accounts cannot be updated in production.");
    }

    const verifiedAt = new Date();

    // Allow the seeded patient and doctor accounts to sign in without email delivery.
    for (const email of ["test@saludvital.local", "doctor.test@saludvital.local"]) {
        await queryInterface.sequelize.query(
            `UPDATE users
             SET email_verified_at = COALESCE(email_verified_at, :verifiedAt),
                 updated_at = :verifiedAt
             WHERE email = :email`,
            {
                replacements: { email, verifiedAt },
            },
        );
    }
}

// Keep test account verification in place during rollback.
export async function down() {
    // Intentionally preserve local test account access.
}
