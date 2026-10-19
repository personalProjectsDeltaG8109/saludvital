import { createHash } from "node:crypto";
import { Op } from "sequelize";
import { User } from "../../../models/associations.js";

// Hash tokens before querying the database.
function hashToken(token) {
    return createHash("sha256").update(token).digest("hex");
}

// Verify the token once and atomically consume it.
export async function verifyEmail(token) {
    if (typeof token !== "string" || !/^[a-f0-9]{64}$/i.test(token)) {
        return { verified: false, reason: "invalid" };
    }

    const tokenHash = hashToken(token);
    const now = new Date();

    return User.sequelize.transaction(async (transaction) => {
        const user = await User.findOne({
            where: {
                email_verification_token_hash: tokenHash,
                email_verification_expires_at: {
                    [Op.gt]: now,
                },
                email_verified_at: null,
                is_active: true,
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
        });

        if (!user) {
            return { verified: false, reason: "invalid_or_expired" };
        }

        await user.update(
            {
                email_verified_at: now,
                email_verification_token_hash: null,
                email_verification_expires_at: null,
            },
            { transaction },
        );

        return { verified: true };
    });
}
