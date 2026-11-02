(() => {
    const page = document.querySelector("[data-consultation-id]");
    const form = document.querySelector("[data-consultation-form]");
    if (!page || !form) return;

    const consultationId = encodeURIComponent(page.dataset.consultationId);
    const steps = [...form.querySelectorAll("[data-consultation-step]")];
    const indicators = [...document.querySelectorAll("[data-step-indicator]")];
    const feedback = document.querySelector("[data-consultation-feedback]");
    const diagnoses = [];
    const medications = [];
    let currentStep = 0;

    // Display elapsed time from the consultation's persisted start timestamp.
    const consultationTimer = document.querySelector("[data-consultation-timer]");
    const consultationStartedAt = Date.parse(page.dataset.consultationStartedAt);
    if (consultationTimer && Number.isFinite(consultationStartedAt)) {
        const updateConsultationTimer = () => {
            const elapsedSeconds = Math.max(
                0,
                Math.floor((Date.now() - consultationStartedAt) / 1000),
            );
            const hours = String(Math.floor(elapsedSeconds / 3600)).padStart(2, "0");
            const minutes = String(Math.floor((elapsedSeconds % 3600) / 60)).padStart(2, "0");
            const seconds = String(elapsedSeconds % 60).padStart(2, "0");
            consultationTimer.textContent = `${hours}:${minutes}:${seconds}`;
        };

        updateConsultationTimer();
        window.setInterval(updateConsultationTimer, 1000);
    }

    const requiredFieldLabels = {
        symptoms: "Motivo de consulta",
        patientFeeling: "Cómo se siente el paciente",
        bloodPressure: "Presión arterial",
        heartRate: "Frecuencia cardiaca",
        temperature: "Temperatura",
        weight: "Peso",
        height: "Estatura",
        clinicalNotes: "Evaluación médica",
    };

    // Mark the required fields in the form and expose their required state accessibly.
    Object.keys(requiredFieldLabels).forEach((name) => {
        const control = form.elements.namedItem(name);
        if (!control) return;
        control.required = true;
        control.setAttribute("aria-required", "true");
        const label = control.labels?.[0] || control.closest("label");
        if (!label || label.querySelector(".required-marker")) return;
        const marker = document.createElement("span");
        marker.className = "required-marker";
        marker.setAttribute("aria-hidden", "true");
        marker.textContent = " *";
        label.append(marker);
    });

    // Read form values by name so the same payload is used for draft and completion requests.
    function field(name) {
        return form.elements.namedItem(name)?.value?.trim() || "";
    }

    function setFeedback(message, isError = false) {
        feedback.textContent = message;
        feedback.classList.toggle("is-error", isError);
        feedback.classList.toggle("is-success", Boolean(message) && !isError);
    }

    function updateVitalWarnings() {
        const isAdultPatient = page.dataset.adultPatient === "true";
        const warningIds = {
            bloodPressure: "blood-pressure-warning",
            heartRate: "heart-rate-warning",
            temperature: "temperature-warning",
        };
        const referenceNote = document.querySelector("[data-vital-reference-note]");
        if (referenceNote) referenceNote.hidden = !isAdultPatient;

        document.querySelectorAll("[data-vital-warning]").forEach((input) => {
            const warning = document.getElementById(warningIds[input.dataset.vitalWarning]);
            if (!warning) return;
            const message = window.SVDoctorVitalSignGuidance.getVitalSignWarning(
                input.name,
                field(input.name),
                isAdultPatient,
            );
            warning.textContent = message;
            warning.hidden = !message;
        });
    }

    function getMedicalOrdersError() {
        const orders = field("medicalOrders")
            .split("\n")
            .map((order) => order.trim())
            .filter(Boolean);
        if (orders.length > 30) return "Puedes registrar hasta 30 órdenes médicas.";
        if (orders.some((order) => order.length > 300)) {
            return "Cada orden médica admite hasta 300 caracteres.";
        }
        return "";
    }

    function updateMedicalOrdersWarning() {
        const warning = document.querySelector("[data-medical-orders-warning]");
        if (!warning) return;
        warning.textContent = getMedicalOrdersError();
        warning.hidden = !warning.textContent;
    }

    function preventInvalidMedicalOrders() {
        const error = getMedicalOrdersError();
        if (!error) return false;
        setFeedback(error, true);
        return true;
    }

    document.querySelectorAll("[data-vital-warning]").forEach((input) => {
        input.addEventListener("input", updateVitalWarnings);
    });
    form.elements.namedItem("medicalOrders")?.addEventListener("input", updateMedicalOrdersWarning);
    updateVitalWarnings();
    updateMedicalOrdersWarning();

    function renderList(list, items, getLabel, onRemove) {
        list.replaceChildren();
        items.forEach((item, index) => {
            const row = document.createElement("li");
            const text = document.createElement("span");
            const remove = document.createElement("button");
            text.textContent = getLabel(item);
            remove.type = "button";
            remove.textContent = "Quitar";
            remove.setAttribute("aria-label", `Quitar elemento ${index + 1}`);
            remove.addEventListener("click", () => onRemove(index));
            row.append(text, remove);
            list.append(row);
        });
    }

    function renderEntries() {
        renderList(
            document.querySelector("[data-diagnosis-list]"),
            diagnoses,
            (item) => `${item.diagnosis}${item.notes ? ` — ${item.notes}` : ""}`,
            (index) => {
                diagnoses.splice(index, 1);
                renderEntries();
            },
        );
        renderList(
            document.querySelector("[data-medication-list]"),
            medications,
            (item) =>
                `${item.medicationName} · ${item.dosage} · ${item.frequency} · ${item.duration}`,
            (index) => {
                medications.splice(index, 1);
                renderEntries();
            },
        );
    }

    function collectPayload() {
        const vitalSigns = {};
        ["bloodPressure", "heartRate", "temperature", "weight", "height"].forEach((name) => {
            const value = field(name);
            if (value) vitalSigns[name] = name === "bloodPressure" ? value : Number(value);
        });
        return {
            symptoms: field("symptoms"),
            patientFeeling: field("patientFeeling"),
            clinicalNotes: field("clinicalNotes"),
            recommendations: field("recommendations"),
            medicalOrders: field("medicalOrders")
                .split("\n")
                .map((value) => value.trim())
                .filter(Boolean),
            vitalSigns: Object.keys(vitalSigns).length ? vitalSigns : null,
            diagnoses: [...diagnoses],
            prescriptionItems: [...medications],
        };
    }

    function hydrate(record) {
        form.elements.namedItem("symptoms").value = record.symptoms || "";
        form.elements.namedItem("patientFeeling").value = record.patient_feeling || "";
        form.elements.namedItem("clinicalNotes").value = record.clinical_notes || "";
        form.elements.namedItem("recommendations").value = record.recommendations || "";
        form.elements.namedItem("medicalOrders").value = (record.medical_orders || []).join("\n");
        Object.entries(record.vital_signs || {}).forEach(([name, value]) => {
            const input = form.elements.namedItem(name);
            if (input) input.value = value;
        });
        diagnoses.splice(
            0,
            diagnoses.length,
            ...(record.diagnoses || []).map(({ diagnosis, notes }) => ({ diagnosis, notes })),
        );
        medications.splice(
            0,
            medications.length,
            ...(record.prescriptions || []).flatMap((prescription) =>
                (prescription.items || []).map((item) => ({
                    medicationName: item.medication_name,
                    dosage: item.dosage,
                    frequency: item.frequency,
                    duration: item.duration,
                    instructions: item.instructions || "",
                })),
            ),
        );
        renderEntries();
    }

    function showStep(index, focusHeading = true) {
        currentStep = Math.max(0, Math.min(index, steps.length - 1));
        steps.forEach((step, stepIndex) => {
            step.hidden = stepIndex !== currentStep;
        });
        indicators.forEach((indicator, stepIndex) => {
            const isCurrentStep = stepIndex === currentStep;
            const isPreviousStep = stepIndex < currentStep;
            const stateLabel = isCurrentStep
                ? "Paso actual"
                : isPreviousStep
                  ? "Paso anterior"
                  : "Pendiente";

            indicator.classList.toggle("is-active", stepIndex === currentStep);
            indicator.classList.toggle("is-previous", isPreviousStep);
            indicator.disabled = stepIndex > currentStep;
            if (isCurrentStep) indicator.setAttribute("aria-current", "step");
            else indicator.removeAttribute("aria-current");
            indicator.querySelector("[data-step-state]").textContent = stateLabel;
            indicator.setAttribute(
                "aria-label",
                `Paso ${stepIndex + 1} de ${steps.length}: ${indicator.dataset.stepTitle}. ${stateLabel}.`,
            );
        });
        document.querySelector("[data-step-announcement]").textContent =
            `Paso ${currentStep + 1} de ${steps.length}: ${indicators[currentStep].dataset.stepTitle}. Paso actual.`;
        if (currentStep === 3) renderSummary();
        if (focusHeading) steps[currentStep].querySelector("h2")?.focus();
    }

    function renderSummary() {
        const summary = document.querySelector("[data-consultation-summary]");
        summary.replaceChildren();
        const payload = collectPayload();
        const rows = [
            ["Motivo", payload.symptoms],
            ["Condición del paciente", payload.patientFeeling || "Sin información"],
            [
                "Signos vitales",
                Object.entries(payload.vitalSigns || {})
                    .map(([key, value]) => `${key}: ${value}`)
                    .join(" · ") || "Sin datos",
            ],
            ["Evaluación", payload.clinicalNotes],
            [
                "Diagnósticos",
                payload.diagnoses
                    .map((item) => `${item.diagnosis}${item.notes ? ` (${item.notes})` : ""}`)
                    .join("; ") || "Sin diagnósticos",
            ],
            [
                "Medicamentos",
                payload.prescriptionItems
                    .map(
                        (item) =>
                            `${item.medicationName}: ${item.dosage}, ${item.frequency}, ${item.duration}${item.instructions ? ` — ${item.instructions}` : ""}`,
                    )
                    .join("; ") || "Sin medicamentos",
            ],
            ["Recomendaciones", payload.recommendations || "Sin recomendaciones"],
            ["Órdenes médicas", payload.medicalOrders.join(", ") || "Sin órdenes"],
        ];
        rows.forEach(([label, value]) => {
            const term = document.createElement("dt");
            const detail = document.createElement("dd");
            term.textContent = label;
            detail.textContent = value;
            summary.append(term, detail);
        });
    }

    async function send(path, method, payload) {
        const response = await fetch(path, {
            method,
            credentials: "same-origin",
            headers: { Accept: "application/json", "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.message || "No fue posible guardar la consulta.");
        return data;
    }

    document
        .querySelectorAll("[data-next-step]")
        .forEach((button) => button.addEventListener("click", () => showStep(currentStep + 1)));
    document
        .querySelectorAll("[data-previous-step]")
        .forEach((button) => button.addEventListener("click", () => showStep(currentStep - 1)));
    indicators.forEach((button, index) =>
        button.addEventListener("click", () => {
            if (!button.disabled) showStep(index);
        }),
    );

    showStep(0, false);

    document.querySelector("[data-add-diagnosis]").addEventListener("click", () => {
        const diagnosisInput = document.querySelector("[data-diagnosis-input]");
        const notesInput = document.querySelector("[data-diagnosis-notes]");
        if (!diagnosisInput.value.trim())
            return setFeedback("Escribe un diagnóstico antes de agregarlo.", true);
        diagnoses.push({
            diagnosis: diagnosisInput.value.trim(),
            notes: notesInput.value.trim() || null,
        });
        diagnosisInput.value = "";
        notesInput.value = "";
        setFeedback("");
        renderEntries();
    });

    document.querySelector("[data-add-medication]").addEventListener("click", () => {
        const item = {
            medicationName: document.querySelector("[data-medication-name]").value.trim(),
            dosage: document.querySelector("[data-medication-dosage]").value.trim(),
            frequency: document.querySelector("[data-medication-frequency]").value.trim(),
            duration: document.querySelector("[data-medication-duration]").value.trim(),
            instructions: document.querySelector("[data-medication-instructions]").value.trim(),
        };
        if (!item.medicationName || !item.dosage || !item.frequency || !item.duration) {
            return setFeedback("Completa medicamento, dosis, frecuencia y duración.", true);
        }
        medications.push(item);
        document
            .querySelectorAll(
                "[data-medication-name], [data-medication-dosage], [data-medication-frequency], [data-medication-duration], [data-medication-instructions]",
            )
            .forEach((input) => {
                input.value = "";
            });
        setFeedback("");
        renderEntries();
    });

    document.querySelectorAll("[data-save-draft]").forEach((button) =>
        button.addEventListener("click", async () => {
            if (preventInvalidMedicalOrders()) return;
            button.disabled = true;
            try {
                const data = await send(
                    `/api/doctor/consultations/${consultationId}/draft`,
                    "PUT",
                    collectPayload(),
                );
                setFeedback(data.message || "Borrador guardado correctamente.");
            } catch (error) {
                setFeedback(error.message, true);
            } finally {
                button.disabled = false;
            }
        }),
    );

    document
        .querySelector("[data-complete-consultation]")
        .addEventListener("click", async (event) => {
            const button = event.currentTarget;
            const payload = collectPayload();
            if (preventInvalidMedicalOrders()) return;
            const missingFields = Object.entries(requiredFieldLabels)
                .filter(([name]) => !field(name))
                .map(([, label]) => label);
            if (missingFields.length) {
                return setFeedback(
                    `Completa los campos obligatorios: ${missingFields.join(", ")}.`,
                    true,
                );
            }
            button.disabled = true;
            try {
                await send(`/api/doctor/consultations/${consultationId}/complete`, "POST", payload);
                window.location.assign("/doctor/appointments?status=Attended");
            } catch (error) {
                setFeedback(error.message, true);
                button.disabled = false;
            }
        });

    fetch(`/api/doctor/consultations/${consultationId}`, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
    })
        .then(async (response) => {
            const data = await response.json();
            if (!response.ok) throw new Error(data.message || "No fue posible cargar el borrador.");
            hydrate(data);
        })
        .catch((error) => setFeedback(error.message, true));
})();
