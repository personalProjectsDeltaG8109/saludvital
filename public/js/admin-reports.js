const reportsPage = document.querySelector(".admin-reports-page");

if (reportsPage) {
    const results = document.querySelector("[data-reports-results]");
    const loading = document.querySelector("[data-reports-loading]");
    const error = document.querySelector("[data-reports-error]");
    const periodDates = document.querySelector("[data-report-period-dates]");
    const dashboard = document.querySelector(".admin-reports");

    async function loadReports() {
        loading.hidden = false;
        error.hidden = true;
        results.hidden = true;
        dashboard.setAttribute("aria-busy", "true");

        try {
            const response = await fetch("/api/admin/reports", {
                headers: { Accept: "text/html" },
                cache: "no-store",
            });
            if (!response.ok) throw new Error("Report request failed.");

            const html = await response.text();
            const responseDocument = new DOMParser().parseFromString(html, "text/html");
            const content = responseDocument.querySelector(".admin-reports-content");
            if (!content) throw new Error("Report response is unavailable.");

            results.replaceChildren(document.importNode(content, true));
            periodDates.textContent =
                content.dataset.reportPeriodStart + " – " + content.dataset.reportPeriodEnd;
            loading.hidden = true;
            results.hidden = false;
        } catch {
            loading.hidden = true;
            error.hidden = false;
        } finally {
            dashboard.setAttribute("aria-busy", "false");
        }
    }

    loadReports();
}
