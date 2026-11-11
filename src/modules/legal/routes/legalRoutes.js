import { Router } from "express";
import {
    showHelp,
    showPrivacyPolicy,
    showTermsAndConditions,
} from "../controllers/legalController.js";

const router = Router();

router.get(["/privacy", "/privacy-policy"], showPrivacyPolicy);
router.get(["/terms", "/terms-and-conditions"], showTermsAndConditions);
router.get("/help", showHelp);

export default router;
