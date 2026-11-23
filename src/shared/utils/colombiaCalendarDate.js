const COLOMBIA_TIME_ZONE = "America/Bogota";

/** Return a date-only value using Colombia's calendar, regardless of the server timezone. */
export function getColombiaCalendarDate(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: COLOMBIA_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

    return `${values.year}-${values.month}-${values.day}`;
}
