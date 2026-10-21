(() => {
    const rows = [...document.querySelectorAll("[data-appointment]")];
    if (!rows.length) return;
    const tabs = [...document.querySelectorAll("[data-filter]")];
    const search = document.querySelector("[data-search]");
    const specialty = document.querySelector("[data-specialty]");
    const status = document.querySelector("[data-status]");
    const empty = document.querySelector("[data-empty]");
    const summary = document.querySelector("[data-summary]");
    let filter = "all";
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    function update() {
        let visible = 0;
        rows.forEach((row) => {
            const rowStatus = row.dataset.status;
            const future =
                new Date(row.dataset.date) >= today &&
                !["Cancelled", "Completed"].includes(rowStatus);
            const tabMatches =
                filter === "all" ||
                (filter === "upcoming" && future) ||
                (filter === "attended" && rowStatus === "Completed") ||
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
                item.setAttribute("aria-selected", String(active));
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
