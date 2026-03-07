import { EmbedBuilder } from "discord.js";
import {
    MAX_RANKING_DISPLAY,
    CATA_HIGH_LEVEL,
    EMBED_COLOR_GOLD,
    EMBED_COLOR_PURPLE,
    FOOTER_ICON_URL,
    formatDungeonTime,
    deleteOldRankingMessages,
} from "./utils.js";
import {
    getM7SPTime,
    getF7SPTime,
    getMasterSPTime,
    getSecretsFound,
    fetchKuudraT5,
    getFloorCompletions,
    getSecretsAndRuns,
} from "./api.js";

// ===== 共有コンテキスト =====
// init() で初期化される。index.js 起動時に必ず呼ぶこと。
let client, mcidData, saveMCID, getClassLevels, xpToCataLevelDecimal;
let HYPIXEL_API_KEY, BATCH_SIZE, BATCH_DELAY, CACHE_VALID_MS;
let F7_BATCH_SIZE, F7_BATCH_DELAY, F7_CACHE_VALID_MS;
let SECRETS_RANK_CHANNEL_ID, SECRETS_BATCH_SIZE, SECRETS_BATCH_DELAY, SECRETS_CACHE_VALID_MS;
let SECRETS_PER_RUN_CHANNEL_ID, SECRETS_PER_RUN_BATCH_SIZE, SECRETS_PER_RUN_BATCH_DELAY, SECRETS_PER_RUN_CACHE_VALID_MS;
let M7SP_CHANNEL_ID, F7SP_CHANNEL_ID;
let CATA50_CHANNEL_ID, KUUDRA_T5_CHANNEL_ID;
let KUUDRA_T5_BATCH_SIZE, KUUDRA_T5_BATCH_DELAY, KUUDRA_T5_CACHE_VALID_MS;
let COMPLETIONS_BATCH_SIZE, COMPLETIONS_BATCH_DELAY, COMPLETIONS_CACHE_VALID_MS;
let F7_COMPLETIONS_CHANNEL_ID, M7_COMPLETIONS_CHANNEL_ID;
let CLASS_RANK_CHANNEL_ID, CLASS_AVG_CHANNEL_ID;
let CLASS_BATCH_SIZE, CLASS_BATCH_DELAY, CLASS_CACHE_VALID_MS;
let sleep;

export function initRanking(ctx) {
    client               = ctx.client;
    mcidData             = ctx.mcidData;
    saveMCID             = ctx.saveMCID;
    getClassLevels       = ctx.getClassLevels;
    xpToCataLevelDecimal = ctx.xpToCataLevelDecimal;
    sleep                = ctx.sleep;
    HYPIXEL_API_KEY      = ctx.HYPIXEL_API_KEY;

    BATCH_SIZE      = ctx.BATCH_SIZE;
    BATCH_DELAY     = ctx.BATCH_DELAY;
    CACHE_VALID_MS  = ctx.CACHE_VALID_MS;

    F7_BATCH_SIZE     = ctx.F7_BATCH_SIZE;
    F7_BATCH_DELAY    = ctx.F7_BATCH_DELAY;
    F7_CACHE_VALID_MS = ctx.F7_CACHE_VALID_MS;

    SECRETS_RANK_CHANNEL_ID  = ctx.SECRETS_RANK_CHANNEL_ID;
    SECRETS_BATCH_SIZE       = ctx.SECRETS_BATCH_SIZE;
    SECRETS_BATCH_DELAY      = ctx.SECRETS_BATCH_DELAY;
    SECRETS_CACHE_VALID_MS   = ctx.SECRETS_CACHE_VALID_MS;

    SECRETS_PER_RUN_CHANNEL_ID   = ctx.SECRETS_PER_RUN_CHANNEL_ID;
    SECRETS_PER_RUN_BATCH_SIZE   = ctx.SECRETS_PER_RUN_BATCH_SIZE;
    SECRETS_PER_RUN_BATCH_DELAY  = ctx.SECRETS_PER_RUN_BATCH_DELAY;
    SECRETS_PER_RUN_CACHE_VALID_MS = ctx.SECRETS_PER_RUN_CACHE_VALID_MS;

    M7SP_CHANNEL_ID = ctx.M7SP_CHANNEL_ID;
    F7SP_CHANNEL_ID = ctx.F7SP_CHANNEL_ID;

    CATA50_CHANNEL_ID     = ctx.CATA50_CHANNEL_ID;
    KUUDRA_T5_CHANNEL_ID  = ctx.KUUDRA_T5_CHANNEL_ID;
    KUUDRA_T5_BATCH_SIZE  = ctx.KUUDRA_T5_BATCH_SIZE;
    KUUDRA_T5_BATCH_DELAY = ctx.KUUDRA_T5_BATCH_DELAY;
    KUUDRA_T5_CACHE_VALID_MS = ctx.KUUDRA_T5_CACHE_VALID_MS;

    COMPLETIONS_BATCH_SIZE   = ctx.COMPLETIONS_BATCH_SIZE;
    COMPLETIONS_BATCH_DELAY  = ctx.COMPLETIONS_BATCH_DELAY;
    COMPLETIONS_CACHE_VALID_MS = ctx.COMPLETIONS_CACHE_VALID_MS;

    F7_COMPLETIONS_CHANNEL_ID = ctx.F7_COMPLETIONS_CHANNEL_ID;
    M7_COMPLETIONS_CHANNEL_ID = ctx.M7_COMPLETIONS_CHANNEL_ID;

    CLASS_RANK_CHANNEL_ID = ctx.CLASS_RANK_CHANNEL_ID;
    CLASS_AVG_CHANNEL_ID  = ctx.CLASS_AVG_CHANNEL_ID;
    CLASS_BATCH_SIZE      = ctx.CLASS_BATCH_SIZE;
    CLASS_BATCH_DELAY     = ctx.CLASS_BATCH_DELAY;
    CLASS_CACHE_VALID_MS  = ctx.CLASS_CACHE_VALID_MS;
}

// ===== 共通フッター生成 =====
function makeFooter() {
    return { text: "by Mameneko", iconURL: FOOTER_ICON_URL };
}

// ===== レベル帯ごとにランキングデータを分割して送信する共通ロジック =====
// allUsers: { discordId, ign, [scoreKey], cata } の配列（降順または昇順ずみ）
// embedBuilder: (title, color, lines) => EmbedBuilder を返す関数
// lineFormatter: (u, i) => string
// titleHigh / titleLow: Embed のタイトル文字列
async function sendSplitRanking(channel, allUsers, { lineFormatter, titleHigh, titleLow }) {
    const ranking50 = allUsers
        .filter((u) => Math.floor(u.cata) >= CATA_HIGH_LEVEL)
        .slice(0, MAX_RANKING_DISPLAY);

    const rankingBelow50 = allUsers
        .filter((u) => u.cata >= 1 && u.cata < CATA_HIGH_LEVEL)
        .slice(0, MAX_RANKING_DISPLAY);

    if (ranking50.length > 0) {
        const embed = new EmbedBuilder()
            .setTitle(titleHigh)
            .setColor(EMBED_COLOR_GOLD)
            .setDescription(ranking50.map(lineFormatter).join("\n") || "該当者なし")
            .setFooter(makeFooter())
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(console.error);
    }

    if (rankingBelow50.length > 0) {
        const embed = new EmbedBuilder()
            .setTitle(titleLow)
            .setColor(EMBED_COLOR_PURPLE)
            .setDescription(rankingBelow50.map(lineFormatter).join("\n") || "該当者なし")
            .setFooter(makeFooter())
            .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(console.error);
    }

    if (ranking50.length === 0 && rankingBelow50.length === 0) {
        return false; // 両方とも該当者なし
    }
    return true;
}

// ===== S+ PB ランキング送信（M7 / F7 共通） =====
// config: { tag, channelId, cacheKey, updatedKey, batchSize, batchDelay, cacheValidMs, fetchFn, titleHigh, titleLow }
async function sendSPRanking(config) {
    const {
        tag, channelId, cacheKey, updatedKey,
        batchSize, batchDelay, cacheValidMs, fetchFn,
        titleHigh, titleLow,
    } = config;

    if (!channelId) {
        console.warn(`[${tag}] チャンネルID 未設定`);
        return;
    }

    console.log(`[${tag} Rank] 開始`);

    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(channelId);
        if (!channel || !channel.isTextBased()) continue;

        // 古いメッセージ削除
        try {
            await deleteOldRankingMessages(channel, titleHigh.split(" (")[0]);
        } catch (err) {
            console.error(`[${tag}] 古いメッセージ削除エラー`, err);
        }

        const rankingData = [];
        const users = Object.entries(mcidData.users ?? {});
        console.log(`[${tag}] 対象ユーザー数: ${users.length}`);

        // バッチ処理（API取得）
        for (let i = 0; i < users.length; i += batchSize) {
            const batch = users.slice(i, i + batchSize);
            console.log(`[${tag}] バッチ ${Math.floor(i / batchSize) + 1}/${Math.ceil(users.length / batchSize)} 開始`);

            for (const [discordId, user] of batch) {
                if (!user.uuid) continue;

                let pbSeconds = null;

                // キャッシュ優先
                if (user[cacheKey] && user[updatedKey] && Date.now() - user[updatedKey] < cacheValidMs) {
                    pbSeconds = user[cacheKey];
                } else {
                    pbSeconds = await fetchFn(HYPIXEL_API_KEY, user.uuid);
                    if (pbSeconds !== null && pbSeconds > 0) {
                        user[cacheKey]   = pbSeconds;
                        user[updatedKey] = Date.now();
                        console.log(`[${tag}] 更新＆保存: ${user.ign} → ${pbSeconds.toFixed(2)}s`);
                    }
                }

                if (pbSeconds !== null && pbSeconds > 0) {
                    rankingData.push({
                        discordId,
                        ign: user.ign ?? "不明",
                        pb: pbSeconds,
                        cata: typeof user.lastCataLevel === "number" ? user.lastCataLevel : 0,
                    });
                }
            }

            if (i + batchSize < users.length) await sleep(batchDelay);
        }

        saveMCID();

        // ランキング作成（昇順 = 速い順）
        const allUsers = rankingData.filter((u) => u.pb > 0).sort((a, b) => a.pb - b.pb);

        const lineFormatter = (u, i) =>
            `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${formatDungeonTime(u.pb)}**`;

        const hasResult = await sendSplitRanking(channel, allUsers, { lineFormatter, titleHigh, titleLow });

        if (!hasResult) {
            if (allUsers.length === 0) {
                await channel.send(`📭 ${tag} PBデータを登録しているユーザーはいません`).catch(() => {});
            } else {
                await channel.send(`📊 ${tag} PBは登録されていますが、Catacombsレベルが有効範囲内のユーザーがいません`).catch(() => {});
            }
        }

        console.log(`[${tag}] ${guild.name} のランキング更新完了`);
    }

    console.log(`[${tag} Rank] 全処理終了`);
}

// ===== M7 S+ PB ランキング送信 =====
export async function sendM7SPRanking() {
    return sendSPRanking({
        tag:          "M7SP",
        channelId:    M7SP_CHANNEL_ID,
        cacheKey:     "lastM7SP",
        updatedKey:   "lastM7SPUpdated",
        batchSize:    BATCH_SIZE,
        batchDelay:   BATCH_DELAY,
        cacheValidMs: CACHE_VALID_MS,
        fetchFn:      getM7SPTime,
        titleHigh:    "M7 S+ PB Ranking (Catacombs Lv50+)",
        titleLow:     "M7 S+ PB Ranking (Catacombs Lv1〜49)",
    });
}

// ===== F7 S+ PB ランキング送信 =====
export async function sendF7SPRanking() {
    return sendSPRanking({
        tag:          "F7SP",
        channelId:    F7SP_CHANNEL_ID,
        cacheKey:     "lastF7SP",
        updatedKey:   "lastF7SPUpdated",
        batchSize:    F7_BATCH_SIZE,
        batchDelay:   F7_BATCH_DELAY,
        cacheValidMs: F7_CACHE_VALID_MS,
        fetchFn:      getF7SPTime,
        titleHigh:    "F7 S+ PB Ranking (Catacombs Lv50+)",
        titleLow:     "F7 S+ PB Ranking (Catacombs Lv1〜49)",
    });
}

// ===== Catacombs Lv ランキング送信 =====
export async function sendCataRanking() {
    if (!CATA50_CHANNEL_ID) return;

    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(CATA50_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) continue;

        // 既存ランキングメッセージ削除
        try {
            await deleteOldRankingMessages(channel, "Catacombs Lv");
        } catch (err) {
            console.error("古いランキング削除失敗", err);
        }

        const allUsers = Object.entries(mcidData.users)
            .map(([id, u]) => ({
                discordId: id,
                ign: u.ign ?? "不明",
                level: typeof u.lastCataLevel === "number" ? u.lastCataLevel : 0,
                cata:  typeof u.lastCataLevel === "number" ? u.lastCataLevel : 0,
            }))
            .filter((u) => u.level > 0)
            .sort((a, b) => b.level - a.level);

        const lineFormatter = (u, i) =>
            `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${u.level >= 50 ? `Lv ${u.level.toFixed(1)}` : `Lv ${u.level.toFixed(1)}`}**`;

        // Lv50+ (上位30人)
        const ranking50 = allUsers.filter((u) => u.level >= CATA_HIGH_LEVEL).slice(0, 30);
        if (ranking50.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle("Catacombs Lv50+ Ranking")
                .setColor(EMBED_COLOR_GOLD)
                .setDescription(ranking50.map(lineFormatter).join("\n") || "該当者なし")
                .setFooter(makeFooter())
                .setTimestamp();
            await channel.send({ embeds: [embed] });
        }

        // Lv1〜49
        const rankingBelow50 = allUsers
            .filter((u) => u.cata >= 1 && u.cata < CATA_HIGH_LEVEL)
            .slice(0, MAX_RANKING_DISPLAY);
        if (rankingBelow50.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle("Catacombs Lv Ranking (1〜49)")
                .setColor(EMBED_COLOR_PURPLE)
                .setDescription(rankingBelow50.map(lineFormatter).join("\n") || "該当者なし")
                .setFooter(makeFooter())
                .setTimestamp();
            await channel.send({ embeds: [embed] });
        }

        if (ranking50.length === 0 && rankingBelow50.length === 0) {
            await channel.send("📭 Catacombsデータを登録しているユーザーはいません");
        }
    }
}

// ===== Secrets Found ランキング送信 =====
export async function sendSecretsRanking() {
    if (!SECRETS_RANK_CHANNEL_ID) {
        console.warn("[SecretsRank] SECRETS_RANK_CHANNEL_ID 未設定");
        return;
    }

    console.log("[Secrets Rank] 開始");

    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(SECRETS_RANK_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) continue;

        // 古いメッセージ削除
        try {
            await deleteOldRankingMessages(channel, "Secrets Found Ranking");
        } catch (err) {
            console.error("[SecretsRank] 古いメッセージ削除エラー", err);
        }

        const rankingData = [];
        const users = Object.entries(mcidData.users ?? {});
        console.log(`[Secrets] 対象ユーザー数: ${users.length}`);

        // バッチ処理
        for (let i = 0; i < users.length; i += SECRETS_BATCH_SIZE) {
            const batch = users.slice(i, i + SECRETS_BATCH_SIZE);
            console.log(`[Secrets] バッチ ${Math.floor(i / SECRETS_BATCH_SIZE) + 1} 開始`);

            for (const [discordId, user] of batch) {
                if (!user.uuid) continue;

                let secrets = null;

                // キャッシュ優先
                if (user.lastSecrets && user.lastSecretsUpdated && Date.now() - user.lastSecretsUpdated < SECRETS_CACHE_VALID_MS) {
                    secrets = user.lastSecrets;
                } else {
                    secrets = await getSecretsFound(HYPIXEL_API_KEY, user.uuid);
                    if (secrets !== null && secrets > 0) {
                        user.lastSecrets        = secrets;
                        user.lastSecretsUpdated = Date.now();
                        console.log(`[Secrets] 更新: ${user.ign} → ${secrets.toLocaleString()}`);
                    }
                }

                if (secrets !== null && secrets > 0) {
                    rankingData.push({
                        discordId,
                        ign:     user.ign ?? "不明",
                        secrets,
                        cata: typeof user.lastCataLevel === "number" ? user.lastCataLevel : 0,
                    });
                }
            }

            if (i + SECRETS_BATCH_SIZE < users.length) await sleep(SECRETS_BATCH_DELAY);
        }

        saveMCID();

        const allUsers = rankingData
            .filter((u) => u.secrets > 0)
            .sort((a, b) => b.secrets - a.secrets); // 降順

        const lineFormatter = (u, i) =>
            `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${u.secrets.toLocaleString()}**`;

        const hasResult = await sendSplitRanking(channel, allUsers, {
            lineFormatter,
            titleHigh: "Secrets Found Ranking (Catacombs Lv50+)",
            titleLow:  "Secrets Found Ranking (Catacombs Lv1〜49)",
        });

        if (!hasResult) {
            if (allUsers.length === 0) {
                await channel.send("📭 Secretsデータを登録しているユーザーはいません").catch(() => {});
            } else {
                await channel.send("📊 Secretsは記録されていますが、Catacombsレベルの範囲内のユーザーがいません").catch(() => {});
            }
        }

        console.log(`[SecretsRank] ${guild.name} のランキング更新完了`);
    }

    console.log("[SecretsRank] 全処理終了");
}

// ===== Kuudra T5 Completions ランキング送信 =====
export async function sendKuudraT5Ranking() {
    if (!KUUDRA_T5_CHANNEL_ID) {
        console.warn("[KuudraT5] KUUDRA_T5_CHANNEL_ID が設定されていません");
        return;
    }

    console.log("[KuudraT5 Rank] 開始");

    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(KUUDRA_T5_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) {
            console.warn(`[KuudraT5] チャンネルが見つからない: ${KUUDRA_T5_CHANNEL_ID}`);
            continue;
        }

        // 古いメッセージ削除
        try {
            const fetched = await channel.messages.fetch({ limit: 100 });
            const toDelete = fetched.filter(
                (msg) =>
                    msg.author.id === client.user.id &&
                    msg.embeds?.length > 0 &&
                    (msg.embeds[0].title?.includes("Kuudra Infernal") ||
                    msg.embeds[0].title?.includes("Kuudra T5") ||
                    msg.embeds[0].title?.includes("Completions Ranking - Top 25"))
            );
            if (toDelete.size > 0) {
                await channel.bulkDelete(toDelete, true);
                console.log(`[KuudraT5] 古いメッセージを ${toDelete.size} 件削除`);
            } else {
                console.log("[KuudraT5] 削除対象の古いメッセージが見つかりませんでした");
            }
        } catch (err) {
            console.error("[KuudraT5] 古いメッセージ削除エラー:", err.message);
            if (err.code === 50034) {
                console.warn("[KuudraT5] 一部のメッセージが古すぎて削除不可（2週間以上前）");
            }
        }

        const rankingData = [];
        const users = Object.entries(mcidData.users ?? {});
        console.log(`[KuudraT5] 処理対象ユーザー数: ${users.length}`);

        // バッチ処理（API取得）
        for (let i = 0; i < users.length; i += KUUDRA_T5_BATCH_SIZE) {
            const batch = users.slice(i, i + KUUDRA_T5_BATCH_SIZE);

            for (const [discordId, user] of batch) {
                if (!user?.uuid) continue;

                let t5 = null;

                // キャッシュ優先
                if (
                    user.lastKuudraT5 !== undefined &&
                    user.lastKuudraT5 !== null &&
                    user.lastKuudraUpdated &&
                    Date.now() - user.lastKuudraUpdated < KUUDRA_T5_CACHE_VALID_MS
                ) {
                    t5 = user.lastKuudraT5;
                    console.log(`[KuudraT5] キャッシュ使用: ${user.ign || discordId} → ${t5}回`);
                } else {
                    try {
                        const { t5: fetchedT5 } = await fetchKuudraT5(HYPIXEL_API_KEY, user.uuid);
                        if (fetchedT5 !== null) {
                            t5 = fetchedT5;
                            user.lastKuudraT5      = t5;
                            user.lastKuudraUpdated = Date.now();
                            console.log(`[KuudraT5] 更新: ${user.ign || discordId} → ${t5.toLocaleString() || "0"}回`);
                        } else {
                            console.warn(`[KuudraT5] APIからnull返却: ${user.ign || discordId} (保存せず)`);
                        }
                    } catch (err) {
                        console.error(`[KuudraT5] ${user.ign || discordId} の取得エラー`, err.message);
                    }
                }

                if (typeof t5 === "number" && t5 > 0) {
                    rankingData.push({ discordId, ign: user.ign ?? "不明", t5 });
                }
            }

            if (i + KUUDRA_T5_BATCH_SIZE < users.length) await sleep(KUUDRA_T5_BATCH_DELAY);
        }

        saveMCID();

        if (rankingData.length === 0) {
            await channel.send("📭 Kuudra T5 Completionsデータを持つユーザーがいません").catch(console.error);
            continue;
        }

        const top25 = rankingData.sort((a, b) => b.t5 - a.t5).slice(0, MAX_RANKING_DISPLAY);

        const lines = top25.map((u, i) => {
            const countStr = u.t5.toLocaleString();
            // 10000回以上なら太字強調
            return u.t5 >= 10000
                ? `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${countStr}回**`
                : `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — ${countStr}回`;
        });

        const embed = new EmbedBuilder()
            .setTitle("Kuudra Infernal (T5) Completions Ranking - Top 25")
            .setColor(EMBED_COLOR_PURPLE)
            .setDescription(lines.join("\n") || "該当者なし")
            .setTimestamp()
            .setFooter(makeFooter());

        // 10k+が1人でもいれば金色に
        if (top25.some((u) => u.t5 >= 10000)) embed.setColor(EMBED_COLOR_GOLD);

        await channel.send({ embeds: [embed] }).catch(console.error);
        console.log(`[KuudraT5] ${guild.name} のランキング更新完了`);
    }

    console.log("[KuudraT5 Rank] 全サーバー処理終了");
}

// ===== Class Average ランキング送信 =====
export async function sendClassAverageRanking() {
    if (!CLASS_AVG_CHANNEL_ID) {
        console.warn("[ClassAvgRank] CLASS_AVG_CHANNEL_ID 未設定");
        return;
    }

    console.log("[ClassAvgRank] 開始");

    for (const guild of client.guilds.cache.values()) {
        const channel = guild.channels.cache.get(CLASS_AVG_CHANNEL_ID);
        if (!channel || !channel.isTextBased()) continue;

        // 古いメッセージ削除
        try {
            await deleteOldRankingMessages(channel, "Class Average Ranking");
        } catch (err) {
            console.error("[ClassAvgRank] 古いメッセージ削除エラー", err);
        }

        const rankingData = [];
        const users = Object.entries(mcidData.users ?? {});
        console.log(`[ClassAvgRank] 対象ユーザー数: ${users.length}`);

        for (let i = 0; i < users.length; i += CLASS_BATCH_SIZE) {
            const batch = users.slice(i, i + CLASS_BATCH_SIZE);

            for (const [discordId, user] of batch) {
                if (!user.uuid) continue;

                let levels = null;

                if (user.lastClassLevels && user.lastClassLevelsUpdated && Date.now() - user.lastClassLevelsUpdated < CLASS_CACHE_VALID_MS) {
                    levels = user.lastClassLevels;
                } else {
                    levels = await getClassLevels(HYPIXEL_API_KEY, user.uuid);
                    if (Object.values(levels).some((lv) => lv > 0)) {
                        user.lastClassLevels        = levels;
                        user.lastClassLevelsUpdated = Date.now();
                        console.log(`[ClassAvgRank] 更新: ${user.ign}`);
                    }
                }

                if (levels && Object.values(levels).some((lv) => lv > 0)) {
                    const validLevels = Object.values(levels).filter((lv) => lv > 0);
                    const avg = validLevels.reduce((a, b) => a + b, 0) / validLevels.length;

                    rankingData.push({
                        discordId,
                        ign:      user.ign ?? "不明",
                        avgLevel: avg,
                        cata:     typeof user.lastCataLevel === "number" ? user.lastCataLevel : 0,
                    });
                }
            }

            if (i + CLASS_BATCH_SIZE < users.length) await sleep(CLASS_BATCH_DELAY);
        }

        saveMCID();

        if (rankingData.length === 0) {
            await channel.send("📭 クラス平均が計算できるユーザーがいません").catch(() => {});
            continue;
        }

        const lineFormatter = (u, i) =>
            `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — Lv ${u.avgLevel.toFixed(1)}`;

        const highCata = rankingData.filter((u) => u.cata >= CATA_HIGH_LEVEL).sort((a, b) => b.avgLevel - a.avgLevel).slice(0, MAX_RANKING_DISPLAY);
        const lowCata  = rankingData.filter((u) => u.cata >= 1 && u.cata < CATA_HIGH_LEVEL).sort((a, b) => b.avgLevel - a.avgLevel).slice(0, MAX_RANKING_DISPLAY);

        if (highCata.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle("Class Average Ranking (Catacombs Lv50+)")
                .setColor(EMBED_COLOR_GOLD)
                .setDescription(highCata.map(lineFormatter).join("\n") || "該当者なし")
                .setFooter(makeFooter())
                .setTimestamp();
            await channel.send({ embeds: [embed] }).catch(console.error);
        }

        if (lowCata.length > 0) {
            const embed = new EmbedBuilder()
                .setTitle("Class Average Ranking (Catacombs Lv1〜49)")
                .setColor(EMBED_COLOR_PURPLE)
                .setDescription(lowCata.map(lineFormatter).join("\n") || "該当者なし")
                .setFooter(makeFooter())
                .setTimestamp();
            await channel.send({ embeds: [embed] }).catch(console.error);
        }

        if (highCata.length === 0 && lowCata.length === 0) {
            await channel.send("📭 クラス平均は記録されていますが、Catacombsレベルの範囲内のユーザーがいません").catch(console.error);
        }

        console.log(`[ClassAvgRank] ${guild.name} 更新完了`);
    }

    console.log("[ClassAvgRank] 全処理終了");
}

// ===== M1〜M6 S+ PB ランキング送信 =====
export async function sendMasterSPRanking(floor) {
  if (floor < 1 || floor > 6) {
    console.warn(`[MasterSP] 無効なフロア指定: M${floor}`);
    return;
  }

  const channelId = process.env.MASTER_SP_CHANNEL_ID;
  if (!channelId) {
    console.warn(`[M${floor}SP] MASTER_SP_CHANNEL_ID が設定されていません`);
    return;
  }

  console.log(`[M${floor}SP Rank] 開始`);

  const guild = client.guilds.cache.first();
  const channel = guild?.channels.cache.get(channelId);
  if (!channel || !channel.isTextBased()) {
    console.warn(`[M${floor}SP] チャンネルが見つからない: ${channelId}`);
    return;
  }

  // 古いメッセージ削除
  try {
    await deleteOldRankingMessages(channel, `M${floor} S+ PB Ranking`);
  } catch (err) {
    console.error(`[M${floor}SP] 古いメッセージ削除エラー`, err);
  }

  const rankingData = [];
  const users = Object.entries(mcidData.users ?? {});
  const cacheKey   = `lastM${floor}SP`;
  const updatedKey = `lastM${floor}SPUpdated`;

  console.log(`[M${floor}SP] 対象ユーザー数: ${users.length}`);

  for (let i = 0; i < users.length; i += BATCH_SIZE) {
    const batch = users.slice(i, i + BATCH_SIZE);
    console.log(`[M${floor}SP] バッチ ${Math.floor(i / BATCH_SIZE) + 1} 開始`);

    for (const [discordId, user] of batch) {
      if (!user.uuid) continue;

      let pbSeconds = null;

      if (user[cacheKey] && user[updatedKey] && Date.now() - user[updatedKey] < CACHE_VALID_MS) {
        pbSeconds = user[cacheKey];
      } else {
        pbSeconds = await getMasterSPTime(HYPIXEL_API_KEY, user.uuid, floor);
        if (pbSeconds !== null && pbSeconds > 0) {
          user[cacheKey]   = pbSeconds;
          user[updatedKey] = Date.now();
          console.log(`[M${floor}SP] 更新＆保存: ${user.ign} → ${pbSeconds.toFixed(2)}s`);
        }
      }

      if (pbSeconds !== null && pbSeconds > 0) {
        rankingData.push({
          discordId,
          ign:  user.ign ?? "不明",
          pb:   pbSeconds,
          cata: typeof user.lastCataLevel === "number" ? user.lastCataLevel : 0,
        });
      }
    }

    if (i + BATCH_SIZE < users.length) await sleep(BATCH_DELAY);
  }

  saveMCID();

  const allUsers = rankingData.filter((u) => u.pb > 0).sort((a, b) => a.pb - b.pb);
  const lineFormatter = (u, i) => `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${formatDungeonTime(u.pb)}**`;

  const hasResult = await sendSplitRanking(channel, allUsers, {
    lineFormatter,
    titleHigh: `M${floor} S+ PB Ranking (Catacombs Lv50+)`,
    titleLow:  `M${floor} S+ PB Ranking (Catacombs Lv1〜49)`,
  });

  if (!hasResult) {
    if (allUsers.length === 0) {
      await channel.send(`📭 M${floor} S+ PBデータを登録しているユーザーはいません`).catch(() => {});
    } else {
      await channel.send(`📊 M${floor} S+ PBは登録されていますが、Catacombsレベルが有効範囲内のユーザーがいません`).catch(() => {});
    }
  }

  console.log(`[M${floor}SP] 更新完了`);
}

// ===== M1〜M6/F7/M7 Completions ランキング送信（共通） =====
async function sendCompletionsRanking({ tag, channelId, cacheKey, updatedKey, titleHigh, titleLow, fetchType }) {
  if (!channelId) {
    console.warn(`[${tag}] チャンネルID が設定されていません`);
    return;
  }

  console.log(`[${tag} Rank] 開始`);

  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) {
      console.warn(`[${tag}] チャンネルが見つからないかテキストチャンネルではありません: ${channelId}`);
      continue;
    }

    // 古いメッセージ削除
    try {
      await deleteOldRankingMessages(channel, titleHigh.split(" (")[0]);
    } catch (err) {
      console.error(`[${tag}] 古いメッセージ削除中にエラー`, err.message);
    }

    const rankingData = [];
    const users = Object.entries(mcidData.users ?? {});
    console.log(`[${tag}] 処理対象ユーザー数: ${users.length}`);

    for (let i = 0; i < users.length; i += COMPLETIONS_BATCH_SIZE) {
      const batch = users.slice(i, i + COMPLETIONS_BATCH_SIZE);
      console.log(`[${tag}] バッチ ${Math.floor(i / COMPLETIONS_BATCH_SIZE) + 1} 開始 (${batch.length}人)`);

      for (const [discordId, user] of batch) {
        if (!user?.uuid) continue;

        let comps = null;

        if (user[cacheKey] !== undefined && user[updatedKey] && Date.now() - user[updatedKey] < COMPLETIONS_CACHE_VALID_MS) {
          comps = user[cacheKey];
          console.log(`[${tag}] キャッシュ使用: ${user.ign || discordId} → ${comps}回`);
        } else {
          comps = await getFloorCompletions(HYPIXEL_API_KEY, user.uuid, fetchType);
          if (comps === null) {
            comps = user[cacheKey] ?? 0;
            console.warn(`[${tag}] API失敗 → 前回値使用: ${user.ign || discordId}`);
          }
          user[cacheKey]   = comps;
          user[updatedKey] = Date.now();
          console.log(`[${tag}] 更新: ${user.ign || discordId} → ${comps}回`);
        }

        if (typeof comps === "number" && comps > 0) {
          rankingData.push({
            discordId,
            ign:  user.ign ?? "不明",
            comps,
            cata: typeof user.lastCataLevel === "number" ? user.lastCataLevel : 0,
          });
        }
      }

      if (i + COMPLETIONS_BATCH_SIZE < users.length) await sleep(COMPLETIONS_BATCH_DELAY);
    }

    saveMCID();

    if (rankingData.length === 0) {
      console.log(`[${tag}] 有効なデータなし`);
      await channel.send(`📭 ${tag} Completionsデータを持つユーザーがいません`).catch(console.error);
      continue;
    }

    const allUsers = rankingData.sort((a, b) => b.comps - a.comps);
    const lineFormatter = (u, i) =>
      `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${u.comps.toLocaleString()}回**`;

    const hasResult = await sendSplitRanking(channel, allUsers, { lineFormatter, titleHigh, titleLow });

    if (!hasResult) {
      await channel.send(`📭 ${tag} Completionsデータはありますが、Catacombsレベルの範囲内のユーザーがいません`).catch(console.error);
    }

    console.log(`[${tag}] ${guild?.name ?? "不明"} のランキング更新完了`);
  }

  console.log(`[${tag} Rank] 全サーバー処理終了`);
}

// ===== F7 Completions ランキング送信 =====
export async function sendF7CompletionsRanking() {
  return sendCompletionsRanking({
    tag:         "F7Completions",
    channelId:   F7_COMPLETIONS_CHANNEL_ID,
    cacheKey:    "lastF7Comps",
    updatedKey:  "lastF7CompsUpdated",
    fetchType:   "f7",
    titleHigh:   "F7 Completions Ranking (Catacombs Lv50+)",
    titleLow:    "F7 Completions Ranking (Catacombs Lv1〜49)",
  });
}

// ===== M7 Completions ランキング送信 =====
export async function sendM7CompletionsRanking() {
  return sendCompletionsRanking({
    tag:        "M7Completions",
    channelId:  M7_COMPLETIONS_CHANNEL_ID,
    cacheKey:   "lastM7Comps",
    updatedKey: "lastM7CompsUpdated",
    fetchType:  "m7",
    titleHigh:  "M7 Completions Ranking (Catacombs Lv50+)",
    titleLow:   "M7 Completions Ranking (Catacombs Lv1〜49)",
  });
}

// ===== M1〜M6 Completions ランキング送信 =====
export async function sendMasterCompletionsRanking(floor) {
  const channelId = process.env[`M${floor}_COMPLETIONS_CHANNEL_ID`];
  return sendCompletionsRanking({
    tag:        `M${floor}Completions`,
    channelId,
    cacheKey:   `lastM${floor}Comps`,
    updatedKey: `lastM${floor}CompsUpdated`,
    fetchType:  `m${floor}`,
    titleHigh:  `M${floor} Completions Ranking (Catacombs Lv50+)`,
    titleLow:   `M${floor} Completions Ranking (Catacombs Lv1〜49)`,
  });
}

// ===== Secrets per Run ランキング送信 =====
export async function sendSecretsPerRunRanking() {
  if (!SECRETS_PER_RUN_CHANNEL_ID) {
    console.warn("[SecretsPerRun] SECRETS_PER_RUN_CHANNEL_ID 未設定");
    return;
  }

  console.log("[SecretsPerRun Rank] 開始");

  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.get(SECRETS_PER_RUN_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) continue;

    // 古いメッセージ削除
    try {
      await deleteOldRankingMessages(channel, "Secrets per Run Ranking");
    } catch (err) {
      console.error("[SecretsPerRun] 古いメッセージ削除エラー", err);
    }

    const rankingData = [];
    const users = Object.entries(mcidData.users ?? {});

    for (let i = 0; i < users.length; i += SECRETS_PER_RUN_BATCH_SIZE) {
      const batch = users.slice(i, i + SECRETS_PER_RUN_BATCH_SIZE);

      for (const [discordId, user] of batch) {
        if (!user.uuid) continue;

        let perRun = null;

        // キャッシュ優先
        if (user.lastSecretsPerRun && user.lastSecretsPerRunUpdated && Date.now() - user.lastSecretsPerRunUpdated < SECRETS_PER_RUN_CACHE_VALID_MS) {
          perRun           = user.lastSecretsPerRun;
        } else {
          const result = await getSecretsAndRuns(HYPIXEL_API_KEY, user.uuid);
          const { secrets, totalRuns } = result;

          if (secrets !== null && totalRuns !== null && totalRuns > 0) {
            perRun                      = secrets / totalRuns;
            user.lastSecrets            = secrets;
            user.lastTotalRuns          = totalRuns;
            user.lastSecretsPerRun      = perRun;
            user.lastSecretsPerRunUpdated = Date.now();
            console.log(`[SecretsPerRun] 更新: ${user.ign} → ${perRun.toFixed(2)} (${secrets}/${totalRuns})`);
          }
        }

        if (perRun !== null && perRun > 0) {
          rankingData.push({
            discordId,
            ign:       user.ign ?? "不明",
            perRun,
            secrets:   user.lastSecrets,
            totalRuns: user.lastTotalRuns,
            cata: typeof user.lastCataLevel === "number" ? user.lastCataLevel : 0,
          });
        }
      }

      if (i + SECRETS_PER_RUN_BATCH_SIZE < users.length) await sleep(SECRETS_PER_RUN_BATCH_DELAY);
    }

    saveMCID();

    const allUsers = rankingData.sort((a, b) => b.perRun - a.perRun);
    const lineFormatter = (u, i) =>
      `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — **${u.perRun.toFixed(2)}** (${u.secrets.toLocaleString()}/${u.totalRuns})`;

    const hasResult = await sendSplitRanking(channel, allUsers, {
      lineFormatter,
      titleHigh: "Secrets per Run Ranking (Catacombs Lv50+)",
      titleLow:  "Secrets per Run Ranking (Catacombs Lv1〜49)",
    });

    if (!hasResult) {
      await channel.send("📭 Secrets per Run データを計算できるユーザーがいません").catch(() => {});
    }

    console.log(`[SecretsPerRun] ${guild.name} 更新完了`);
  }
}

// ===== Class Level ランキング送信 =====
export async function sendClassLevelRanking() {
  if (!CLASS_RANK_CHANNEL_ID) {
    console.warn("[ClassRank] CLASS_RANK_CHANNEL_ID 未設定");
    return;
  }

  console.log("[ClassRank] 開始");

  for (const guild of client.guilds.cache.values()) {
    const channel = guild.channels.cache.get(CLASS_RANK_CHANNEL_ID);
    if (!channel || !channel.isTextBased()) continue;

    // 古いメッセージ削除
    try {
      await deleteOldRankingMessages(channel, "Class Level Ranking");
    } catch (err) {
      console.error("[ClassRank] 古いメッセージ削除エラー", err);
    }

    const rankingData = [];
    const users = Object.entries(mcidData.users ?? {});
    console.log(`[ClassRank] 対象ユーザー数: ${users.length}`);

    for (let i = 0; i < users.length; i += CLASS_BATCH_SIZE) {
      const batch = users.slice(i, i + CLASS_BATCH_SIZE);

      for (const [discordId, user] of batch) {
        if (!user.uuid) continue;

        let levels = null;

        if (user.lastClassLevels && user.lastClassLevelsUpdated && Date.now() - user.lastClassLevelsUpdated < CLASS_CACHE_VALID_MS) {
          levels = user.lastClassLevels;
        } else {
          levels = await getClassLevels(HYPIXEL_API_KEY, user.uuid);
          if (Object.values(levels).some((lv) => lv > 0)) {
            user.lastClassLevels        = levels;
            user.lastClassLevelsUpdated = Date.now();
            console.log(`[ClassRank] 更新: ${user.ign} → ${JSON.stringify(levels)}`);
          }
        }

        if (levels && Object.values(levels).some((lv) => lv > 0)) {
          rankingData.push({
            discordId,
            ign:    user.ign ?? "不明",
            levels,
            cata:   typeof user.lastCataLevel === "number" ? user.lastCataLevel : 0,
          });
        }
      }

      if (i + CLASS_BATCH_SIZE < users.length) await sleep(CLASS_BATCH_DELAY);
    }

    saveMCID();

    if (rankingData.length === 0) {
      await channel.send("📭 クラスレベルが記録されているユーザーがいません").catch(() => {});
      continue;
    }

    const highCata = rankingData.filter((u) => Math.floor(u.cata) >= CATA_HIGH_LEVEL);
    const lowCata  = rankingData.filter((u) => { const lv = Math.floor(u.cata); return lv >= 1 && lv <= 49; });

    const classes = [
      { key: "healer",  name: "Healer" },
      { key: "mage",    name: "Mage" },
      { key: "berserk", name: "Berserk" },
      { key: "archer",  name: "Archer" },
      { key: "tank",    name: "Tank" },
    ];

    // Lv50+ グループ
    if (highCata.length > 0) {
      for (const cls of classes) {
        const sorted = highCata
          .sort((a, b) => (b.levels[cls.key] || 0) - (a.levels[cls.key] || 0))
          .slice(0, MAX_RANKING_DISPLAY);
        if (sorted.length === 0) continue;

        const lines = sorted.map((u, i) =>
          `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — Lv ${(u.levels[cls.key] || 0).toFixed(1)}`
        ).join("\n");

        const embed = new EmbedBuilder()
          .setTitle(`Class Level Ranking - ${cls.name} (Catacombs Lv50+)`)
          .setColor(EMBED_COLOR_GOLD)
          .setDescription(lines || "該当者なし")
          .setFooter(makeFooter())
          .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(console.error);
      }
    }

    // Lv1〜49 グループ
    if (lowCata.length > 0) {
      for (const cls of classes) {
        const sorted = lowCata
          .sort((a, b) => (b.levels[cls.key] || 0) - (a.levels[cls.key] || 0))
          .slice(0, MAX_RANKING_DISPLAY);
        if (sorted.length === 0) continue;

        const lines = sorted.map((u, i) =>
          `**${i + 1}.** <@${u.discordId}> (\`${u.ign}\`) — Lv ${(u.levels[cls.key] || 0).toFixed(1)}`
        ).join("\n");

        const embed = new EmbedBuilder()
          .setTitle(`Class Level Ranking - ${cls.name} (Catacombs Lv1〜49)`)
          .setColor(EMBED_COLOR_PURPLE)
          .setDescription(lines || "該当者なし")
          .setFooter(makeFooter())
          .setTimestamp();
        await channel.send({ embeds: [embed] }).catch(console.error);
      }
    }

    if (highCata.length === 0 && lowCata.length === 0) {
      await channel.send("📭 クラスレベルは記録されていますが、Catacombsレベルの範囲内のユーザーがいません").catch(console.error);
    }

    console.log(`[ClassRank] ${guild.name} 更新完了`);
  }

  console.log("[ClassRank] 全処理終了");
}
