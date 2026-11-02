import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const guidanceScript = fs.readFileSync(
    path.join(process.cwd(), "public/js/doctor-vital-sign-guidance.js"),
    "utf8",
);
const browserWindow = {};
vm.runInNewContext(guidanceScript, { window: browserWindow });
const { getVitalSignWarning } = browserWindow.SVDoctorVitalSignGuidance;

describe("doctor vital sign guidance", () => {
    test("warns adult users about atypical resting measurements without blocking them", () => {
        expect(getVitalSignWarning("heartRate", "140", true)).toContain("60–100 lpm");
        expect(getVitalSignWarning("temperature", "39", true)).toContain("36,5–37,3 °C");
        expect(getVitalSignWarning("bloodPressure", "180/120", true)).toContain(
            "no bloquea el registro",
        );
    });

    test("does not apply adult reference warnings to minors or incomplete values", () => {
        expect(getVitalSignWarning("heartRate", "140", false)).toBe("");
        expect(getVitalSignWarning("temperature", "", true)).toBe("");
    });

    test("does not warn for adult resting examples inside the displayed reference", () => {
        expect(getVitalSignWarning("bloodPressure", "120/80", true)).toBe("");
        expect(getVitalSignWarning("heartRate", "72", true)).toBe("");
        expect(getVitalSignWarning("temperature", "36.8", true)).toBe("");
    });
});
