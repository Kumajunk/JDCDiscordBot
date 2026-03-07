import { xpToCataLevelDecimal } from '../utils/formatters.js';

export function extractM7SPTime(profiles, cleanUuid) {
    let best = Infinity;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        const timeMs = member?.dungeons?.dungeon_types?.master_catacombs?.fastest_time_s_plus?.["7"];
        if (typeof timeMs === "number" && timeMs > 0 && timeMs < best) best = timeMs;
    }
    return best === Infinity ? null : best / 1000;
}

export function extractF7SPTime(profiles, cleanUuid) {
    let best = Infinity;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        const timeMs = member?.dungeons?.dungeon_types?.catacombs?.fastest_time_s_plus?.["7"];
        if (typeof timeMs === "number" && timeMs > 0 && timeMs < best) best = timeMs;
    }
    return best === Infinity ? null : best / 1000;
}

export function extractMasterSPTime(profiles, cleanUuid, floor) {
    let best = Infinity;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        const timeMs = member?.dungeons?.dungeon_types?.master_catacombs?.fastest_time_s_plus?.[floor.toString()];
        if (typeof timeMs === "number" && timeMs > 0 && timeMs < best) best = timeMs;
    }
    return best === Infinity ? null : best / 1000;
}

export function extractSecretsFound(profiles, cleanUuid) {
    let max = -1;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member) continue;
        const secrets = Number(member.dungeons?.secrets ?? 0);
        if (secrets > max) max = secrets;
    }
    return max > 0 ? max : null;
}

export function extractSecretsAndRuns(profiles, cleanUuid) {
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

export function extractFloorCompletions(profiles, cleanUuid, type) {
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

export function extractKuudraT5(profiles, cleanUuid) {
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

        if (infernal > maxT5) {
            maxT5 = infernal;
            bestProfile = profile.cute_name ?? null;
        }
    }

    if (!foundMember) return { t5: null, profile: null };
    if (!foundKuudraData) return { t5: 0, profile: null };
    return { t5: maxT5, profile: bestProfile };
}

export function extractCataLevel(profiles, cleanUuid) {
    let best = 0;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member?.dungeons?.dungeon_types?.catacombs) continue;
        const xp = member.dungeons.dungeon_types.catacombs.experience ?? 0;
        const lv = xpToCataLevelDecimal(xp);
        if (lv > best) best = lv;
    }
    return best > 0 ? best : null;
}

export function extractClassLevels(profiles, cleanUuid) {
    const best = { healer: 0, mage: 0, berserk: 0, archer: 0, tank: 0 };
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member?.dungeons?.player_classes) continue;
        const c = member.dungeons.player_classes;
        const lv = (exp) => exp ? xpToCataLevelDecimal(exp) : 0;
        if (lv(c.healer?.experience)  > best.healer)  best.healer  = lv(c.healer?.experience);
        if (lv(c.mage?.experience)    > best.mage)    best.mage    = lv(c.mage?.experience);
        if (lv(c.berserk?.experience) > best.berserk) best.berserk = lv(c.berserk?.experience);
        if (lv(c.archer?.experience)  > best.archer)  best.archer  = lv(c.archer?.experience);
        if (lv(c.tank?.experience)    > best.tank)    best.tank    = lv(c.tank?.experience);
    }
    return best;
}

/**
 * Fetches data and uses extractors all at once
 */
export function extractAllStats(profiles, cleanUuid) {
    return {
        cataLevel: extractCataLevel(profiles, cleanUuid),
        classLevels: extractClassLevels(profiles, cleanUuid),
        kuudraT5: extractKuudraT5(profiles, cleanUuid),
        m7sp: extractM7SPTime(profiles, cleanUuid),
        f7sp: extractF7SPTime(profiles, cleanUuid),
        secrets: extractSecretsFound(profiles, cleanUuid),
        secretsAndRuns: extractSecretsAndRuns(profiles, cleanUuid),
        m1sp: extractMasterSPTime(profiles, cleanUuid, 1),
        m2sp: extractMasterSPTime(profiles, cleanUuid, 2),
        m3sp: extractMasterSPTime(profiles, cleanUuid, 3),
        m4sp: extractMasterSPTime(profiles, cleanUuid, 4),
        m5sp: extractMasterSPTime(profiles, cleanUuid, 5),
        m6sp: extractMasterSPTime(profiles, cleanUuid, 6),
        f7comps: extractFloorCompletions(profiles, cleanUuid, 'f7'),
        m1comps: extractFloorCompletions(profiles, cleanUuid, 'm1'),
        m2comps: extractFloorCompletions(profiles, cleanUuid, 'm2'),
        m3comps: extractFloorCompletions(profiles, cleanUuid, 'm3'),
        m4comps: extractFloorCompletions(profiles, cleanUuid, 'm4'),
        m5comps: extractFloorCompletions(profiles, cleanUuid, 'm5'),
        m6comps: extractFloorCompletions(profiles, cleanUuid, 'm6'),
        m7comps: extractFloorCompletions(profiles, cleanUuid, 'm7')
    };
}
