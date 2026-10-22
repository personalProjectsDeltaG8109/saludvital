(() => {
    const rows = [...document.querySelectorAll("[data-appointment]")];

    // Open appointment details on both the dashboard and appointments page.
    document.querySelectorAll("[data-open-appointment-details]").forEach((button) => {
        button.addEventListener("click", () => {
            const dialog = document.getElementById(
                `appointment-details-${button.dataset.openAppointmentDetails}`,
            );
            if (dialog instanceof HTMLDialogElement) dialog.showModal();
        });
    });

    // Close detail dialogs from their controls or by clicking the backdrop.
    document.querySelectorAll(".appointment-details-dialog").forEach((dialog) => {
        dialog.querySelectorAll("[data-close-appointment-details]").forEach((button) => {
            button.addEventListener("click", () => dialog.close());
        });
        dialog.addEventListener("click", (event) => {
            if (event.target === dialog) dialog.close();
        });
    });

    if (!rows.length) return;
    const tabs = [...document.querySelectorAll("[data-filter]")];
    const search = document.querySelector("[data-search]");
    const specialty = document.querySelector("[data-specialty]");
    const status = document.querySelector("[data-status]");
    const empty = document.querySelector("[data-empty]");
    const summary = document.querySelector("[data-summary]");
    let filter = "all";
    const bogotaDate = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Bogota",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    const today = bogotaDate.format(new Date());

    function update() {
        let visible = 0;
        rows.forEach((row) => {
            const rowStatus = row.dataset.status;
            const future =
                bogotaDate.format(new Date(row.dataset.date)) >= today &&
                !["Cancelled", "Attended"].includes(rowStatus);
            const tabMatches =
                filter === "all" ||
                (filter === "upcoming" && future) ||
                (filter === "attended" && rowStatus === "Attended") ||
                (filter === "cancelled" && rowStatus === "Cancelled");
            const statusMatches = !status?.value || status.value === rowStatus;
            const specialtyMatches = !specialty?.value || specialty.value === row.dataset.specialty;
            const queryMatches =
                !search?.value ||
                row.dataset.searchText
                    .toLocaleLowerCase()
                    .includes(search.value.trim().toLocaleLowerCase());
            const show = tabMatches && statusMatches && specialtyMatches && queryMatches;
            row.hidden = !show;
            if (show) visible += 1;
        });
        if (empty) empty.hidden = visible !== 0;
        if (summary) summary.textContent = `Mostrando ${visible} de ${rows.length} citas`;
    }
    tabs.forEach((tab) =>
        tab.addEventListener("click", () => {
            filter = tab.dataset.filter;
            tabs.forEach((item) => {
                const active = item === tab;
                item.classList.toggle("is-active", active);
                item.setAttribute("aria-pressed", String(active));
            });
            update();
        }),
    );
    [search, specialty, status]
        .filter(Boolean)
        .forEach((control) => control.addEventListener("input", update));
    [specialty, status]
        .filter(Boolean)
        .forEach((control) => control.addEventListener("change", update));
})();
