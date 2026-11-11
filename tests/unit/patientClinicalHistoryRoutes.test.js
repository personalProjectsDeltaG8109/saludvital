import { readFile } from "node:fs/promises";

const routeSource = await readFile("src/modules/patient/routes/patientRoutes.js", "utf8");

describe("patient clinical history routes", () => {
    test("protects clinical history list and detail routes with patient authentication", () => {
        expect(routeSource).toMatch(
            /patientRoutes\.get\(\s*"\/api\/patient\/clinical-history\/:consultationId",\s*authenticateToken,\s*requireRole\("Patient"\)/,
        );
        expect(routeSource).toMatch(
            /patientRoutes\.get\(\s*"\/patient\/clinical-history",\s*authenticateToken,\s*requireRole\("Patient"\)/,
        );
    });
});
