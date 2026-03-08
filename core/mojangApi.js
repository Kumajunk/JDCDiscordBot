/**
 * Fetch UUID and IGN resolving from Mojang API.
 * @param {string} ign 
 * @returns {Promise<{uuid: string, ign: string}|null>}
 */
export async function fetchUUID(ign) {
    try {
        const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(ign)}`);
        if (!res.ok) return null;
        const data = await res.json();
        if (!data.id) return null;
        return { uuid: data.id, ign: data.name };
    } catch (e) {
        console.error(`[MojangAPI] Error fetching UUID for ${ign}:`, e.message);
        return null;
    }
}

/**
 * Checks if a Minecraft ID is valid.
 * @param {string} ign 
 * @returns {Promise<boolean>}
 */
export async function isValidMCID(ign) {
    const data = await fetchUUID(ign);
    return !!data;
}
