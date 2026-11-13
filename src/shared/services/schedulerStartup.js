// Keep background jobs out of test servers so they cannot alter fixtures or contact providers.
export function startApplicationSchedulers({ nodeEnv, schedulers }) {
    if (nodeEnv === "test") return false;

    for (const startScheduler of schedulers) startScheduler();
    return true;
}
