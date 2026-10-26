const printButton = document.querySelector("[data-print-report]");

function printReport() {
    window.print();
}

printButton?.addEventListener("click", printReport);
window.addEventListener("load", () => window.setTimeout(printReport, 250));
