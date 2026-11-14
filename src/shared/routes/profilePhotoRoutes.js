import express from "express";
import { authenticateTokenOptional } from "../../middleware/authenticateToken.js";
import { canAccessProfilePhoto } from "../services/profilePhotoAccessService.js";
import { readStoredProfilePhoto } from "../services/profilePhotoStorageService.js";

const PROFILE_PHOTO_ROUTE_PREFIX = "/uploads/profile-photos";

function setPrivatePhotoHeaders(response) {
    response.set({
        "Cache-Control": "private, no-store",
        "Cross-Origin-Resource-Policy": "same-site",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
    });
}

function sendNotFound(response) {
    return response.status(404).end();
}

/** Keep profile photo URLs stable while protecting them from the public static server. */
export function createProfilePhotoRouter({
    authenticate = authenticateTokenOptional,
    authorizePhoto = canAccessProfilePhoto,
    readPhoto = readStoredProfilePhoto,
} = {}) {
    const router = express.Router();

    router.use(PROFILE_PHOTO_ROUTE_PREFIX, authenticate, async (request, response) => {
        setPrivatePhotoHeaders(response);

        if (request.method !== "GET") return sendNotFound(response);

        const photoUrl = `${request.baseUrl}${request.path}`;
        const isAuthorized = await authorizePhoto({
            userId: request.auth?.userId,
            role: request.auth?.role,
            photoUrl,
        });
        if (!isAuthorized) return sendNotFound(response);

        const photoBytes = await readPhoto(photoUrl);
        if (!photoBytes) return sendNotFound(response);

        return response.type("image/webp").send(photoBytes);
    });

    return router;
}

export default createProfilePhotoRouter();
