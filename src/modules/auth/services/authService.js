import bcrypt from "bcrypt";
import { Rol, User } from "../../../models/associations.js";

// Keep authentication errors generic to avoid revealing account existence.
export class AuthenticationError extends Error {
    constructor() {
        super("Invalido el email o contraseña.");
        this.name = "AuthenticationError";
        this.statusCode = 401;
    }
}

// Authenticate an active user and retrieve the role stored in the database.
export async function authenticateUser(email, password) {
    // Normalize the email before searching for the account.
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    // Reject missing or invalid credentials before querying the database.
    if (
        !normalizedEmail ||
        normalizedEmail.length > 80 ||
        typeof password !== "string" ||
        password.length === 0
    ) {
        throw new AuthenticationError();
    }

    // Retrieve the account together with its database-assigned role.
    const user = await User.findOne({
        where: {
            email: normalizedEmail,
            is_active: true,
        },
        include: [
            {
                model: Rol,
                as: "rol",
                attributes: ["id", "name"],
                required: true,
            },
        ],
    });

    // Use the same public error for missing accounts and incorrect passwords.
    if (!user) {
        throw new AuthenticationError();
    }

    // Verify the submitted password against the stored bcrypt hash.
    const passwordMatches = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatches) {
        throw new AuthenticationError();
    }

    // Update the last successful login timestamp.
    await user.update({
        last_login_at: new Date(),
    });

    // Return only the data required by the authentication controller.
    return {
        id: user.id,
        email: user.email,
        role: user.rol.name,
    };
}
