(() => {
    const adultRestingRanges = {
        heartRate: { minimum: 60, maximum: 100, label: "60–100 lpm" },
        temperature: { minimum: 36.5, maximum: 37.3, label: "36,5–37,3 °C" },
    };

    function getVitalSignWarning(name, rawValue, isAdultPatient) {
        if (!isAdultPatient || !rawValue) return "";

        if (name === "bloodPressure" && /^\d{2,3}\/\d{2,3}$/.test(rawValue)) {
            const [systolic, diastolic] = rawValue.split("/").map(Number);
            if (systolic < 90 || systolic > 120 || diastolic < 60 || diastolic > 80) {
                return "Revisa esta medición frente a la referencia adulta en reposo; la advertencia no bloquea el registro.";
            }
        }

        const referenceRange = adultRestingRanges[name];
        if (!referenceRange) return "";
        const value = Number(rawValue);
        if (value < referenceRange.minimum || value > referenceRange.maximum) {
            return `Valor fuera de la referencia habitual de ${referenceRange.label} en adultos en reposo. Verifica el contexto clínico.`;
        }
        return "";
    }

    window.SVDoctorVitalSignGuidance = { getVitalSignWarning };
})();
