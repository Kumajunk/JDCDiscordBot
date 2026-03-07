import { EmbedBuilder } from "discord.js";
import { config } from "../config/config.js";
import { db } from "../core/database.js";
import { formatDungeonTime } from "../utils/formatters.js";
import { deleteOldRankingMessages, constants } from "../utils/embedUtils.js";

function makeFooter() {
    return { text: "by Mameneko", iconURL: constants.FOOTER_ICON_URL };
}

async function sendSplitRanking(channel, allUsers, { lineFormatter, titleHigh, titleLow }) {
    const ranking50 = allUsers
        .filter((u) => Math.floor(u.cata) >= constants.CATA_HIGH_LEVEL)
        .slice(0, constants.MAX_RANKING_DISPLAY);

    const rankingBelow50 = allUsers
        .filter((u) => u.cata >= 1 && u.cata < constants.CATA_HIGH_LEVEL)
        .slice(0, constants.MAX_RANKING_DISPLAY);

    if (ranking50.length > 0) {
        const embed = new EmbedBuilder()
            .setTitle(titleHigh)
            .setColor(constants.EMBED_COLOR_GOLD)
            .setDescription(ranking50.map(lineFormatter).join("\n") || "該当者なし")
            .setFooter(makeFooter())
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => {});
    }

    if (rankingBelow50.length > 0) {
        const embed = new EmbedBuilder()
            .setTitle(titleLow)
            .setColor(constants.EMBED_COLOR_PURPLE)
            .setDescription(rankingBelow50.map(lineFormatter).join("\n") || "該当者なし")
            .setFooter(makeFooter())
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(() => {});
    }

    return !(ranking50.length === 0 && rankingBelow50.length === 0);
}

// ===== Generic Ranking Sender based on cached stats =====
async function sendGenericRanking(client, configOpts) {
    const { tag, channelId, titleHigh, titleLow, statValueExtractor, filterCondition, sortFunction, lineFormatter } = configOpts;
    if (!channelId) return;

    console.log(`[${tag} Rank] 開始`);
    
    // Convert cached stats to an array usable for ranking
    const rankingData = [];
    for (const [uuid, stat] of Object.entries(db.statsData || {})) {
        if (!stat.discordId) continue;
        const val = statValueExtractor(stat);
        
        if (filterCondition(val)) {
            rankingData.push({
                discordId: stat.discordId,
                ign: stat.ign || "不明",
                value: val,
                cata: stat.cataLevel || 0
            });
        }
    }

    const allUsers = rankingData.sort(sortFunction);

    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) continue;

        try {
            await deleteOldRankingMessages(channel, titleHigh.split(" (")[0]);
        } catch (err) { }

        await sendSplitRanking(channel, allUsers, { lineFormatter, titleHigh, titleLow });
    }
}

// Expose individual ranking functions
export async function sendM7SPRanking(client) {
    return sendGenericRanking(client, {
        tag: "M7SP",
        channelId: config.M7SP_CHANNEL_ID,
        titleHigh: "M7 S+ PB Ranking (Catacombs Lv50+)",
        titleLow: "M7 S+ PB Ranking (Catacombs Lv1〜49)",
        statValueExtractor: s => s.m7SP,
        filterCondition: val => typeof val === "number" && val > 0,
        sortFunction: (a, b) => a.value - b.value, // Fastest first
        lineFormatter: (u, i) => `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${formatDungeonTime(u.value)}**`
    });
}

export async function sendF7SPRanking(client) {
    return sendGenericRanking(client, {
        tag: "F7SP",
        channelId: config.F7SP_CHANNEL_ID,
        titleHigh: "F7 S+ PB Ranking (Catacombs Lv50+)",
        titleLow: "F7 S+ PB Ranking (Catacombs Lv1〜49)",
        statValueExtractor: s => s.f7SP,
        filterCondition: val => typeof val === "number" && val > 0,
        sortFunction: (a, b) => a.value - b.value,
        lineFormatter: (u, i) => `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${formatDungeonTime(u.value)}**`
    });
}

export async function sendSecretsRanking(client) {
    return sendGenericRanking(client, {
        tag: "Secrets",
        channelId: config.SECRETS_RANK_CHANNEL_ID,
        titleHigh: "Secrets Found Ranking (Catacombs Lv50+)",
        titleLow: "Secrets Found Ranking (Catacombs Lv1〜49)",
        statValueExtractor: s => s.secrets,
        filterCondition: val => typeof val === "number" && val > 0,
        sortFunction: (a, b) => b.value - a.value, // Highest first
        lineFormatter: (u, i) => `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${u.value.toLocaleString()}**`
    });
}

export async function sendKuudraT5Ranking(client) {
    const channelId = config.KUUDRA_T5_CHANNEL_ID;
    if (!channelId) return;

    const rankingData = [];
    for (const [uuid, stat] of Object.entries(db.statsData || {})) {
        if (!stat.discordId || typeof stat.kuudraT5 !== "number" || stat.kuudraT5 <= 0) continue;
        rankingData.push({ discordId: stat.discordId, ign: stat.ign || "不明", t5: stat.kuudraT5 });
    }

    if (rankingData.length === 0) return;
    const top25 = rankingData.sort((a, b) => b.t5 - a.t5).slice(0, constants.MAX_RANKING_DISPLAY);

    const lines = top25.map((u, i) => {
        const countStr = u.t5.toLocaleString();
        return u.t5 >= 10000
            ? `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${countStr}回**`
            : `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — ${countStr}回`;
    });

    const embed = new EmbedBuilder()
        .setTitle("Kuudra Infernal (T5) Completions Ranking - Top 25")
        .setColor(top25.some((u) => u.t5 >= 10000) ? constants.EMBED_COLOR_GOLD : constants.EMBED_COLOR_PURPLE)
        .setDescription(lines.join("\n") || "該当者なし")
        .setTimestamp()
        .setFooter(makeFooter());

    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) continue;
        try { await deleteOldRankingMessages(channel, "Kuudra Infernal (T5)"); } catch (e) {}
        await channel.send({ embeds: [embed] }).catch(() => {});
    }
}

export async function sendCataRanking(client) {
    if (!config.CATA50_CHANNEL_ID) return;

    const allUsers = [];
    for (const [uuid, stat] of Object.entries(db.statsData || {})) {
        if (!stat.discordId || !stat.cataLevel) continue;
        allUsers.push({
            discordId: stat.discordId,
            ign: stat.ign || "不明",
            cata: stat.cataLevel
        });
    }

    allUsers.sort((a, b) => b.cata - a.cata);
    const ranking50 = allUsers.filter((u) => u.cata >= constants.CATA_HIGH_LEVEL).slice(0, 30);
    const rankingBelow50 = allUsers.filter((u) => u.cata >= 1 && u.cata < constants.CATA_HIGH_LEVEL).slice(0, constants.MAX_RANKING_DISPLAY);
    const lineFormatter = (u, i) => `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **Lv ${u.cata.toFixed(1)}**`;

    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(config.CATA50_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) continue;

        try { await deleteOldRankingMessages(channel, "Catacombs Lv"); } catch (e) {}

        if (ranking50.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle("Catacombs Lv50+ Ranking")
                .setColor(constants.EMBED_COLOR_GOLD)
                .setDescription(ranking50.map(lineFormatter).join("\n"))
                .setFooter(makeFooter())
                .setTimestamp();
            await channel.send({ embeds: [embed] });
        }
        if (rankingBelow50.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle("Catacombs Lv Ranking (1〜49)")
                .setColor(constants.EMBED_COLOR_PURPLE)
                .setDescription(rankingBelow50.map(lineFormatter).join("\n"))
                .setFooter(makeFooter())
                .setTimestamp();
            await channel.send({ embeds: [embed] });
        }
    }
}

export async function sendMasterCompletionsRanking(client, floor) {
    return sendGenericRanking(client, {
        tag: `M${floor}Comps`,
        channelId: config.M7_COMPLETIONS_CHANNEL_ID,
        titleHigh: `M${floor} Completions Ranking (Catacombs Lv50+)`,
        titleLow: `M${floor} Completions Ranking (Catacombs Lv1〜49)`,
        statValueExtractor: s => s[`m${floor}Comps`],
        filterCondition: val => typeof val === "number" && val > 0,
        sortFunction: (a, b) => b.value - a.value,
        lineFormatter: (u, i) => `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${u.value.toLocaleString()}回**`
    });
}

export async function sendF7CompletionsRanking(client) {
    return sendGenericRanking(client, {
        tag: "F7Comps",
        channelId: config.F7_COMPLETIONS_CHANNEL_ID,
        titleHigh: "F7 Completions Ranking (Catacombs Lv50+)",
        titleLow: "F7 Completions Ranking (Catacombs Lv1〜49)",
        statValueExtractor: s => s.f7Comps,
        filterCondition: val => typeof val === "number" && val > 0,
        sortFunction: (a, b) => b.value - a.value,
        lineFormatter: (u, i) => `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${u.value.toLocaleString()}回**`
    });
}
