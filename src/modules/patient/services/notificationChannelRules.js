export const notificationChannels = ["WhatsApp", "SMS", "Email"];
const DEFAULT_ENABLED_CHANNEL = "SMS";

export function getEnabledChannelStates(storedPreferences) {
    const preferencesByChannel = new Map();

    storedPreferences.forEach((preference) => {
        const values = preferencesByChannel.get(preference.channel) || [];
        values.push(preference.is_enabled);
        preferencesByChannel.set(preference.channel, values);
    });

    const states = Object.fromEntries(
        notificationChannels.map((channel) => {
            const storedValues = preferencesByChannel.get(channel) || [];
            const isEnabled = storedValues.length
                ? storedValues.some(Boolean)
                : channel === DEFAULT_ENABLED_CHANNEL;

            return [channel, isEnabled];
        }),
    );

    // Preserve the required SMS fallback for legacy records without an enabled channel.
    if (!Object.values(states).some(Boolean)) states[DEFAULT_ENABLED_CHANNEL] = true;
    return states;
}
