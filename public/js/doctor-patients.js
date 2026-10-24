(() => {
    const page = document.querySelector("[data-doctor-patients-page]");
    const list = document.querySelector("[data-patient-list]");
    const form = document.querySelector("[data-patient-search-form]");
    const searchInput = document.querySelector("[data-patient-search]");
    const detail = document.querySelector("[data-patient-detail]");
    const feedback = document.querySelector("[data-patient-feedback]");
    if (!page || !list || !form || !searchInput || !detail || !feedback) return;

    const listEndpoint = page.dataset.listEndpoint;
    const detailEndpoint = page.dataset.detailEndpoint;
    const countLabel = document.querySelector("[data-patient-count]");
    const rangeLabel = document.querySelector("[data-patient-range]");
    const pageLabel = document.querySelector("[data-patient-page-label]");
    const emptyList = document.querySelector("[data-patient-list-empty]");
    const pageSize = 10;
    let currentPage = Number(new URLSearchParams(window.location.search).get("page")) || 1;
    let selectedPatientId = page.dataset.selectedPatientId;
    let listRequestId = 0;
    let detailRequestId = 0;
    let searchTimer;

    function makeElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        if (text !== undefined && text !== null) element.textContent = text;
        return element;
    }

    function initials(name) {
        return (name || "")
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2)
            .map((part) => part.charAt(0))
            .join("")
            .toUpperCase();
    }

    function setFeedback(message, isError = false) {
        feedback.textContent = message;
        feedback.classList.toggle("is-error", isError);
        feedback.classList.toggle("is-success", Boolean(message) && !isError);
    }

    async function getJson(url) {
        const response = await fetch(url, {
            credentials: "same-origin",
            headers: { Accept: "application/json" },
        });
        const result = await response.json();
        if (!response.ok)
            throw new Error(result.message || "No fue posible cargar la información.");
        return result;
    }

    function appendAvatar(container, name, photoUrl, className = "") {
        const avatar = makeElement("span", `doctor-patient-avatar ${className}`.trim());
        avatar.setAttribute("aria-hidden", "true");
        if (photoUrl && photoUrl.startsWith("/") && !photoUrl.startsWith("//")) {
            const image = document.createElement("img");
            image.src = photoUrl;
            image.alt = "";
            avatar.append(image);
        } else {
            avatar.textContent = initials(name);
        }
        container.append(avatar);
    }

    function renderPatientList(patients, pagination) {
        list.replaceChildren();
        patients.forEach((patient) => {
            const item = document.createElement("li");
            const button = makeElement("button", "doctor-patient-row");
            button.type = "button";
            button.dataset.patientRow = "";
            button.dataset.patientId = patient.id;
            button.setAttribute(
                "aria-pressed",
                String(String(patient.id) === String(selectedPatientId)),
            );

            appendAvatar(button, patient.displayName, patient.profilePhotoUrl);
            const copy = makeElement("span", "doctor-patient-row-copy");
            copy.append(
                makeElement("strong", "", patient.displayName),
                makeElement(
                    "small",
                    "",
                    `${patient.documentType || ""} ${patient.documentNumber || ""}`.trim(),
                ),
            );
            button.append(copy);
            if (patient.lastAppointmentLabel) {
                const lastVisit = makeElement("span", "doctor-patient-last-visit");
                lastVisit.append(
                    makeElement("small", "", "Última cita"),
                    makeElement("time", "", patient.lastAppointmentLabel),
                );
                button.append(lastVisit);
            }
            item.append(button);
            list.append(item);
        });
        emptyList.hidden = patients.length > 0;
        countLabel.textContent = `${pagination.totalItems} ${pagination.totalItems === 1 ? "paciente" : "pacientes"}`;
        const firstItem = pagination.totalItems
            ? (pagination.page - 1) * pagination.pageSize + 1
            : 0;
        const lastItem = Math.min(pagination.page * pagination.pageSize, pagination.totalItems);
        rangeLabel.textContent = pagination.totalItems
            ? `Mostrando ${firstItem} a ${lastItem} de ${pagination.totalItems}`
            : "Mostrando 0 pacientes";
        pageLabel.textContent = `Página ${pagination.page} de ${pagination.totalPages}`;
        document.querySelector('[data-patient-page="previous"]').disabled = pagination.page <= 1;
        document.querySelector('[data-patient-page="next"]').disabled =
            pagination.page >= pagination.totalPages;
    }

    function appendField(container, label, value) {
        if (!value) return;
        const item = makeElement("p", "doctor-patient-clinical-field");
        item.append(makeElement("strong", "", `${label}: `), document.createTextNode(value));
        container.append(item);
    }

    function renderHistory(history) {
        const panel = makeElement("section", "doctor-patient-tab-panel");
        panel.id = "doctor-patient-history-panel";
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", "doctor-patient-history-tab");
        if (!history.length) {
            const empty = makeElement("div", "doctor-patient-empty-state");
            empty.append(
                makeElement("strong", "", "Aún no hay historial clínico"),
                makeElement("span", "", "Las consultas finalizadas contigo aparecerán aquí."),
            );
            panel.append(empty);
            return panel;
        }

        history.forEach((consultation) => {
            const card = makeElement("article", "doctor-patient-history-card");
            const header = makeElement("header");
            const title = makeElement("div");
            title.append(
                makeElement("h3", "", consultation.specialty || "Consulta médica"),
                makeElement("p", "", consultation.reason || "Consulta médica"),
            );
            header.append(
                title,
                makeElement("time", "", `${consultation.dateLabel} · ${consultation.timeLabel}`),
            );
            card.append(header);
            appendField(card, "Motivo de consulta", consultation.symptoms);
            appendField(card, "Cómo se siente", consultation.patientFeeling);
            appendField(card, "Evaluación médica", consultation.clinicalNotes);

            const vitalSignLabels = {
                bloodPressure: "Presión arterial",
                heartRate: "Frecuencia cardíaca",
                temperature: "Temperatura",
                weight: "Peso",
                height: "Estatura",
                bmi: "IMC",
            };
            const vitalSigns = Object.entries(consultation.vitalSigns || {});
            if (vitalSigns.length) {
                const section = makeElement("section", "doctor-patient-history-section");
                section.append(makeElement("h4", "", "Signos vitales"));
                section.append(
                    makeElement(
                        "p",
                        "",
                        vitalSigns
                            .map(([key, value]) => `${vitalSignLabels[key] || key}: ${value}`)
                            .join(" · "),
                    ),
                );
                card.append(section);
            }

            if (consultation.diagnoses?.length) {
                const section = makeElement("section", "doctor-patient-history-section");
                section.append(makeElement("h4", "", "Diagnósticos"));
                const items = document.createElement("ul");
                consultation.diagnoses.forEach((diagnosis) => {
                    const item = document.createElement("li");
                    item.append(makeElement("strong", "", diagnosis.diagnosis));
                    if (diagnosis.notes)
                        item.append(document.createTextNode(` — ${diagnosis.notes}`));
                    items.append(item);
                });
                section.append(items);
                card.append(section);
            }

            const medicationItems = (consultation.prescriptions || []).flatMap(
                (prescription) => prescription.items || [],
            );
            if (medicationItems.length) {
                const section = makeElement("section", "doctor-patient-history-section");
                section.append(makeElement("h4", "", "Tratamientos"));
                const items = document.createElement("ul");
                medicationItems.forEach((medication) => {
                    const instructions = medication.instructions
                        ? ` — ${medication.instructions}`
                        : "";
                    items.append(
                        makeElement(
                            "li",
                            "",
                            `${medication.medication_name}, ${medication.dosage}, ${medication.frequency}, ${medication.duration}${instructions}`,
                        ),
                    );
                });
                section.append(items);
                card.append(section);
            }

            appendField(card, "Recomendaciones", consultation.recommendations);
            if (consultation.medicalOrders?.length) {
                const section = makeElement("section", "doctor-patient-history-section");
                section.append(makeElement("h4", "", "Órdenes médicas"));
                const items = document.createElement("ul");
                consultation.medicalOrders.forEach((order) =>
                    items.append(makeElement("li", "", order)),
                );
                section.append(items);
                card.append(section);
            }
            panel.append(card);
        });
        return panel;
    }

    function translateStatus(status) {
        return (
            {
                Confirmed: "Confirmada",
                "In Progress": "En curso",
                Attended: "Atendida",
                Cancelled: "Cancelada",
                Pending: "Pendiente",
            }[status] || status
        );
    }

    function renderAppointments(appointments) {
        const panel = makeElement("section", "doctor-patient-tab-panel");
        panel.id = "doctor-patient-appointments-panel";
        panel.setAttribute("role", "tabpanel");
        panel.setAttribute("aria-labelledby", "doctor-patient-appointments-tab");
        if (!appointments.length) {
            const empty = makeElement("div", "doctor-patient-empty-state");
            empty.append(
                makeElement("strong", "", "No hay citas para mostrar"),
                makeElement("span", "", "Las citas asignadas a tu perfil aparecerán aquí."),
            );
            panel.append(empty);
            return panel;
        }

        const listElement = makeElement("ul", "doctor-patient-appointments");
        appointments.forEach((appointment) => {
            const item = document.createElement("li");
            const info = makeElement("div");
            info.append(
                makeElement("strong", "", appointment.specialty || "Consulta médica"),
                makeElement("span", "", appointment.reason || "Consulta médica"),
            );
            const meta = makeElement("div", "doctor-patient-appointment-meta");
            meta.append(
                makeElement("time", "", `${appointment.dateLabel} · ${appointment.timeLabel}`),
                makeElement(
                    "span",
                    `doctor-status status-${(appointment.status || "").toLowerCase().replace(/\s+/g, "-")}`,
                    translateStatus(appointment.status),
                ),
            );
            item.append(info, meta);
            listElement.append(item);
        });
        panel.append(listElement);
        return panel;
    }

    function renderDetail(data) {
        detail.replaceChildren();
        const header = makeElement("header", "doctor-patient-detail-header");
        appendAvatar(
            header,
            data.patient.displayName,
            data.patient.profilePhotoUrl,
            "doctor-patient-detail-avatar",
        );
        const identity = makeElement("div");
        identity.append(
            makeElement("h2", "", data.patient.displayName),
            makeElement("p", "", `${data.patient.documentType} ${data.patient.documentNumber}`),
        );
        header.append(identity);

        const tabs = makeElement("nav", "doctor-patient-tabs");
        tabs.setAttribute("role", "tablist");
        tabs.setAttribute("aria-label", "Historial clínico y citas");
        const historyTab = makeElement("button", "is-active", "Historial clínico");
        historyTab.type = "button";
        historyTab.id = "doctor-patient-history-tab";
        historyTab.dataset.patientTab = "history";
        historyTab.setAttribute("role", "tab");
        historyTab.setAttribute("aria-selected", "true");
        historyTab.setAttribute("aria-controls", "doctor-patient-history-panel");
        const appointmentsTab = makeElement("button", "", "Citas");
        appointmentsTab.type = "button";
        appointmentsTab.id = "doctor-patient-appointments-tab";
        appointmentsTab.dataset.patientTab = "appointments";
        appointmentsTab.setAttribute("role", "tab");
        appointmentsTab.setAttribute("aria-selected", "false");
        appointmentsTab.setAttribute("aria-controls", "doctor-patient-appointments-panel");
        tabs.append(historyTab, appointmentsTab);

        detail.append(
            header,
            tabs,
            renderHistory(data.clinicalHistory),
            renderAppointments(data.appointments),
        );
        historyTab.focus({ preventScroll: true });
        setActiveTab("history");
    }

    function setActiveTab(name) {
        detail.querySelectorAll("[data-patient-tab]").forEach((tab) => {
            const active = tab.dataset.patientTab === name;
            tab.classList.toggle("is-active", active);
            tab.setAttribute("aria-selected", String(active));
            tab.tabIndex = active ? 0 : -1;
        });
        detail.querySelectorAll("[data-patient-tab-panel]").forEach((panel) => {
            panel.hidden = panel.dataset.patientTabPanel !== name;
        });
        const historyPanel = detail.querySelector("#doctor-patient-history-panel");
        const appointmentsPanel = detail.querySelector("#doctor-patient-appointments-panel");
        if (historyPanel) historyPanel.hidden = name !== "history";
        if (appointmentsPanel) appointmentsPanel.hidden = name !== "appointments";
    }

    async function loadPatientDetail(patientId) {
        const requestId = ++detailRequestId;
        selectedPatientId = String(patientId);
        page.dataset.selectedPatientId = selectedPatientId;
        list.querySelectorAll("[data-patient-row]").forEach((row) => {
            row.setAttribute("aria-pressed", String(row.dataset.patientId === selectedPatientId));
        });
        setFeedback("Cargando la información del paciente...");
        try {
            const data = await getJson(`${detailEndpoint}/${encodeURIComponent(patientId)}`);
            if (requestId !== detailRequestId) return;
            renderDetail(data);
            if (window.matchMedia("(max-width: 820px)").matches) {
                detail.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            setFeedback("");
            updateUrl();
        } catch (error) {
            if (requestId !== detailRequestId) return;
            setFeedback(error.message, true);
        }
    }

    function updateUrl() {
        const params = new URLSearchParams();
        const search = searchInput.value.trim();
        if (search) params.set("search", search);
        if (currentPage > 1) params.set("page", String(currentPage));
        if (selectedPatientId) params.set("patientId", selectedPatientId);
        const query = params.toString();
        window.history.replaceState(
            {},
            "",
            `${window.location.pathname}${query ? `?${query}` : ""}`,
        );
    }

    async function loadPatients(pageNumber = 1) {
        const requestId = ++listRequestId;
        currentPage = pageNumber;
        setFeedback("Buscando pacientes...");
        const params = new URLSearchParams({ page: String(pageNumber), limit: String(pageSize) });
        if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
        try {
            const result = await getJson(`${listEndpoint}?${params.toString()}`);
            if (requestId !== listRequestId) return;
            currentPage = result.pagination.page;
            renderPatientList(result.patients, result.pagination);
            const keepSelected = result.patients.find(
                (patient) => String(patient.id) === String(selectedPatientId),
            );
            const selected = keepSelected || result.patients[0];
            if (selected) await loadPatientDetail(selected.id);
            else {
                selectedPatientId = "";
                page.dataset.selectedPatientId = "";
                renderEmptyDetail();
                setFeedback(result.pagination.totalItems ? "No hay pacientes en esta página." : "");
            }
            updateUrl();
        } catch (error) {
            if (requestId === listRequestId) setFeedback(error.message, true);
        }
    }

    function renderEmptyDetail() {
        detail.replaceChildren();
        const empty = makeElement("div", "doctor-patient-detail-empty");
        empty.append(
            makeElement("span", "", "♡"),
            makeElement("strong", "", "Selecciona un paciente"),
            makeElement(
                "p",
                "",
                "Elige un paciente de la lista para consultar su historial clínico y sus citas.",
            ),
        );
        empty.firstElementChild.setAttribute("aria-hidden", "true");
        detail.append(empty);
    }

    detail.addEventListener("click", (event) => {
        const tab = event.target.closest("[data-patient-tab]");
        if (tab) setActiveTab(tab.dataset.patientTab);
    });
    detail.addEventListener("keydown", (event) => {
        const currentTab = event.target.closest("[data-patient-tab]");
        if (!currentTab || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
        const tabs = [...detail.querySelectorAll("[data-patient-tab]")];
        const currentIndex = tabs.indexOf(currentTab);
        const nextIndex =
            event.key === "Home"
                ? 0
                : event.key === "End"
                  ? tabs.length - 1
                  : (currentIndex + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) %
                    tabs.length;
        event.preventDefault();
        tabs[nextIndex].focus();
        setActiveTab(tabs[nextIndex].dataset.patientTab);
    });
    if (detail.querySelector("[data-patient-tab]")) setActiveTab("history");
    list.addEventListener("click", (event) => {
        const row = event.target.closest("[data-patient-row]");
        if (row) loadPatientDetail(row.dataset.patientId);
    });
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        loadPatients(1);
    });
    searchInput.addEventListener("input", () => {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(() => loadPatients(1), 300);
    });
    document.querySelector('[data-patient-page="previous"]').addEventListener("click", () => {
        if (currentPage > 1) loadPatients(currentPage - 1);
    });
    document.querySelector('[data-patient-page="next"]').addEventListener("click", () => {
        loadPatients(currentPage + 1);
    });

    updateUrl();
})();
