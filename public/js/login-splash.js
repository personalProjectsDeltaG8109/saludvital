(() => {
    const splash = document.querySelector("[data-login-splash]");
    if (!splash) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fallbackAlreadyFinished = getComputedStyle(splash).visibility === "hidden";

    if (reducedMotion || fallbackAlreadyFinished) {
        splash.remove();
        return;
    }

    splash.dataset.managed = "true";

    const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
    const waitForVisibleImages = async () => {
        const visibleImages = [
            ...document.querySelectorAll(
                ".login-brand-logo, .login-doctor-illustration, .login-mobile-logo, .login-mobile-illustration",
            ),
        ].filter((image) => image.getClientRects().length > 0 && image.complete === false);
        await Promise.race([
            Promise.all(visibleImages.map((image) => image.decode().catch(() => undefined))),
            wait(450),
        ]);
    };

    const dismissSplash = async () => {
        await waitForVisibleImages();
        await wait(650);
        const message = splash.querySelector("[data-splash-message]");
        if (message) message.textContent = "¡Todo listo!";
        splash.classList.add("is-ready");
        await wait(180);
        splash.classList.add("is-dismissing");
        await Promise.race([
            new Promise((resolve) => {
                splash.addEventListener(
                    "animationend",
                    (event) => {
                        if (event.target === splash) resolve();
                    },
                    { once: true },
                );
            }),
            wait(500),
        ]);
        splash.remove();
    };

    dismissSplash().catch(() => splash.remove());
})();
