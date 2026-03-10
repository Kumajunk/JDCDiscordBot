import fs from "fs";
import path from "path";
import zlib from "zlib";
import { config } from "../config/config.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const pendingUpdates = new Set();
const requestQueue = [];
let isQueueProcessing = false;
let hasLogged403 = false;

async function log403WithPlaywright(url) {
    if (hasLogged403) return;
    hasLogged403 = true;
    
    try {
        const playwright = await import("playwright-core");
        // @sparticuz/chromium exports default
        const chromiumModule = await import("@sparticuz/chromium");
        const chromium = chromiumModule.default || chromiumModule;

        console.log(`[Playwright] Launching browser to check 403 for ${url}`);
        
        const executablePath = await chromium.executablePath();
        const launchOptions = {
            args: chromium.args,
            headless: chromium.headless !== undefined ? chromium.headless : true,
        };

        if (executablePath) {
            launchOptions.executablePath = executablePath;
        } else if (process.platform === 'win32') {
            // ローカルWindows環境で executablePath が取れない場合はシステムにあるChromeを使用する
            launchOptions.channel = 'chrome';
        }

        const browser = await playwright.chromium.launch(launchOptions);
        
        const page = await browser.newPage();
        
        // Cloudflare等にブロックされにくくするための簡易対策
        await page.setExtraHTTPHeaders({
            'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });

        const targetUrl = url.includes("?") ? url + "&key=" + config.HYPIXEL_API_KEY : url + "?key=" + config.HYPIXEL_API_KEY;

        try {
            await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            // Cloudflareの自動リフレッシュ(チャレンジページ)等でのContext消失を防ぐため少し待機
            await page.waitForTimeout(2000); 
        } catch (e) {
            console.warn(`[Playwright] Navigation warning:`, e.message);
        }

        let content = "Failed to get content";
        try {
            content = await page.content();
        } catch (e) {
            console.warn(`[Playwright] Content retrieval warning:`, e.message);
        }

        try {
            await browser.close();
        } catch (e) {
            console.warn(`[Playwright] Browser close warning:`, e.message);
        }
        
        const logDir = path.join(process.cwd(), "logs");
        if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
        }
        
        const filename = `403_error_${Date.now()}.html`;
        fs.writeFileSync(path.join(logDir, filename), content);
        console.log(`[Playwright] 403 page content logged to logs/${filename}`);
    } catch (err) {
        console.warn("[Playwright] Failed to log 403 (libraries likely missing):", err.message);
    }
}

/**
 * Custom error for Hypixel API failures
 */
export class HypixelAPIError extends Error {
    constructor(message, status = null) {
        super(message);
        this.name = "HypixelAPIError";
        this.status = status;
    }
}

/**
 * Hypixel API fetch wrapper with exponential backoff
 */
export async function safeHypixelFetch(url, options = {}, maxRetries = 5) {
    let delay = 2000;
    let attempt = 0;

    while (attempt < maxRetries) {
        let res;
        try {
            res = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    "API-Key": config.HYPIXEL_API_KEY,
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
                    "Accept": "application/json"
                }
            });
        } catch (err) {
            console.error(`[Fetch Error] ${url} attempt ${attempt + 1}`, err.message);
            attempt++;
            if (attempt >= maxRetries) throw new HypixelAPIError(`Max retries exceeded: ${err.message}`);
            await config.sleep(delay);
            delay = Math.min(delay * 2, 60000);
            continue;
        }

        if (res.status === 429 || res.status === 403) {
            console.warn(`[${res.status}] Retry ${attempt+1} wait ${delay}ms`);
            
            if (res.status === 403) {
                // Fire and forget, or await. We'll await so we get the log before retrying.
                await log403WithPlaywright(url);
            }

            await config.sleep(delay);
            delay = Math.min(delay * 2, 60000);
            attempt++;
            continue;
        }

        if (!res.ok) {
            console.warn(`[API Error] HTTP ${res.status} for ${url}`);
            throw new HypixelAPIError(`HTTP Error ${res.status}`, res.status);
        }

        return res;
    }

    console.error(`[RateLimit] Max retries exceeded for ${url}`);
    throw new HypixelAPIError(`Max retries exceeded for ${url}`, 429);
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
        if (err.name === "HypixelAPIError") throw err;
        return { profiles: null, cleanUuid };
    }
}

/**
 * Fetches player data from Hypixel API.
 * @param {string} uuid
 * @returns {Promise<object|null>}
 */
export async function fetchPlayerData(uuid) {
    if (!uuid) return null;
    const url = `https://api.hypixel.net/v2/player?uuid=${uuid}`;
    try {
        const res = await safeHypixelFetchLimited(url);
        if (!res || !res.ok) return null;
        
        const data = await res.json();
        return data.success ? data.player : null;
    } catch (err) {
        console.error(`[fetchPlayerData] Fetch error for ${uuid}:`, err.message);
        if (err.name === "HypixelAPIError") throw err;
        return null;
    }
}

