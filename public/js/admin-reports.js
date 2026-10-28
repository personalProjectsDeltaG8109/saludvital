const reportsPage = document.querySelector(".admin-reports-page");

if (reportsPage) {
    const results = document.querySelector("[data-reports-results]");
    const loading = document.querySelector("[data-reports-loading]");
    const error = document.querySelector("[data-reports-error]");
    const periodDates = document.querySelector("[data-report-period-dates]");
    const periodSelect = document.querySelector("[data-report-period]");
    const retryButton = document.querySelector("[data-report-retry]");
    const dashboard = document.querySelector(".admin-reports");
    let activeRequest = 0;

    async function loadReports(reportDays = periodSelect.value) {
        const requestId = ++activeRequest;
        loading.hidden = false;
        error.hidden = true;
        results.hidden = true;
        dashboard.setAttribute("aria-busy", "true");

        try {
            const response = await fetch(
                `/api/admin/reports?period=${encodeURIComponent(reportDays)}`,
                {
                    headers: { Accept: "text/html" },
                    cache: "no-store",
                },
            );
            if (!response.ok) throw new Error("Report request failed.");

            const html = await response.text();
            const responseDocument = new DOMParser().parseFromString(html, "text/html");
            const content = responseDocument.querySelector(".admin-reports-content");
            if (!content) throw new Error("Report response is unavailable.");
            if (requestId !== activeRequest) return;

            results.replaceChildren(document.importNode(content, true));
            periodDates.textContent =
                content.dataset.reportPeriodStart + " – " + content.dataset.reportPeriodEnd;
            loading.hidden = true;
            results.hidden = false;
        } catch {
            if (requestId !== activeRequest) return;
            loading.hidden = true;
            error.hidden = false;
        } finally {
            if (requestId === activeRequest) dashboard.setAttribute("aria-busy", "false");
        }
    }

    function updatePeriodUrl(reportDays) {
        const url = new URL(window.location.href);
        url.searchParams.set("period", reportDays);
        window.history.replaceState({}, "", url);
    }

    periodSelect.addEventListener("change", () => {
        updatePeriodUrl(periodSelect.value);
        loadReports(periodSelect.value);
    });
    retryButton.addEventListener("click", () => loadReports(periodSelect.value));
    loadReports(periodSelect.value);
}
