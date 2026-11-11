(() => {
    const cards = [...document.querySelectorAll("[data-consultation-card]")];
    const searchInput = document.querySelector("[data-consultation-search]");
    const filterSelect = document.querySelector("[data-consultation-filter]");
    const emptyMessage = document.querySelector("[data-consultation-empty]");
    const detailPanel = document.querySelector("[data-consultation-detail]");
    const detailPlaceholder = document.querySelector("[data-clinical-detail-placeholder]");
    const detailLoading = document.querySelector("[data-clinical-detail-loading]");
    const detailError = document.querySelector("[data-clinical-detail-error]");
    const detailContent = document.querySelector("[data-clinical-detail-content]");

    function createElement(tagName, className, text) {
        const element = document.createElement(tagName);
        if (className) element.className = className;
        if (text !== undefined && text !== null) element.textContent = String(text);
        return element;
    }

    function addInfoBlock(container, title, value) {
        const article = createElement("article", "clinical-info-block");
        const content = createElement("div");
        content.append(createElement("h3", null, title));
        content.append(createElement("p", null, value || "No hay información registrada."));
        article.append(content);
        container.append(article);
    }

    function createDetailTabs(record) {
        const tabList = createElement("div", "clinical-detail-tabs");
        tabList.setAttribute("role", "tablist");
        tabList.setAttribute("aria-label", "Secciones del detalle clínico");
        const panel = createElement("div", "clinical-detail-content");
        panel.setAttribute("role", "tabpanel");

        [
            ["summary", "Resumen"],
            ["diagnoses", "Diagnósticos"],
            ["treatments", "Tratamientos"],
        ].forEach(([key, label], index) => {
            const button = createElement("button", index === 0 ? "is-active" : "", label);
            button.type = "button";
            button.setAttribute("role", "tab");
            button.setAttribute("aria-selected", String(index === 0));
            button.dataset.detailTab = key;
            button.addEventListener("click", () => {
                tabList.querySelectorAll("[role='tab']").forEach((tab) => {
                    const selected = tab === button;
                    tab.classList.toggle("is-active", selected);
                    tab.setAttribute("aria-selected", String(selected));
                });
                renderTabContent(panel, record, key);
            });
            tabList.append(button);
        });

        renderTabContent(panel, record, "summary");
        return { tabList, panel };
    }

    function renderTabContent(panel, record, tab) {
        panel.replaceChildren();
        if (tab === "summary") {
            addInfoBlock(panel, "Motivo de consulta", record.symptoms);
            addInfoBlock(
                panel,
                "Evaluación médica",
                record.clinical_notes || record.patient_feeling,
            );
            if (record.vital_signs && Object.keys(record.vital_signs).length) {
                const vitals = createElement("article", "clinical-vitals");
                vitals.append(createElement("h3", null, "Signos vitales"));
                const list = createElement("dl");
                Object.entries(record.vital_signs).forEach(([name, value]) => {
                    const row = createElement("div");
                    row.append(createElement("dt", null, name.replaceAll("_", " ")));
                    row.append(createElement("dd", null, value));
                    list.append(row);
                });
                vitals.append(list);
                panel.append(vitals);
            }
            if (record.recommendations)
                addInfoBlock(panel, "Recomendaciones", record.recommendations);
            return;
        }

        if (tab === "diagnoses") {
            if (!record.diagnoses.length) {
                panel.append(
                    createElement(
                        "p",
                        "clinical-tab-empty",
                        "No hay diagnósticos registrados para esta consulta.",
                    ),
                );
                return;
            }
            record.diagnoses.forEach((diagnosis) => {
                const item = createElement("article", "clinical-record-item");
                const copy = createElement("div");
                copy.append(createElement("h3", null, diagnosis.diagnosis));
                if (diagnosis.notes) copy.append(createElement("p", null, diagnosis.notes));
                item.append(copy);
                panel.append(item);
            });
            return;
        }

        const treatments = record.prescriptions.flatMap((prescription) => prescription.items || []);
        treatments.forEach((treatment) => {
            const item = createElement("article", "clinical-record-item");
            const copy = createElement("div");
            copy.append(createElement("h3", null, treatment.medication_name));
            copy.append(
                createElement(
                    "p",
                    null,
                    [treatment.dosage, treatment.frequency, treatment.duration]
                        .filter(Boolean)
                        .join(" · "),
                ),
            );
            if (treatment.instructions)
                copy.append(createElement("small", null, treatment.instructions));
            item.append(copy);
            panel.append(item);
        });
        (record.medical_orders || []).forEach((order) => {
            const item = createElement("article", "clinical-record-item");
            item.append(createElement("div", null, order));
            panel.append(item);
        });
        if (!treatments.length && !(record.medical_orders || []).length) {
            panel.append(
                createElement(
                    "p",
                    "clinical-tab-empty",
                    "No hay tratamientos registrados para esta consulta.",
                ),
            );
        }
    }

    function renderConsultation(record) {
        const article = createElement("section", "clinical-detail-record is-active");
        const heading = createElement("div", "clinical-detail-heading");
        heading.append(createElement("h2", null, "Detalle de la consulta"));
        const printButton = createElement("button", "clinical-print-button", "Imprimir");
        printButton.type = "button";
        printButton.addEventListener("click", () => window.print());
        const closeButton = createElement(
            "button",
            "clinical-close-detail-button",
            "Cerrar detalle",
        );
        closeButton.type = "button";
        closeButton.dataset.closeConsultation = "";
        closeButton.addEventListener("click", closeConsultation);
        heading.append(printButton, closeButton);

        const summary = createElement("div", "clinical-visit-summary");
        summary.append(createElement("span", "clinical-visit-icon", "✚"));
        const copy = createElement("span", "clinical-visit-copy");
        copy.append(createElement("strong", null, record.specialty_label));
        copy.append(createElement("span", null, record.doctor_label));
        copy.append(createElement("small", null, record.specialty_label));
        summary.append(copy);
        const date = createElement("span", "clinical-visit-date");
        date.append(createElement("time", null, record.date_label));
        date.append(createElement("small", null, record.time_label));
        summary.append(date);

        const { tabList, panel } = createDetailTabs(record);
        article.append(heading, summary, tabList, panel);
        detailContent.replaceChildren(article);
    }

    async function loadConsultation(card) {
        detailPlaceholder.hidden = true;
        detailError.hidden = true;
        detailLoading.hidden = false;
        detailContent.replaceChildren();
        try {
            if (card.dataset.previewDetail) {
                renderConsultation(JSON.parse(card.dataset.previewDetail));
                return;
            }
            const response = await fetch(
                `/api/patient/clinical-history/${encodeURIComponent(card.dataset.consultationId)}`,
                { headers: { Accept: "application/json" }, credentials: "same-origin" },
            );
            if (!response.ok) throw new Error("Clinical history detail request failed.");
            const payload = await response.json();
            renderConsultation(payload.consultation);
        } catch {
            detailError.hidden = false;
        } finally {
            detailLoading.hidden = true;
        }
    }

    function applyFilters() {
        const query = (searchInput?.value || "").trim().toLocaleLowerCase("es");
        const filter = filterSelect?.value || "all";
        let visibleCount = 0;
        cards.forEach((card) => {
            const matchesQuery = card.dataset.searchText.includes(query);
            const matchesFilter =
                filter === "all" ||
                (filter === "diagnosis" && card.dataset.hasDiagnosis === "true") ||
                (filter === "treatment" && card.dataset.hasTreatment === "true");
            card.hidden = !(matchesQuery && matchesFilter);
            if (!card.hidden) visibleCount += 1;
        });
        if (emptyMessage) emptyMessage.hidden = visibleCount > 0;
        const selectedCard = cards.find(
            (card) => card.classList.contains("is-selected") && !card.hidden,
        );
        if (!selectedCard) {
            const firstVisibleCard = cards.find((card) => !card.hidden);
            if (firstVisibleCard) selectConsultation(firstVisibleCard, false);
            else closeConsultation();
        }
    }

    function selectConsultation(card, shouldScroll = true) {
        cards.forEach((item) => {
            const selected = item === card;
            item.classList.toggle("is-selected", selected);
            item.setAttribute("aria-pressed", String(selected));
            item.setAttribute("aria-expanded", String(selected));
        });
        loadConsultation(card);
        if (shouldScroll && window.matchMedia("(max-width: 760px)").matches) {
            detailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    }

    function closeConsultation() {
        cards.forEach((card) => {
            card.classList.remove("is-selected");
            card.setAttribute("aria-pressed", "false");
            card.setAttribute("aria-expanded", "false");
        });
        detailContent.replaceChildren();
        detailError.hidden = true;
        detailLoading.hidden = true;
        detailPlaceholder.hidden = false;
    }

    cards.forEach((card) =>
        card.addEventListener("click", () => {
            if (card.classList.contains("is-selected")) closeConsultation();
            else selectConsultation(card);
        }),
    );
    searchInput?.addEventListener("input", applyFilters);
    filterSelect?.addEventListener("change", applyFilters);

    const initiallySelected = cards.find((card) => card.classList.contains("is-selected"));
    if (initiallySelected) loadConsultation(initiallySelected);
})();
