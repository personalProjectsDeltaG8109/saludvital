import {
    LEGACY_PROFILE_PHOTO_DIRECTORY,
    PRIVATE_PROFILE_PHOTO_DIRECTORY,
} from "../src/shared/services/profilePhotoStorageService.js";
import { migrateLegacyProfilePhotos } from "../src/shared/services/profilePhotoMigrationService.js";

const applyChanges = process.argv.includes("--apply");
const productionApproval = process.argv.includes("--confirm-production");
if (applyChanges && process.env.NODE_ENV === "production" && !productionApproval) {
    console.error("Production migration requires the additional --confirm-production flag.");
    process.exitCode = 1;
} else {
    const result = await migrateLegacyProfilePhotos({
        sourceDirectory: LEGACY_PROFILE_PHOTO_DIRECTORY,
        destinationDirectory: PRIVATE_PROFILE_PHOTO_DIRECTORY,
        dryRun: !applyChanges,
    });

    console.log(
        `${result.dryRun ? "Dry run" : "Applied"}: scanned ${result.scanned}, migrated ${result.migrated}, skipped ${result.skipped}, failed ${result.failed}.`,
    );
    if (result.failed) process.exitCode = 1;
}
