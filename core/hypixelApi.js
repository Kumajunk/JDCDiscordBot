import fs from "fs";
import path from "path";
import zlib from "zlib";
import { config } from "../config/config.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const pendingUpdates = new Set();
const requestQueue = [];
let isQueueProcessing = false;

/**
 * Hypixel API fetch wrapper with exponential backoff
 */
export async function safeHypixelFetch(url, options = {}, maxRetries = 5) {
    let delay = 2000;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const res = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    "API-Key": config.HYPIXEL_API_KEY,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Accept": "application/json"
                }
            });

            if (res.status === 429 || res.status === 403) {
                console.warn(`[${res.status}] Retry ${attempt+1} wait ${delay}ms`);
                await config.sleep(delay);
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
            await config.sleep(delay);
            delay = Math.min(delay * 2, 60000);
        }
    }

    console.error(`[RateLimit] Max retries exceeded for ${url}`);
    return null;
}

/**
 * Queue processing to ensure max 1 request per second
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
            await config.sleep(1000); // Wait 1 second before next request
        }
    }
    isQueueProcessing = false;
}

export function safeHypixelFetchLimited(url, options = {}) {
    return new Promise((resolve, reject) => {
        requestQueue.push({ resolve, reject, url, options });
        processQueue();
    });
}

/**
 * Trigger background update for profile data
 */
export async function triggerBackgroundUpdate(cleanUuid, uuid) {
    if (pendingUpdates.has(cleanUuid)) return;
    pendingUpdates.add(cleanUuid);

    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`;
    try {
        const res = await safeHypixelFetchLimited(url);
        if (res && res.ok) {
            const data = await res.json();
            if (data.success && Array.isArray(data.profiles) && data.profiles.length > 0) {
                const cacheFile = path.join(config.PROFILES_DIR, `${cleanUuid}.json.gz`);
                const compressed = zlib.gzipSync(JSON.stringify(data.profiles));
                await fs.promises.writeFile(cacheFile, compressed);
                console.log(`[QueueUpdated] ${uuid} (Compressed)`);
            }
        }
    } catch (err) {
        console.error(`[BackgroundUpdate] Error for ${uuid}:`, err.message);
    } finally {
        pendingUpdates.delete(cleanUuid);
    }
}

/**
 * Fetches all Skyblock data for a UUID, handling caching and explicit deletion of expired cache.
 * @param {string} uuid
 * @returns {Promise<{ profiles: object[]|null, cleanUuid: string }>}
 */
export async function fetchAllSkyblockData(uuid) {
    if (!uuid) return { profiles: null, cleanUuid: "" };

    const cleanUuid = uuid.replace(/-/g, "");
    const cacheFile = path.join(config.PROFILES_DIR, `${cleanUuid}.json.gz`);

    try {
        if (fs.existsSync(cacheFile)) {
            const stat = await fs.promises.stat(cacheFile);
            const ageMs = Date.now() - stat.mtimeMs;
            const isStale = ageMs > CACHE_TTL_MS;

            if (isStale) {
                // Delete explicitly to save disk space per user requirement
                try {
                    await fs.promises.unlink(cacheFile);
                    console.log(`[Cache Delete] Expired profile cache deleted explicitly: ${cleanUuid}.json.gz`);
                } catch (e) {
                    console.warn(`[Cache Delete Error] ${cacheFile}:`, e.message);
                }
                
                // Trigger background fetch NO - we are already fetch sync below if we deleted it.
                // Just let it fall through to the fresh fetch logic.
            } else {
                try {
                    const compressed = await fs.promises.readFile(cacheFile);
                    const raw = zlib.gunzipSync(compressed).toString("utf8");
                    const profiles = JSON.parse(raw);
                    return { profiles, cleanUuid };
                } catch (readErr) {
                    console.warn(`[Cache Read Error] ${cleanUuid}:`, readErr.message);
                }
            }
        }
    } catch (err) {
        console.error(`[fetchAllSkyblockData] Cache logic error for ${uuid}:`, err.message);
    }

    // No cache or expired and deleted -> Fetch fresh
    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`;
    try {
        const res = await safeHypixelFetchLimited(url);
        if (!res || !res.ok) return { profiles: null, cleanUuid };

        const data = await res.json();
        if (!data.success || !Array.isArray(data.profiles) || data.profiles.length === 0) {
            return { profiles: null, cleanUuid };
        }

        const cacheFileWait = path.join(config.PROFILES_DIR, `${cleanUuid}.json.gz`);
        const compressed = zlib.gzipSync(JSON.stringify(data.profiles));
        await fs.promises.writeFile(cacheFileWait, compressed);
        return { profiles: data.profiles, cleanUuid };
    } catch (err) {
        console.error(`[fetchAllSkyblockData] Fetch error for ${uuid}:`, err.message);
        return { profiles: null, cleanUuid };
    }
}

