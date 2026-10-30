document.querySelectorAll("[data-profile-photo]").forEach((photo) => {
    photo.addEventListener("error", () => {
        photo.classList.add("is-broken");
        const fallback = document.createElement("span");
        fallback.setAttribute("aria-hidden", "true");
        fallback.textContent = photo.closest("[data-profile-avatar]")?.dataset.initials || "M";
        photo.parentElement?.append(fallback);
    });
});
