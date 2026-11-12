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
    const minimumSplashDurationMs = 5000;
    const loadWaitTimeoutMs = 15000;
    const exitAnimationDurationMs = 360;
    splash.dataset.managed = "true";

    const wait = (duration) => new Promise((resolve) => window.setTimeout(resolve, duration));
    const waitForPageLoad = async () => {
        if (document.readyState === "complete") return;

        await new Promise((resolve) => {
            window.addEventListener("load", resolve, { once: true });
        });
    };
    const waitForImage = async (image) => {
        if (!image.complete) {
            await new Promise((resolve) => {
                image.addEventListener("load", resolve, { once: true });
                image.addEventListener("error", resolve, { once: true });
                if (image.complete) resolve();
            });
        }

        if (image.naturalWidth > 0) {
            await image.decode().catch(() => undefined);
        }
    };
    const waitForVisibleImages = async () => {
        const visibleImages = [...document.images].filter(
            (image) => image.getClientRects().length > 0,
        );

        await Promise.all(visibleImages.map(waitForImage));
    };

    const dismissSplash = async () => {
        // A failed or stalled decorative resource must never trap the user on the splash.
        await Promise.race([
            (async () => {
                await waitForPageLoad();
                await waitForVisibleImages();
            })(),
            wait(loadWaitTimeoutMs),
        ]);
        const elapsedSplashTime = performance.now() - splashStartedAt;
        await wait(Math.max(0, minimumSplashDurationMs - elapsedSplashTime));
        splash.classList.add("is-ready", "is-dismissing");
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
