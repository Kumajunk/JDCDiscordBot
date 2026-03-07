/**
 * Formats a time in seconds to a standard dungeon time string like "m:ss".
 * @param {number} seconds 
 * @returns {string} Formatted string
 */
export function formatDungeonTime(seconds) {
    if (typeof seconds !== "number" || seconds <= 0) return "N/A";
    const totalSeconds = Math.floor(seconds);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export const formatM7Time = formatDungeonTime;
export const formatF7Time = formatDungeonTime;

/**
 * Converts milliseconds to "m:ss".
 * @param {number} ms 
 * @returns {string}
 */
export function msToDungeonTime(ms) {
    if (!ms || Number.isNaN(ms)) return "N/A";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Formats level decimal string.
 * @param {number} lv 
 * @returns {string} e.g. "Lv 50" or "Lv 50.3"
 */
export function formatLevel(lv) {
    if (!Number.isFinite(lv)) return "N/A";
    const floored = Math.floor(lv);
    const decimal = (lv - floored).toFixed(1).slice(1);
    return decimal === ".0" ? `Lv ${floored}` : `Lv ${lv.toFixed(1)}`;
}

const cataLevelTotals = [
    50, 125, 235, 395, 625, 955, 1425, 2095, 3045, 4385,
    6275, 8940, 12700, 17960, 25340, 35640, 50040, 70040, 97640, 135640,
    188140, 259640, 356640, 488640, 668640, 911640, 1239640, 1684640, 2284640, 3084640,
    4149640, 5559640, 7459640, 9959640, 13259640, 17559640, 23159640, 30159640, 39559640, 51559640,
    66559640, 85559640, 109559640, 139559640, 177559640, 225559640, 295559640, 360559640, 453559640, 569809640,
];

/**
 * Converts Catacombs XP into a decimal level.
 * @param {number} xp 
 * @returns {number}
 */
export function xpToCataLevelDecimal(xp) {
    if (typeof xp !== "number" || xp < 0) return 0;
    if (xp >= cataLevelTotals[49]) {
        return 50 + (xp - cataLevelTotals[49]) / 200_000_000;
    }

    let currentLevel = 0;
    let accumulatedXp = 0;

    for (let i = 0; i < cataLevelTotals.length; i++) {
        const nextThreshold = cataLevelTotals[i];
        if (xp < nextThreshold) {
            const xpInThisLevel = xp - accumulatedXp;
            const xpNeededForLevel = nextThreshold - accumulatedXp;
            return currentLevel + xpInThisLevel / xpNeededForLevel;
        }
        accumulatedXp = nextThreshold;
        currentLevel++;
    }
    return currentLevel;
}
