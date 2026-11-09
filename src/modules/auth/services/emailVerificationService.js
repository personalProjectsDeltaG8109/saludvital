import { createHash } from "node:crypto";
import { Op } from "sequelize";
import { User } from "../../../models/associations.js";
import { isEmailUniqueConstraintError } from "./emailChangeService.js";

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

    try {
        return await User.sequelize.transaction(async (transaction) => {
            const user = await User.findOne({
                where: {
                    email_verification_token_hash: tokenHash,
                    email_verification_expires_at: {
                        [Op.gt]: now,
                    },
                    is_active: true,
                    [Op.or]: [{ email_verified_at: null }, { pending_email: { [Op.ne]: null } }],
                },
                transaction,
                lock: transaction.LOCK.UPDATE,
            });

            if (!user) {
                return { verified: false, reason: "invalid_or_expired" };
            }

            const isEmailChange = Boolean(user.pending_email);
            const updates = {
                email_verified_at: now,
                email_verification_token_hash: null,
                email_verification_expires_at: null,
            };

            if (user.pending_email) {
                const existingAddress = await User.findOne({
                    where: {
                        id: { [Op.ne]: user.id },
                        [Op.or]: [
                            { email: user.pending_email },
                            { pending_email: user.pending_email },
                        ],
                    },
                    attributes: ["id"],
                    transaction,
                    lock: transaction.LOCK.UPDATE,
                });

                if (existingAddress) {
                    await user.update(
                        {
                            pending_email: null,
                            email_verification_requested_at: null,
                            email_verification_token_hash: null,
                            email_verification_expires_at: null,
                        },
                        { transaction },
                    );
                    return { verified: false, reason: "address_in_use" };
                }

                updates.email = user.pending_email;
                updates.pending_email = null;
                updates.email_verification_requested_at = null;
            }

            await user.update(updates, { transaction });

            return isEmailChange ? { verified: true, emailChanged: true } : { verified: true };
        });
    } catch (error) {
        if (isEmailUniqueConstraintError(error)) {
            return { verified: false, reason: "address_in_use" };
        }
        throw error;
    }
}
