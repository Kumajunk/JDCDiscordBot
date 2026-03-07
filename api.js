import env from "./env.js";
const { sleep, HYPIXEL_API_KEY } = env;

// Hypixel API用ラッパー（レートリミット対策 + 指数バックオフ）
async function safeHypixelFetch(url, options = {}, maxRetries = 5) {
    let delay = 2000; // 初回待機2秒
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const res = await fetch(url, {
                ...options,
                headers: {
                    ...options.headers,
                    "API-Key": HYPIXEL_API_KEY
                }
            });

            if (res.status === 429) {
                console.warn(`[RateLimit] 429 detected - waiting ${delay/1000}s (attempt ${attempt + 1}/${maxRetries})`);
                await sleep(delay);
                delay = Math.min(delay * 2, 60_000); // 最大60秒まで指数増加
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

// 同時実行数を制限するバージョン（同時5件まで）
const activeRequests = new Set();

async function safeHypixelFetchLimited(url, options = {}) {
    while (activeRequests.size >= 5) { // ← ここで同時5件に制限（必要なら4や6に変更）
        await sleep(1000); // 1秒待機して再チェック
    }

    activeRequests.add(url);
    try {
        return await safeHypixelFetch(url, options);
    } finally {
        activeRequests.delete(url);
    }
}

async function getM7SPTime(apiKey, uuid) {
    if (!uuid) return null;

    const cleanUuid = uuid.replace(/-/g, "");
    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`;

    try {
        const res = await safeHypixelFetchLimited(url);

        if (res.status === 429) {
            console.warn(`[M7SP API] Rate limit hit for ${uuid}`);
            return null; // 429なら即スキップ
        }

        if (!res.ok) {
            console.warn(`[M7SP API] HTTP ${res.status} for ${uuid}`);
            return null;
        }

        const data = await res.json();
        if (!data.success || !data.profiles?.length) return null;

        let bestM7SP = Infinity; // 最小値を探す

        for (const profile of data.profiles) {
            const member = profile.members?.[cleanUuid];
            if (!member) continue;

            const master = member.dungeons?.dungeon_types?.master_catacombs;
            if (!master) continue;

            const timeMs = master.fastest_time_s_plus?.["7"];
            if (typeof timeMs === "number" && timeMs > 0 && timeMs < bestM7SP) {
                bestM7SP = timeMs;
            }
        }

        return bestM7SP === Infinity ? null : bestM7SP / 1000; // 秒単位に変換
    } catch (err) {
        console.error(`[M7SP API] Fetch error for ${uuid}`, err.message);
        return null;
    }
}

async function getSecretsFound(apiKey, uuid) {
    if (!uuid) return null;

    const cleanUuid = uuid.replace(/-/g, "");
    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${cleanUuid}`;

    try {
        const res = await safeHypixelFetchLimited(url);

        if (res.status === 429) {
            console.warn(`[Secrets API] Rate limit hit for ${uuid}`);
            return null;
        }
        if (!res.ok) {
            console.warn(`[Secrets API] HTTP ${res.status} for ${uuid}`);
            return null;
        }

        const data = await res.json();
        if (!data.success || !Array.isArray(data.profiles) || data.profiles.length === 0) {
            return null;
        }

        let maxSecrets = -1;
        let bestProfileName = null;

        for (const profile of data.profiles) {
            const member = profile.members?.[cleanUuid];
            if (!member) continue;

            const secrets = Number(member.dungeons?.secrets ?? 0);
            if (secrets > maxSecrets) {
                maxSecrets = secrets;
                bestProfileName = profile.cute_name ?? profile.name ?? "Unknown";
            }
        }

        // 0もしくは負の値ならnullを返す（未プレイ扱い）
        if (maxSecrets <= 0) {
            return null;
        }

        // 必要ならここでプロファイル名も保存したい場合はオブジェクトで返すことも可能
        return maxSecrets;

    } catch (err) {
        console.error(`[getSecretsFound] エラー ${uuid}:`, err.message);
        return null;
    }
}

async function getMasterSPTime(apiKey, uuid, floor) {
    if (!uuid) return null;

    const cleanUuid = uuid.replace(/-/g, "");
    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`;

    try {
        const res = await safeHypixelFetchLimited(url);

        if (res.status === 429) {
            console.warn(`[MasterSP API] Rate limit hit for ${uuid} (M${floor})`);
            return null;
        }

        if (!res.ok) {
            console.warn(`[MasterSP API] HTTP ${res.status} for ${uuid}`);
            return null;
        }

        const data = await res.json();
        if (!data.success || !data.profiles?.length) return null;

        let bestTime = Infinity;

        for (const profile of data.profiles) {
            const member = profile.members?.[cleanUuid];
            if (!member) continue;

            const master = member.dungeons?.dungeon_types?.master_catacombs;
            if (!master) continue;

            const timeMs = master.fastest_time_s_plus?.[floor.toString()];
            if (typeof timeMs === "number" && timeMs > 0 && timeMs < bestTime) {
                bestTime = timeMs;
            }
        }

        return bestTime === Infinity ? null : bestTime / 1000; // 秒単位
    } catch (err) {
        console.error(`[MasterSP API] Fetch error for ${uuid} (M${floor})`, err.message);
        return null;
    }
}

async function fetchKuudraT5(apiKey, uuid) {
    const cleanUuid = uuid.replace(/-/g, "");

    let res;
    try {
        res = await fetch(
            `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`,
            { headers: { "API-Key": apiKey } }
        );
    } catch {
        return { t5: null, profile: null };
    }

    if (!res.ok) return { t5: null, profile: null };

    const data = await res.json();
    if (!data.success || !Array.isArray(data.profiles)) {
        return { t5: null, profile: null };
    }

    let maxT5 = 0;
    let bestProfile = null;
    let foundMember = false;
    let foundKuudraData = false;

    for (const profile of data.profiles) {
        // ✅ ここが致命的修正点
        const member = profile.members?.[cleanUuid];
        if (!member) continue;

        foundMember = true;

        const tiers =
            member.nether_island_player_data?.kuudra_completed_tiers;
        if (!tiers) continue;

        foundKuudraData = true;

        const infernal = Number(tiers.infernal ?? 0);

        console.log(
            `[Kuudra Debug] ${cleanUuid} ${infernal} ${profile.cute_name ?? "unknown"}`
        );

        if (infernal > maxT5) {
            maxT5 = infernal;
            bestProfile = profile.cute_name ?? null;
        }
    }

    if (!foundMember) return { t5: null, profile: null };
    if (!foundKuudraData) return { t5: 0, profile: null };

    return {
        t5: maxT5,
        profile: bestProfile
    };
}


// ===== 共通の取得関数（F7/M7 を拡張して M1~M6 対応） =====
/**
 * 指定のフロアのクリア回数を取得（全プロファイルの最大値）
 * @param {string} apiKey
 * @param {string} uuid
 * @param {'f7' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7'} type
 * @returns {Promise<number|null>}
 */
async function getFloorCompletions(apiKey, uuid, type) {
    if (!uuid) return 0;

    const cleanUuid = uuid.replace(/-/g, '');
    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`;

    try {
        const res = await safeHypixelFetchLimited(url);

        if (res?.status === 429) {
            console.warn(`[Completions API] Rate limit for ${uuid} (${type})`);
            return null;
        }
        if (!res?.ok) {
            console.warn(`[Completions API] HTTP ${res?.status || 'unknown'} for ${uuid}`);
            return null;
        }

        const data = await res.json();
        if (!data.success || !data.profiles?.length) return 0;

        let maxComps = 0;

        for (const profile of data.profiles) {
            const member = profile.members?.[cleanUuid];
            if (!member?.dungeons?.dungeon_types) continue;

            let comps = 0;

            if (type === 'f7') {
                comps = Number(member.dungeons.dungeon_types.catacombs?.tier_completions?.['7'] ?? 0);
            } else if (type.startsWith('m')) {
                const floorNum = type.slice(1); // 'm1' → '1'
                comps = Number(member.dungeons.dungeon_types.master_catacombs?.tier_completions?.[floorNum] ?? 0);
            }

            if (comps > maxComps) maxComps = comps;
        }

        console.log(`[Completions] ${uuid} (${type}) → ${maxComps}回`);
        return maxComps;  // 0でも返す（キャッシュ保存用）

    } catch (err) {
        console.error(`[Completions API] Error ${uuid} (${type}):`, err.message);
        return null; // エラー時はnull → 次回再挑戦
    }
}

async function getSecretsAndRuns(apiKey, uuid) {
    if (!uuid) return { secrets: null, totalRuns: null };

    const cleanUuid = uuid.replace(/-/g, "");
    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${cleanUuid}`;

    try {
        const res = await safeHypixelFetchLimited(url);

        if (res.status === 429) return { secrets: null, totalRuns: null };
        if (!res.ok) return { secrets: null, totalRuns: null };

        const data = await res.json();
        if (!data.success || !Array.isArray(data.profiles)) return { secrets: null, totalRuns: null };

        let maxSecrets = -1;
        let bestTotalRuns = 0;

        for (const profile of data.profiles) {
            const member = profile.members?.[cleanUuid];
            if (!member) continue;

            const secrets = Number(member.dungeons?.secrets ?? 0);

            // 総ラン数計算（Normal + Master、F0とtotalを除外）
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
                bestTotalRuns = runs;
            }
        }

        if (maxSecrets <= 0 || bestTotalRuns <= 0) {
            return { secrets: null, totalRuns: null };
        }

        return {
            secrets: maxSecrets,
            totalRuns: bestTotalRuns
        };

    } catch (err) {
        console.error(`[SecretsAndRuns] エラー ${uuid}:`, err.message);
        return { secrets: null, totalRuns: null };
    }
}

// ===== F7 S+ PB 取得関数（M7版をコピーして修正） =====
async function getF7SPTime(apiKey, uuid) {
    if (!uuid) return null;

    const cleanUuid = uuid.replace(/-/g, "");
    const url = `https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`;

    try {
        const res = await safeHypixelFetchLimited(url);

        if (res.status === 429) {
            console.warn(`[F7SP API] Rate limit hit for ${uuid}`);
            return null;
        }

        if (!res.ok) {
            console.warn(`[F7SP API] HTTP ${res.status} for ${uuid}`);
            return null;
        }

        const data = await res.json();
        if (!data.success || !data.profiles?.length) return null;

        let bestF7SP = Infinity;

        for (const profile of data.profiles) {
            const member = profile.members?.[cleanUuid];
            if (!member) continue;

            const catacombs = member.dungeons?.dungeon_types?.catacombs;
            if (!catacombs) continue;

            const timeMs = catacombs.fastest_time_s_plus?.["7"];
            if (typeof timeMs === "number" && timeMs > 0 && timeMs < bestF7SP) {
                bestF7SP = timeMs;
            }
        }

        return bestF7SP === Infinity ? null : bestF7SP / 1000; // 秒単位
    } catch (err) {
        console.error(`[F7SP API] Fetch error for ${uuid}`, err.message);
        return null;
    }
}

export {
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
