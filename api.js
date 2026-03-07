import env from "./env.js";
const { sleep, HYPIXEL_API_KEY } = env;

// Hypixel API wrapper with exponential backoff for rate limiting
async function safeHypixelFetch(url, options = {}, maxRetries = 5) {
    let delay = 2000;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const res = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    "API-Key": HYPIXEL_API_KEY,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "application/json"
                }
            });

            if (res.status === 429 || res.status === 403) {
                console.warn(`[${res.status}]Retry ${attempt+1} wait ${delay}`);
                await sleep(delay);
                delay = Math.min(delay * 2, 60000);
                attempt++;
                continue;
            }

            if (!res.ok) {
                console.warn(`[API Error] HTTP ${res.status} for ${url}`);
                return null;
            }

            return res;
        } catch (err) {
            console.error(`[Fetch Error] ${url} attempt ${attempt + 1}`, err.message);
            attempt++;
            if (attempt >= maxRetries) return null;
            await sleep(delay);
            delay = Math.min(delay * 2, 60_000);
        }
    }

    console.error(`[RateLimit] Max retries exceeded for ${url}`);
    return null;
}

// Request queue: limits Hypixel API calls to 1 per second
const requestQueue = [];
let isQueueProcessing = false;

/**
 * Drains the request queue at a rate of one request per second.
 */
async function processQueue() {
    if (isQueueProcessing) return;
    isQueueProcessing = true;

    while (requestQueue.length > 0) {
        const { resolve, reject, url, options } = requestQueue[0];

        try {
            const res = await safeHypixelFetch(url, options);
            resolve(res);
        } catch (error) {
            reject(error);
        } finally {
            requestQueue.shift();
            await sleep(1000);
        }
    }

    isQueueProcessing = false;
}

/**
 * Rate-limited fetch that queues requests to stay under the Hypixel API limit.
 */
function safeHypixelFetchLimited(url, options = {}) {
    return new Promise((resolve, reject) => {
        requestQueue.push({ resolve, reject, url, options });
        processQueue();
    });
}

// =============================================
// Core: Single unified API fetch per user
// =============================================

/**
 * Short-lived in-memory cache for SkyBlock profile responses.
 * Prevents multiple ranking functions from fetching the same UUID within a short window.
 *
 * Memory safety (designed for 256 MB servers):
 *   - TTL: 5 minutes  — entries expire quickly after use
 *   - Max 200 entries — worst case ~40 MB (200 entries x ~200 KB avg response)
 *   - Periodic cleanup every 1 hour -- actively purges expired entries
 */
const PROFILES_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const PROFILES_CACHE_MAX    = 200;
const profilesCache = new Map(); // cleanUuid -> { profiles, expiresAt }

/**
 * Removes all expired entries from profilesCache.
 * Called periodically to prevent stale data accumulating in memory.
 */
function evictExpiredProfileCache() {
    const now = Date.now();
    let evicted = 0;
    for (const [key, entry] of profilesCache) {
        if (now >= entry.expiresAt) {
            profilesCache.delete(key);
            evicted++;
        }
    }
    if (evicted > 0) {
        console.log(`[ProfileCache] ${evicted}件の期限切れエントリを削除 (残: ${profilesCache.size}件)`);
    }
}

// Cleanup every 1 hour. .unref() prevents this timer from keeping the process alive on shutdown.
setInterval(evictExpiredProfileCache, PROFILES_CACHE_TTL_MS).unref();

/**
 * Fetches ALL SkyBlock profile data for a given UUID with a single API call.
 * Results are cached for PROFILES_CACHE_TTL_MS to prevent redundant requests
 * when multiple ranking functions process the same user in quick succession.
 *
 * @param {string} uuid - Player UUID (with or without dashes)
 * @returns {Promise<{ profiles: object[]|null, cleanUuid: string }>}
 */
async function fetchAllSkyblockData(uuid) {
    if (!uuid) return { profiles: null, cleanUuid: "" };

    const cleanUuid = uuid.replace(/-/g, "");

    // Return cached result if still valid
    const cached = profilesCache.get(cleanUuid);
    if (cached && Date.now() < cached.expiresAt) {
        return { profiles: cached.profiles, cleanUuid };
    }

    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`;

    try {
        const res = await safeHypixelFetchLimited(url);
        if (!res || !res.ok) return { profiles: null, cleanUuid };

        const data = await res.json();
        if (!data.success || !Array.isArray(data.profiles) || data.profiles.length === 0) {
            return { profiles: null, cleanUuid };
        }

        // Enforce max size: flush expired entries first, then evict oldest if still full
        if (profilesCache.size >= PROFILES_CACHE_MAX) {
            evictExpiredProfileCache();
            if (profilesCache.size >= PROFILES_CACHE_MAX) {
                // Delete the oldest inserted entry (Map preserves insertion order)
                profilesCache.delete(profilesCache.keys().next().value);
            }
        }

        profilesCache.set(cleanUuid, {
            profiles:  data.profiles,
            expiresAt: Date.now() + PROFILES_CACHE_TTL_MS,
        });

        return { profiles: data.profiles, cleanUuid };
    } catch (err) {
        console.error(`[fetchAllSkyblockData] Error for ${uuid}:`, err.message);
        return { profiles: null, cleanUuid };
    }
}

// =============================================
// Stat extractors (pure functions, no I/O)
// These operate on the profiles array returned by fetchAllSkyblockData.
// =============================================

/**
 * Extracts the best (fastest) M7 S+ time across all profiles, in seconds.
 * @param {object[]} profiles
 * @param {string} cleanUuid
 * @returns {number|null}
 */
function extractM7SPTime(profiles, cleanUuid) {
    let best = Infinity;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        const timeMs = member?.dungeons?.dungeon_types?.master_catacombs?.fastest_time_s_plus?.["7"];
        if (typeof timeMs === "number" && timeMs > 0 && timeMs < best) best = timeMs;
    }
    return best === Infinity ? null : best / 1000;
}

/**
 * Extracts the best (fastest) F7 S+ time across all profiles, in seconds.
 * @param {object[]} profiles
 * @param {string} cleanUuid
 * @returns {number|null}
 */
function extractF7SPTime(profiles, cleanUuid) {
    let best = Infinity;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        const timeMs = member?.dungeons?.dungeon_types?.catacombs?.fastest_time_s_plus?.["7"];
        if (typeof timeMs === "number" && timeMs > 0 && timeMs < best) best = timeMs;
    }
    return best === Infinity ? null : best / 1000;
}

/**
 * Extracts the best (fastest) Master floor S+ time, in seconds.
 * @param {object[]} profiles
 * @param {string} cleanUuid
 * @param {number} floor - Floor number (1-6)
 * @returns {number|null}
 */
function extractMasterSPTime(profiles, cleanUuid, floor) {
    let best = Infinity;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        const timeMs = member?.dungeons?.dungeon_types?.master_catacombs?.fastest_time_s_plus?.[floor.toString()];
        if (typeof timeMs === "number" && timeMs > 0 && timeMs < best) best = timeMs;
    }
    return best === Infinity ? null : best / 1000;
}

/**
 * Extracts the maximum secrets found across all profiles.
 * @param {object[]} profiles
 * @param {string} cleanUuid
 * @returns {number|null} null if no secrets recorded
 */
function extractSecretsFound(profiles, cleanUuid) {
    let max = -1;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member) continue;
        const secrets = Number(member.dungeons?.secrets ?? 0);
        if (secrets > max) max = secrets;
    }
    return max > 0 ? max : null;
}

/**
 * Extracts the best secrets found AND total runs for the same profile.
 * @param {object[]} profiles
 * @param {string} cleanUuid
 * @returns {{ secrets: number|null, totalRuns: number|null }}
 */
function extractSecretsAndRuns(profiles, cleanUuid) {
    let maxSecrets = -1;
    let bestRuns = 0;

    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member) continue;

        const secrets = Number(member.dungeons?.secrets ?? 0);
        let runs = 0;
        const normal = member.dungeons?.dungeon_types?.catacombs?.tier_completions || {};
        const master = member.dungeons?.dungeon_types?.master_catacombs?.tier_completions || {};

        for (const floor in normal) {
            if (floor !== "total" && floor !== "0") runs += Math.round(normal[floor] || 0);
        }
        for (const floor in master) {
            if (floor !== "total") runs += Math.round(master[floor] || 0);
        }

        if (secrets > maxSecrets) {
            maxSecrets = secrets;
            bestRuns = runs;
        }
    }

    if (maxSecrets <= 0 || bestRuns <= 0) return { secrets: null, totalRuns: null };
    return { secrets: maxSecrets, totalRuns: bestRuns };
}

/**
 * Extracts the max completions for a given floor type across all profiles.
 * @param {object[]} profiles
 * @param {string} cleanUuid
 * @param {'f7'|'m1'|'m2'|'m3'|'m4'|'m5'|'m6'|'m7'} type
 * @returns {number} 0 if none found
 */
function extractFloorCompletions(profiles, cleanUuid, type) {
    let max = 0;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member?.dungeons?.dungeon_types) continue;

        let comps = 0;
        if (type === "f7") {
            comps = Number(member.dungeons.dungeon_types.catacombs?.tier_completions?.["7"] ?? 0);
        } else if (type.startsWith("m")) {
            const floorNum = type.slice(1);
            comps = Number(member.dungeons.dungeon_types.master_catacombs?.tier_completions?.[floorNum] ?? 0);
        }
        if (comps > max) max = comps;
    }
    return max;
}

/**
 * Extracts the highest Kuudra Infernal (T5) completion count across all profiles.
 * @param {object[]} profiles
 * @param {string} cleanUuid
 * @returns {{ t5: number|null, profile: string|null }}
 */
function extractKuudraT5(profiles, cleanUuid) {
    let maxT5 = 0;
    let bestProfile = null;
    let foundMember = false;
    let foundKuudraData = false;

    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member) continue;
        foundMember = true;

        const tiers = member.nether_island_player_data?.kuudra_completed_tiers;
        if (!tiers) continue;
        foundKuudraData = true;

        const infernal = Number(tiers.infernal ?? 0);
        console.log(`[Kuudra Debug] ${cleanUuid} ${infernal} ${profile.cute_name ?? "unknown"}`);

        if (infernal > maxT5) {
            maxT5 = infernal;
            bestProfile = profile.cute_name ?? null;
        }
    }

    if (!foundMember) return { t5: null, profile: null };
    if (!foundKuudraData) return { t5: 0, profile: null };
    return { t5: maxT5, profile: bestProfile };
}

/**
 * Extracts the best Catacombs level (decimal) across all profiles.
 * @param {object[]} profiles
 * @param {string} cleanUuid
 * @param {function(number): number} xpToLevelFn - XP to level conversion function
 * @returns {number|null} null if no dungeon data found
 */
function extractCataLevel(profiles, cleanUuid, xpToLevelFn) {
    let best = 0;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member?.dungeons?.dungeon_types?.catacombs) continue;
        const xp = member.dungeons.dungeon_types.catacombs.experience ?? 0;
        const lv = xpToLevelFn(xp);
        if (lv > best) best = lv;
    }
    return best > 0 ? best : null;
}

/**
 * Extracts the best class level for each class across all profiles.
 * @param {object[]} profiles
 * @param {string} cleanUuid
 * @param {function(number): number} xpToLevelFn - XP to level conversion function
 * @returns {{ healer: number, mage: number, berserk: number, archer: number, tank: number }}
 */
function extractClassLevels(profiles, cleanUuid, xpToLevelFn) {
    const best = { healer: 0, mage: 0, berserk: 0, archer: 0, tank: 0 };
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member?.dungeons?.player_classes) continue;
        const c = member.dungeons.player_classes;
        const lv = (exp) => exp ? xpToLevelFn(exp) : 0;
        if (lv(c.healer?.experience)  > best.healer)  best.healer  = lv(c.healer?.experience);
        if (lv(c.mage?.experience)    > best.mage)    best.mage    = lv(c.mage?.experience);
        if (lv(c.berserk?.experience) > best.berserk) best.berserk = lv(c.berserk?.experience);
        if (lv(c.archer?.experience)  > best.archer)  best.archer  = lv(c.archer?.experience);
        if (lv(c.tank?.experience)    > best.tank)    best.tank    = lv(c.tank?.experience);
    }
    return best;
}

/**
 * Fetches all SkyBlock stats for a user in a single API request.
 * Use this in batch update loops to avoid redundant API calls.
 *
 * @param {string} uuid - Player UUID
 * @param {function(number): number} xpToLevelFn - XP to level conversion (xpToCataLevelDecimal)
 * @returns {Promise<{
 *   cataLevel: number|null,
 *   classLevels: object,
 *   kuudraT5: { t5: number|null, profile: string|null },
 *   m7sp: number|null,
 *   f7sp: number|null,
 *   secrets: number|null,
 *   secretsAndRuns: { secrets: number|null, totalRuns: number|null },
 * }|null>}
 */
async function fetchAndExtractAllForUser(uuid, xpToLevelFn) {
    const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
    if (!profiles) return null;

    return {
        cataLevel:      extractCataLevel(profiles, cleanUuid, xpToLevelFn),
        classLevels:    extractClassLevels(profiles, cleanUuid, xpToLevelFn),
        kuudraT5:       extractKuudraT5(profiles, cleanUuid),
        m7sp:           extractM7SPTime(profiles, cleanUuid),
        f7sp:           extractF7SPTime(profiles, cleanUuid),
        secrets:        extractSecretsFound(profiles, cleanUuid),
        secretsAndRuns: extractSecretsAndRuns(profiles, cleanUuid),
    };
}

// =============================================
// Public API functions
// Each fetches data once and delegates to an extractor.
// =============================================

/**
 * @param {string} apiKey - Unused, kept for backward compatibility
 * @param {string} uuid
 * @returns {Promise<number|null>} M7 S+ PB in seconds
 */
async function getM7SPTime(apiKey, uuid) {
    const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
    if (!profiles) return null;
    return extractM7SPTime(profiles, cleanUuid);
}

/**
 * @param {string} apiKey - Unused, kept for backward compatibility
 * @param {string} uuid
 * @returns {Promise<number|null>} Secrets found, or null if none
 */
async function getSecretsFound(apiKey, uuid) {
    const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
    if (!profiles) return null;
    return extractSecretsFound(profiles, cleanUuid);
}

/**
 * @param {string} apiKey - Unused, kept for backward compatibility
 * @param {string} uuid
 * @param {number} floor - Master floor number (1-6)
 * @returns {Promise<number|null>} S+ PB in seconds
 */
async function getMasterSPTime(apiKey, uuid, floor) {
    const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
    if (!profiles) return null;
    return extractMasterSPTime(profiles, cleanUuid, floor);
}

/**
 * @param {string} apiKey - Unused, kept for backward compatibility
 * @param {string} uuid
 * @returns {Promise<{ t5: number|null, profile: string|null }>}
 */
async function fetchKuudraT5(apiKey, uuid) {
    const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
    if (!profiles) return { t5: null, profile: null };
    return extractKuudraT5(profiles, cleanUuid);
}

/**
 * @param {string} apiKey - Unused, kept for backward compatibility
 * @param {string} uuid
 * @param {'f7'|'m1'|'m2'|'m3'|'m4'|'m5'|'m6'|'m7'} type
 * @returns {Promise<number|null>}
 */
async function getFloorCompletions(apiKey, uuid, type) {
    if (!uuid) return 0;
    const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
    if (!profiles) return null;
    const result = extractFloorCompletions(profiles, cleanUuid, type);
    console.log(`[Completions] ${uuid} (${type}) → ${result}回`);
    return result;
}

/**
 * @param {string} apiKey - Unused, kept for backward compatibility
 * @param {string} uuid
 * @returns {Promise<{ secrets: number|null, totalRuns: number|null }>}
 */
async function getSecretsAndRuns(apiKey, uuid) {
    if (!uuid) return { secrets: null, totalRuns: null };
    const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
    if (!profiles) return { secrets: null, totalRuns: null };
    return extractSecretsAndRuns(profiles, cleanUuid);
}

/**
 * @param {string} apiKey - Unused, kept for backward compatibility
 * @param {string} uuid
 * @returns {Promise<number|null>} F7 S+ PB in seconds
 */
async function getF7SPTime(apiKey, uuid) {
    const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
    if (!profiles) return null;
    return extractF7SPTime(profiles, cleanUuid);
}

export {
    fetchAllSkyblockData,
    fetchAndExtractAllForUser,
    extractCataLevel,
    extractClassLevels,
    extractM7SPTime,
    extractF7SPTime,
    extractMasterSPTime,
    extractSecretsFound,
    extractSecretsAndRuns,
    extractFloorCompletions,
    extractKuudraT5,
    getM7SPTime,
    getSecretsFound,
    getMasterSPTime,
    fetchKuudraT5,
    getFloorCompletions,
    getSecretsAndRuns,
    getF7SPTime,
    safeHypixelFetchLimited,
    safeHypixelFetch
};
