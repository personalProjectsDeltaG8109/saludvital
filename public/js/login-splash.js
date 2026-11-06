(() => {
    const splash = document.querySelector("[data-login-splash]");
    if (!splash) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const fallbackAlreadyFinished = getComputedStyle(splash).visibility === "hidden";

    if (reducedMotion || fallbackAlreadyFinished) {
        splash.remove();
        return;
    }

    const splashStartedAt = performance.now();
    const minimumSplashDurationMs = 1100;
    const loadWaitTimeoutMs = 15000;
    const completionMessageDurationMs = 180;
    const exitAnimationDurationMs = 360;
    splash.dataset.managed = "true";

    const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
    const waitForPageLoad = async () => {
        if (document.readyState === "complete") return;

        await Promise.race([
            new Promise((resolve) => {
                window.addEventListener("load", resolve, { once: true });
            }),
            wait(loadWaitTimeoutMs),
        ]);
    };
    const waitForVisibleImages = async () => {
        const visibleImages = [...document.images].filter(
            (image) => image.getClientRects().length > 0 && image.complete,
        );

        await Promise.race([
            Promise.all(visibleImages.map((image) => image.decode().catch(() => undefined))),
            wait(1500),
        ]);
    };

    const dismissSplash = async () => {
        await waitForPageLoad();
        await waitForVisibleImages();
        const elapsedTime = performance.now() - splashStartedAt;
        await wait(Math.max(0, minimumSplashDurationMs - elapsedTime));
        const message = splash.querySelector("[data-splash-message]");
        if (message) message.textContent = "¡Todo listo!";
        splash.classList.add("is-ready");
        await wait(completionMessageDurationMs);
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
            wait(exitAnimationDurationMs + 140),
        ]);
        splash.remove();
    };

    dismissSplash().catch(() => splash.remove());
})();
