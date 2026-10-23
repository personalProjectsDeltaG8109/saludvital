(() => {
    const cards = [...document.querySelectorAll("[data-consultation-card]")];
    const records = [...document.querySelectorAll("[data-consultation-record]")];
    const searchInput = document.querySelector("[data-consultation-search]");
    const filterSelect = document.querySelector("[data-consultation-filter]");
    const emptyMessage = document.querySelector("[data-consultation-empty]");

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
            const isVisible = matchesQuery && matchesFilter;

            card.hidden = !isVisible;
            if (isVisible) visibleCount += 1;
        });

        if (emptyMessage) emptyMessage.hidden = visibleCount > 0;

        if (
            cards.length &&
            !cards.some((card) => !card.hidden && card.classList.contains("is-selected"))
        ) {
            const firstVisibleCard = cards.find((card) => !card.hidden);
            if (firstVisibleCard) selectConsultation(firstVisibleCard, false);
        }
    }

    function selectConsultation(card, shouldScroll = true) {
        const consultationId = card.dataset.consultationId;

        cards.forEach((item) => {
            const isSelected = item === card;
            item.classList.toggle("is-selected", isSelected);
            item.setAttribute("aria-pressed", String(isSelected));
            item.setAttribute("aria-expanded", String(isSelected));
        });

        records.forEach((record) => {
            record.hidden = record.dataset.recordId !== consultationId;
        });
        const placeholder = document.querySelector("[data-clinical-detail-placeholder]");
        if (placeholder) placeholder.hidden = true;

        if (shouldScroll && window.matchMedia("(max-width: 760px)").matches) {
            document.querySelector("[data-consultation-detail]")?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }
    }

    // Clear the selected record when the patient closes the details panel.
    function closeConsultation() {
        cards.forEach((card) => {
            card.classList.remove("is-selected");
            card.setAttribute("aria-pressed", "false");
            card.setAttribute("aria-expanded", "false");
        });
        records.forEach((record) => {
            record.hidden = true;
        });
        const placeholder = document.querySelector("[data-clinical-detail-placeholder]");
        if (placeholder) placeholder.hidden = false;
    }

    cards.forEach((card) => {
        card.addEventListener("click", () => {
            if (card.classList.contains("is-selected")) {
                closeConsultation();
                return;
            }
            selectConsultation(card);
        });
    });

    // Let the patient close the selected clinical record from its detail panel.
    document.querySelectorAll("[data-close-consultation]").forEach((button) => {
        button.addEventListener("click", closeConsultation);
    });

    searchInput?.addEventListener("input", applyFilters);
    filterSelect?.addEventListener("change", applyFilters);

    records.forEach((record) => {
        const tabs = [...record.querySelectorAll("[data-detail-tab]")];
        const panels = [...record.querySelectorAll("[data-detail-panel]")];

        tabs.forEach((tab) => {
            tab.addEventListener("click", () => {
                tabs.forEach((item) => {
                    const isSelected = item === tab;
                    item.classList.toggle("is-active", isSelected);
                    item.setAttribute("aria-selected", String(isSelected));
                });

                panels.forEach((panel) => {
                    panel.hidden = panel.dataset.detailPanel !== tab.dataset.detailTab;
                });
            });
        });

        record.querySelector("[data-print-consultation]")?.addEventListener("click", () => {
            window.print();
        });
    });
})();
