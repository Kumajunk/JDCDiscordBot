import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import env from "./env.js";
import {
    Client,
    GatewayIntentBits,
    PermissionsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ApplicationCommandOptionType,
    ChannelType,
} from "discord.js";
import {
    fetchAllSkyblockData,
    fetchAndExtractAllForUser,
    safeHypixelFetchLimited,
    fetchKuudraT5,
    getSecretsFound,
} from "./api.js";
import {
    formatDungeonTime,
    formatLevel,
    createAdminEmbed,
    EMBED_COLOR_GOLD,
    EMBED_COLOR_PURPLE,
    FOOTER_ICON_URL,
} from "./utils.js";
import { initRanking, sendM7SPRanking, sendF7SPRanking, sendCataRanking, sendSecretsRanking, sendKuudraT5Ranking, sendClassAverageRanking, sendMasterSPRanking, sendMasterCompletionsRanking, sendF7CompletionsRanking, sendM7CompletionsRanking, sendSecretsPerRunRanking, sendClassLevelRanking } from "./ranking.js";
import {
    initCommands,
    handleRegisterCommand,
    handleDungeonInfoCommand,
    handleKuudraT5Command,
    handleForceCataUpdate,
    handleForceKuudraUpdate,
    handleFixMemberRoles,
    handleCata50Rank,
    handleListRegistered,
    handleListUnregistered,
    handleListRegisteredCsv,
    handleListUnregisteredCsv,
    handleUnregisterUser,
    handleRegisterUser,
    handlePfCommand,
    handleAdminPfStop,
    handleButtonInteraction,
} from "./commands.js";

import dotenv from "dotenv";
dotenv.config();

// ===== パス設定 =====
const __filename = fileURLToPath(import.meta.url);
const __dirname    = path.dirname(__filename);
const MCID_FILE    = env.MCID_FILE;

// ===== 二重通知防止 =====
const adminNotifyCooldown = new Map();



// ===== 環境変数 =====
const {
    TOKEN,
    HYPIXEL_API_KEY,
    CATA50_CHANNEL_ID,
    AUTO_CLEAR_CHANNEL_ID,
    VC_CATEGORY_IDS,
    KUUDRA_UPDATE_INTERVAL,
    KUUDRA_BATCH_SIZE,
    KUUDRA_BATCH_DELAY,
    CATA_GUILD_ID,
    KUUDRA_GUILD_ID,
    MEMBER_ROLE_ID,
    TEMPORARY_ROLE_ID,
    KUUDRA_T5_CHANNEL_ID,
    KUUDRA_T5_UPDATE_INTERVAL,
    KUUDRA_T5_BATCH_SIZE,
    KUUDRA_T5_BATCH_DELAY,
    KUUDRA_T5_CACHE_VALID_MS,
    F7_COMPLETIONS_CHANNEL_ID,
    M7_COMPLETIONS_CHANNEL_ID,
    F7_COMPLETIONS_UPDATE_INTERVAL,
    M7_COMPLETIONS_UPDATE_INTERVAL,
    COMPLETIONS_BATCH_SIZE,
    COMPLETIONS_BATCH_DELAY,
    COMPLETIONS_CACHE_VALID_MS,
    M7SP_CHANNEL_ID,
    M7SP_UPDATE_INTERVAL,
    BATCH_SIZE,
    BATCH_DELAY,
    CACHE_VALID_MS,
    F7SP_CHANNEL_ID,
    F7SP_UPDATE_INTERVAL,
    F7_BATCH_SIZE,
    F7_BATCH_DELAY,
    F7_CACHE_VALID_MS,
    SECRETS_RANK_CHANNEL_ID,
    SECRETS_UPDATE_INTERVAL,
    SECRETS_BATCH_SIZE,
    SECRETS_BATCH_DELAY,
    SECRETS_CACHE_VALID_MS,
    SECRETS_PER_RUN_CHANNEL_ID,
    SECRETS_PER_RUN_UPDATE_INTERVAL,
    SECRETS_PER_RUN_BATCH_SIZE,
    SECRETS_PER_RUN_BATCH_DELAY,
    SECRETS_PER_RUN_CACHE_VALID_MS,
    CLASS_RANK_CHANNEL_ID,
    CLASS_UPDATE_INTERVAL,
    CLASS_AVG_CHANNEL_ID,
    CLASS_AVG_UPDATE_INTERVAL,
    CLASS_BATCH_SIZE,
    CLASS_BATCH_DELAY,
    CLASS_CACHE_VALID_MS,
    sleep,
} = env;

// =============================================
// サーバー種別判定ヘルパー
// =============================================
function isCataGuild(guildId) {
    return guildId === CATA_GUILD_ID;
}

function isKuudraGuild(guildId) {
    return guildId === KUUDRA_GUILD_ID;
}



// ===== MCID データ保存 =====
function saveMCID() {
    const tmp = MCID_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(mcidData, null, 2));
    fs.renameSync(tmp, MCID_FILE);
}

// ===== ロール範囲 (小数点対応版) =====
const roleRanges = [
    { min: 0,     max: 24,             role: "Cata0~23" },
    { min: 24,    max: 35,             role: "Cata24~35" },
    { min: 35,    max: 44,             role: "Cata36~44" },
    { min: 44,    max: 50,             role: "Cata45~49" },
    { min: 50,    max: Infinity, role: "Cata50+" },
];

const cataLevelTotals = [
    50, 125, 235, 395, 625, 955, 1425, 2095, 3045, 4385,
    6275, 8940, 12700, 17960, 25340, 35640, 50040, 70040, 97640, 135640,
    188140, 259640, 356640, 488640, 668640, 911640, 1239640, 1684640, 2284640, 3084640,
    4149640, 5559640, 7459640, 9959640, 13259640, 17559640, 23159640, 30159640, 39559640, 51559640,
    66559640, 85559640, 109559640, 139559640, 177559640, 225559640, 295559640, 360559640, 453559640, 569809640,
];

function roleForLevel(level) {
    return roleRanges.find((r) => level >= r.min && level <= r.max)?.role;
}

// ===== XP → Catacombs レベル変換 =====
function xpToCataLevel(xp) {
    if (xp >= cataLevelTotals[49]) {
        return 50 + Math.floor((xp - cataLevelTotals[49]) / 200_000_000);
    }
    for (let level = 0; level < cataLevelTotals.length; level++) {
        if (xp <= cataLevelTotals[level]) return level;
    }
    return cataLevelTotals.length;
}

// 小数点付きバージョン (dungeon_info 用)
function xpToCataLevelDecimal(xp) {
    if (typeof xp !== "number" || xp < 0) return 0;

    if (xp >= cataLevelTotals[49]) {
        return 50 + (xp - cataLevelTotals[49]) / 200_000_000;
    }

    let currentLevel = 0;
    let accumulatedXp = 0;

    for (let i = 0; i < cataLevelTotals.length; i++) {
        const nextThreshold = cataLevelTotals[i];
        if (xp < nextThreshold) {
            const xpInThisLevel            = xp - accumulatedXp;
            const xpNeededForLevel     = nextThreshold - accumulatedXp;
            return currentLevel + xpInThisLevel / xpNeededForLevel;
        }
        accumulatedXp = nextThreshold;
        currentLevel++;
    }

    return currentLevel;
}

// ===== Class level extractor (uses shared profile fetch) =====
async function getClassLevels(apiKey, uuid) {
    if (!uuid) return { healer: 0, mage: 0, berserk: 0, archer: 0, tank: 0 };

    const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
    if (!profiles) return { healer: 0, mage: 0, berserk: 0, archer: 0, tank: 0 };

    const best = { healer: 0, mage: 0, berserk: 0, archer: 0, tank: 0 };

    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member?.dungeons?.player_classes) continue;

        const classes = member.dungeons.player_classes;
        const healer  = classes.healer?.experience  ? xpToCataLevelDecimal(classes.healer.experience)  : 0;
        const mage    = classes.mage?.experience    ? xpToCataLevelDecimal(classes.mage.experience)    : 0;
        const berserk = classes.berserk?.experience ? xpToCataLevelDecimal(classes.berserk.experience) : 0;
        const archer  = classes.archer?.experience  ? xpToCataLevelDecimal(classes.archer.experience)  : 0;
        const tank    = classes.tank?.experience    ? xpToCataLevelDecimal(classes.tank.experience)    : 0;

        if (healer  > best.healer)  best.healer  = healer;
        if (mage    > best.mage)    best.mage    = mage;
        if (berserk > best.berserk) best.berserk = berserk;
        if (archer  > best.archer)  best.archer  = archer;
        if (tank    > best.tank)    best.tank    = tank;
    }

    return best;
}

// ===== Catacombs level extractor (uses shared profile fetch) =====
async function getCatacombsLevel(apiKey, uuid) {
    if (!uuid) return null;

    const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
    if (!profiles) return null;

    let bestCata = 0;
    for (const profile of profiles) {
        const member = profile.members?.[cleanUuid];
        if (!member?.dungeons?.dungeon_types?.catacombs) continue;
        const xp = member.dungeons.dungeon_types.catacombs.experience ?? 0;
        const lv = xpToCataLevelDecimal(xp);
        if (lv > bestCata) bestCata = lv;
    }

    return bestCata > 0 ? bestCata : null;
}

// ===== UUID 取得 (Mojang API) =====
async function getUuid(name) {
    const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(name)}`);
    if (res.status === 204) return null;
    const j = await res.json();
    return j.id;
}

// ===== UUID + IGN 取得 =====
async function fetchUUID(ign) {
    try {
        const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${ign}`);
        if (!res.ok) return null;
        const data = await res.json();
        return { uuid: data.id, ign: data.name };
    } catch {
        return null;
    }
}

// ===== MCID 存在チェック =====
async function isValidMCID(ign) {
    try {
        const res = await fetch(`https://api.mojang.com/users/profiles/minecraft/${ign}`);
        if (!res.ok) return false;
        const data = await res.json();
        return !!data.id;
    } catch {
        return false;
    }
}

// ===== Catacombs ロール付与 (A鯖のみ) =====
async function updateCataRole(member, cataLevel) {
    const targetGuildId = process.env.CATA_GUILD_ID;
    if (!targetGuildId || member.guild.id !== targetGuildId) {
        console.log(`[Cata Skip] ${member.user.tag} はCata対象サーバー外 (${member.guild.name})`);
        return;
    }

    if (typeof cataLevel !== "number") {
        console.log("⚠️ cataLevel不正:", cataLevel);
        return;
    }

    const targetRoleName = roleForLevel(cataLevel);
    if (!targetRoleName) {
        console.log("⚠️ 該当ロールなし Lv:", cataLevel);
        return;
    }

    const guild = member.guild;
    const me        = guild.members.me;

    if (!me.permissions.has(PermissionsBitField.Flags.ManageRoles)) {
        console.error("❌ Botにロール管理権限がありません");
        return;
    }

    const newRole = guild.roles.cache.find((r) => r.name === targetRoleName);
    if (!newRole) { console.error("❌ ロールが見つかりません:", targetRoleName); return; }
    if (newRole.position >= me.roles.highest.position) { console.error("❌ Botロールが対象ロールより低いです:", newRole.name); return; }

    // 既存Cata ロール削除
    const cataRoleNames = roleRanges.map((r) => r.role);
    for (const roleName of cataRoleNames) {
        const role = guild.roles.cache.find((r) => r.name === roleName);
        if (role && member.roles.cache.has(role.id) && role.position < me.roles.highest.position) {
            await member.roles.remove(role).catch(() => {});
        }
    }

    // 新ロール付与
    if (!member.roles.cache.has(newRole.id)) {
        await member.roles.add(newRole);
        console.log(`✅ ロール付与 ${member.user.tag} → ${newRole.name}`);
    }
}

// ===== Kuudra T5 ロール付与 (A鯖のみ) =====
async function updateKuudraRole(member, discordId) {
    const targetGuildId = process.env.KUUDRA_GUILD_ID;
    if (!targetGuildId || member.guild.id !== targetGuildId) {
        console.log(`[Kuudra Role] 対象サーバー外のためスキップ | guild=${member.guild.id}`);
        return;
    }

    const user = mcidData.users[discordId];
    if (!user) { console.log(`[Kuudra Role] mcidData.users[${discordId}] が見つからない`); return; }

    const raw = user.lastKuudraT5;
    if (raw === null || raw === undefined) { console.log(`[Kuudra Role] lastKuudraT5 が null/undefined | discordId=${discordId}`); return; }

    const t5 = Number(raw);
    if (Number.isNaN(t5)) { console.log(`[Kuudra Role] lastKuudraT5 が NaN | value=${raw}`); return; }

    console.log(`[Kuudra Role] 処理開始 | discordId=${discordId} | t5=${t5}`);

    const kuudraRoles = [
        { min: 20000, name: "20k+" },
        { min: 15000, name: "15k+" },
        { min: 10000, name: "10k+" },
        { min:    5000, name: "5k+"    },
        { min:    2000, name: "2k+"    },
        { min:    1000, name: "1k+"    },
    ];

    // 既存ロール削除
    for (const r of kuudraRoles) {
        const role = member.guild.roles.cache.find((x) => x.name === r.name);
        if (role && member.roles.cache.has(role.id)) {
            await member.roles.remove(role).catch((err) => console.error(`[Kuudra Role] ロール削除失敗 ${r.name}`, err));
        }
    }

    // 最高ランク1つ付与
    for (const r of kuudraRoles) {
        if (t5 >= r.min) {
            const role = member.guild.roles.cache.find((x) => x.name === r.name);
            if (role) {
                if (role.position >= member.guild.members.me.roles.highest.position) {
                    console.error(`[Kuudra Role] Botのロール位置が低いため付与不可: ${r.name}`);
                    return;
                }
                await member.roles.add(role).catch((err) => console.error(`[Kuudra Role] ロール付与失敗 ${r.name}`, err));
                console.log(`[Kuudra Role] 付与完了 ${r.name} → ${member.user.tag}`);
            } else {
                console.error(`[Kuudra Role] ロールが見つかりません: ${r.name}`);
            }
            break;
        }
    }
}

// ===== 自動メッセージ全削除 =====
async function deleteAllMessages(channel) {
    if (!channel || !channel.isTextBased()) return;

    const excludeIds = process.env.AUTO_CLEAR_EXCLUDE_USER_IDS?.split(",") ?? [];
    let fetched;
    do {
        fetched = await channel.messages.fetch({ limit: 100 });
        const deletable = fetched.filter((msg) => msg.deletable && !excludeIds.includes(msg.author.id));
        if (deletable.size > 0) await channel.bulkDelete(deletable, true);
    } while (fetched.size >= 2);
}

// ===== 2時間以上前のメッセージを削除 =====
async function deleteMessagesOlderThan2Hours(channel) {
    if (!channel || !channel.isTextBased()) return;

    const TWO_HOURS    = 2 * 60 * 60 * 1000;
    const now                = Date.now();
    const keepUserIds = process.env.AUTO_CLEAR_KEEP_USER_IDS?.split(",") ?? [];

    let lastMessageId;
    while (true) {
        const fetched = await channel.messages.fetch({ limit: 100, before: lastMessageId });
        if (fetched.size === 0) break;

        for (const msg of fetched.values()) {
            lastMessageId = msg.id;
            if (keepUserIds.includes(msg.author.id)) continue;
            if (!msg.deletable) continue;
            if (now - msg.createdTimestamp < TWO_HOURS) return;
            try {
                await msg.delete();
                await sleep(1100);
            } catch {
                // 削除失敗は無視
            }
        }
    }
}

// ===== Adminログ送信 =====
async function sendAdminLog(client, content) {
    const channelId = process.env.ADMIN_LOG_CHANNEL_ID;
    if (!channelId) return;
    for (const guild of client.guilds.cache.values()) {
        const ch = guild.channels.cache.get(channelId);
        if (ch && ch.isTextBased()) await ch.send(content).catch(() => {});
    }
}

// ===== Admin Embed 送信 =====
async function notifyAdminEmbed(guild, embed) {
    const adminRole = guild.roles.cache.find((r) => r.name === "Admin");
    if (!adminRole) return;
    const channelId = process.env.ADMIN_NOTIFY_CHANNEL_ID;
    if (!channelId) return;
    const channel = guild.channels.cache.get(channelId);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ content: `<@&${adminRole.id}>`, embeds: [embed] }).catch(() => {});
}

// ===== クールダウンチェチE�� =====
function canNotify(userId, type, ms = 60 * 60 * 1000) {
    const key    = `${userId}:${type}`;
    const last = adminNotifyCooldown.get(key) ?? 0;
    if (Date.now() - last < ms) return false;
    adminNotifyCooldown.set(key, Date.now());
    return true;
}



// ===== Party Finder ヘルパー =====
function getMentionRoles(floor) {
    switch (floor.toUpperCase()) {
        case "F1": case "F2": case "F3": case "F4": case "F5": case "F6": return ["F1~F6"];
        case "F7":    return ["F7"];
        case "M1": case "M2": case "M3": case "M4": return ["M1~M4"];
        case "M5": case "M6": return ["M5~M6"];
        case "M7":    return ["M7"];
        default:        return [];
    }
}

function buildRoleMentions(guild, names) {
    return names
        .map((n) => guild.roles.cache.find((r) => r.name === n))
        .filter(Boolean)
        .map((r) => `<@&${r.id}>`)
        .join(" ");
}

function buildEmbed(party) {
    const list = party.members.length
        ? party.members.map((id) => {
                const ign = mcidData.users[id]?.ign ?? "未登録";
                return `<@${id}> (\`${ign}\`)`;
            }).join("\n")
        : "なし";

    let desc = `募集者: <@${party.author}>\nフロア: **${party.floor}**\n`;
    if (party.description) desc += `\n**説明文:**${party.description}\n`;
    desc += `\n👥 募集人数: ${party.members.length}/${party.max}\n\n**参加メンバー**\n${list}`;

    return new EmbedBuilder().setTitle("Party Finder").setColor(0x00ffff).setDescription(desc);
}

function buildButtons(party) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("join_party").setLabel("参加する").setStyle(ButtonStyle.Primary).setDisabled(party.members.length >= party.max),
        new ButtonBuilder().setCustomId("leave_party").setLabel("参加取り消し").setStyle(ButtonStyle.Secondary).setDisabled(party.members.length === 0),
        new ButtonBuilder().setCustomId("create_vc").setLabel("VC作成").setStyle(ButtonStyle.Success).setDisabled(!!party.vcId),
        new ButtonBuilder().setCustomId("end_party").setLabel("募集終了").setStyle(ButtonStyle.Danger)
    );
}

// ===== Cata バッチ更新 (A鯖 24時間ごと) =====
const CATA_UPDATE_INTERVAL = 24 * 60 * 60 * 1000;
const CATA_BATCH_SIZE            = 100;
const CATA_BATCH_DELAY         = 5 * 60 * 1000;

// ===== Unified batch update (24h): fetch all stats per user in one API call =====
async function runFullUserDataUpdate() {
    if (!mcidData.users) return;

    const entries     = Object.entries(mcidData.users);
    const cataGuild   = CATA_GUILD_ID   ? client.guilds.cache.get(CATA_GUILD_ID)   : null;
    const kuudraGuild = KUUDRA_GUILD_ID ? client.guilds.cache.get(KUUDRA_GUILD_ID) : null;

    let success = 0, skipped = 0, errors = 0;

    console.log(`[FullUpdate] 開始 (${entries.length}人)`);

    for (let i = 0; i < entries.length; i += CATA_BATCH_SIZE) {
        const batch    = entries.slice(i, i + CATA_BATCH_SIZE);
        const batchIdx = Math.floor(i / CATA_BATCH_SIZE) + 1;
        console.log(`[FullUpdate] バッチ ${batchIdx} 開始 (${batch.length}人)`);

        for (const [discordId, userData] of batch) {
            try {
                const uuid = userData.uuid;
                if (!uuid) { skipped++; continue; }

                // Single API request for all stats
                const data = await fetchAndExtractAllForUser(uuid, xpToCataLevelDecimal);
                if (!data) { skipped++; continue; }

                const now = Date.now();

                // --- Cata level + role ---
                if (data.cataLevel !== null) {
                    userData.lastCataLevel = data.cataLevel;
                    userData.lastUpdatedAt = now;

                    if (cataGuild) {
                        const member = await cataGuild.members.fetch(discordId).catch(() => null);
                        if (member) await updateCataRole(member, data.cataLevel);
                    }
                }

                // --- Class levels ---
                if (Object.values(data.classLevels).some((lv) => lv > 0)) {
                    userData.lastClassLevels        = data.classLevels;
                    userData.lastClassLevelsUpdated = now;
                }

                // --- Kuudra T5 + role ---
                if (data.kuudraT5.t5 !== null) {
                    userData.lastKuudraT5      = data.kuudraT5.t5;
                    userData.kuudraProfile     = data.kuudraT5.profile;
                    userData.lastKuudraUpdated = now;

                    if (kuudraGuild) {
                        const member = await kuudraGuild.members.fetch(discordId).catch(() => null);
                        if (member) await updateKuudraRole(member, discordId);
                    }
                }

                success++;
            } catch (err) {
                console.error(`[FullUpdate] ${discordId} 更新失敗`, err);
                errors++;
            }
        }

        if (i + CATA_BATCH_SIZE < entries.length) {
            console.log("[FullUpdate] バッチ間待機...");
            await sleep(CATA_BATCH_DELAY);
        }
    }

    saveMCID();
    console.log(`[FullUpdate] 完了 | 成功: ${success}人 | スキップ: ${skipped}人 | エラー: ${errors}件`);
}





// ===== MCID データ読み込み =====
let mcidData;

try {

    if (!fs.existsSync(MCID_FILE)) {

        mcidData = { users: {}, igns: {}, uuids: {} };
        fs.writeFileSync(MCID_FILE, JSON.stringify(mcidData, null, 2));

    } else {

        mcidData = JSON.parse(fs.readFileSync(MCID_FILE, "utf8"));

        mcidData.users ??= {};
        mcidData.igns ??= {};
        mcidData.uuids ??= {};

    }

} catch (err) {

    console.error("mcid.json が壊れているため初期化しました", err);

    mcidData = { users: {}, igns: {}, uuids: {} };

    fs.writeFileSync(MCID_FILE, JSON.stringify(mcidData, null, 2));
}


// ===== Discord Client =====
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
    ],
});


// ===== サーバー退出時：IGN自動解除 =====
client.on("guildMemberRemove", (member) => {
    const userId = member.id;
    if (!mcidData.users[userId]) return;
    const { ign, oldNick } = mcidData.users[userId];
    delete mcidData.users[userId];
    if (ign && mcidData.igns[ign]) delete mcidData.igns[ign];
    saveMCID();
    console.log(`IGN自動解除: ${member.user.tag} (${ign}) @ ${member.guild.name}`);
    if (member.guild.id === process.env.CATA_GUILD_ID) {
        console.log(`[Leave] ${member.user.tag} が退出したが、CATAサーバーのためoldNick復元スキップ`);
        return;
    }
    if (oldNick !== undefined && oldNick !== null) {
        console.log(
            `[Leave] ${member.user.tag} の旧ニックネーム ${oldNick} を復元しようとしましたが、退出済みのためスキップ`
        );
    }
});




// ===== IGN変更検知（10分ごと）=====
setInterval(async () => {

    if (!mcidData.users) return;

    for (const [discordId, userData] of Object.entries(mcidData.users)) {

        const uuid = userData.uuid;
        if (!uuid) continue;

        try {

            const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
            if (!res.ok) continue;

            const profile = await res.json();
            const currentIgn = profile.name;

            if (currentIgn !== userData.ign) {

                const oldIgn = userData.ign;

                console.log(`IGN変更検知: ${oldIgn} → ${currentIgn} (${discordId})`);

                delete mcidData.igns[oldIgn];

                userData.ign = currentIgn;
                mcidData.igns[currentIgn] = discordId;

                saveMCID();

                for (const guild of client.guilds.cache.values()) {

                    const member = await guild.members.fetch(discordId).catch(() => null);
                    if (!member) continue;

                    if (guild.id === process.env.CATA_GUILD_ID) {

                        console.log(
                            `[IGN Change] ${currentIgn} が変更されたが、CATAサーバーのためニックネーム更新スキップ (${guild.name})`
                        );

                        continue;

                    }

                    try {

                        await member.setNickname(currentIgn, "IGN変更自動反映");

                        console.log(
                            `[IGN Change] ニックネーム更新成功: ${member.user.tag} → ${currentIgn} @ ${guild.name}`
                        );

                    } catch (err) {

                        console.warn(
                            `[IGN Change] ニックネーム更新失敗 ${member.user.tag} @ ${guild.name}`,
                            err.message
                        );

                    }
                }

                await sendAdminLog(
                    client,
                    `📝 **IGN変更検知**
                      ユーザー: <@${discordId}>
                      UUID: \`${uuid}\`
                      旧IGN: **${oldIgn}** → 新IGN: **${currentIgn}**`
                );
            }

        } catch (err) {

            console.error(`IGNチェック失敗(${discordId})`, err);

        }
    }

}, 60 * 60 * 1000);

// ===== 起動 =====
client.once("ready", async () => {

    console.log("Bot起動");



    // ===== ランキング定期更新 =====
    setTimeout(() => sendM7SPRanking(), 1 * 60 * 1000);
    setInterval(() => sendM7SPRanking(), M7SP_UPDATE_INTERVAL);
    setTimeout(() => sendF7SPRanking(), 4 * 60 * 1000);
    setInterval(() => sendF7SPRanking(), F7SP_UPDATE_INTERVAL);
    setTimeout(() => sendCataRanking(), 7 * 60 * 1000);
    setInterval(() => sendCataRanking(), 24 * 60 * 60 * 1000);
    setTimeout(() => sendSecretsRanking(), 10 * 60 * 1000);
    setInterval(() => sendSecretsRanking(), SECRETS_UPDATE_INTERVAL);
    setTimeout(() => sendSecretsPerRunRanking(), 13 * 60 * 1000);
    setInterval(() => sendSecretsPerRunRanking(), SECRETS_PER_RUN_UPDATE_INTERVAL);
    setTimeout(() => sendF7CompletionsRanking(), 16 * 60 * 1000);
    setInterval(() => sendF7CompletionsRanking(), F7_COMPLETIONS_UPDATE_INTERVAL);
    setTimeout(() => sendM7CompletionsRanking(), 19 * 60 * 1000);
    setInterval(() => sendM7CompletionsRanking(), M7_COMPLETIONS_UPDATE_INTERVAL);

    // ===== Class Ranking =====
    setTimeout(() => {
        console.log("[ClassRank] 初回ランキング更新開始");
        sendClassLevelRanking().catch((err) => console.error("[ClassRank初回] エラー", err));
    }, 25 * 60 * 1000);
    setInterval(() => {
        console.log("[ClassRank] 定期更新開始");
        sendClassLevelRanking().catch((err) => console.error("[ClassRank定期] エラー", err));
    }, CLASS_UPDATE_INTERVAL);

    // ===== Class Average Ranking =====
    setTimeout(() => {
        console.log("[ClassAvgRank] 初回開始");
        sendClassAverageRanking().catch((err) => console.error("[ClassAvgRank] エラー", err));
    }, 28 * 60 * 1000);
    setInterval(() => {
        console.log("[ClassAvgRank] 定期更新");
        sendClassAverageRanking().catch((err) => console.error("[ClassAvgRank] エラー", err));
    }, CLASS_AVG_UPDATE_INTERVAL);


    // ===== Master Mode Completions (M1〜M6) =====
    setTimeout(() => sendMasterCompletionsRanking(1), 20 * 60 * 1000);
    setInterval(() => sendMasterCompletionsRanking(1), 24 * 60 * 60 * 1000);
    setTimeout(() => sendMasterCompletionsRanking(2), 25 * 60 * 1000);
    setInterval(() => sendMasterCompletionsRanking(2), 24 * 60 * 60 * 1000);
    setTimeout(() => sendMasterCompletionsRanking(3), 30 * 60 * 1000);
    setInterval(() => sendMasterCompletionsRanking(3), 24 * 60 * 60 * 1000);
    setTimeout(() => sendMasterCompletionsRanking(4), 35 * 60 * 1000);
    setInterval(() => sendMasterCompletionsRanking(4), 24 * 60 * 60 * 1000);
    setTimeout(() => sendMasterCompletionsRanking(5), 40 * 60 * 1000);
    setInterval(() => sendMasterCompletionsRanking(5), 24 * 60 * 60 * 1000);
    setTimeout(() => sendMasterCompletionsRanking(6), 45 * 60 * 1000);
    setInterval(() => sendMasterCompletionsRanking(6), 24 * 60 * 60 * 1000);

    // ===== Master Mode S+ PB =====
    setTimeout(() => sendMasterSPRanking(1), 50 * 60 * 1000);
    setInterval(() => sendMasterSPRanking(1), 24 * 60 * 60 * 1000);
    setTimeout(() => sendMasterSPRanking(2), 55 * 60 * 1000);
    setInterval(() => sendMasterSPRanking(2), 24 * 60 * 60 * 1000);
    setTimeout(() => sendMasterSPRanking(3), 60 * 60 * 1000);
    setInterval(() => sendMasterSPRanking(3), 24 * 60 * 60 * 1000);
    setTimeout(() => sendMasterSPRanking(4), 65 * 60 * 1000);
    setInterval(() => sendMasterSPRanking(4), 24 * 60 * 60 * 1000);
    setTimeout(() => sendMasterSPRanking(5), 70 * 60 * 1000);
    setInterval(() => sendMasterSPRanking(5), 24 * 60 * 60 * 1000);
    setTimeout(() => sendMasterSPRanking(6), 75 * 60 * 1000);
    setInterval(() => sendMasterSPRanking(6), 24 * 60 * 60 * 1000);

    // ===== 統合バッチ更新（Cata / Class / Kuudra を1リクエストで）=====
    setTimeout(runFullUserDataUpdate, 5 * 60 * 1000);
    setInterval(runFullUserDataUpdate, CATA_UPDATE_INTERVAL);

    // ===== Kuudra T5 Completions Ranking =====
    setTimeout(() => {
        console.log("[KuudraT5] 初回ランキング更新開始");
        sendKuudraT5Ranking().catch((err) => console.error("[KuudraT5初回] エラー", err));
    }, 22 * 60 * 1000);
    setInterval(() => {
        console.log("[KuudraT5] 定期更新開始");
        sendKuudraT5Ranking().catch((err) => console.error("[KuudraT5定期] エラー", err));
    }, KUUDRA_T5_UPDATE_INTERVAL);

    // ===== 自動メッセージ削除（2時間以上） =====
    setInterval(async () => {
        for (const guild of client.guilds.cache.values()) {
            const channel = guild.channels.cache.get(AUTO_CLEAR_CHANNEL_ID);
            if (!channel) continue;
            await deleteMessagesOlderThan2Hours(channel);
        }
    }, 5 * 60 * 1000);



});

const parties = new Map();

initRanking({
    client, mcidData, saveMCID, getClassLevels, xpToCataLevelDecimal, sleep,
    HYPIXEL_API_KEY, BATCH_SIZE, BATCH_DELAY, CACHE_VALID_MS,
    F7_BATCH_SIZE, F7_BATCH_DELAY, F7_CACHE_VALID_MS,
    SECRETS_RANK_CHANNEL_ID, SECRETS_BATCH_SIZE, SECRETS_BATCH_DELAY, SECRETS_CACHE_VALID_MS,
    SECRETS_PER_RUN_CHANNEL_ID, SECRETS_PER_RUN_BATCH_SIZE, SECRETS_PER_RUN_BATCH_DELAY, SECRETS_PER_RUN_CACHE_VALID_MS,
    M7SP_CHANNEL_ID, F7SP_CHANNEL_ID, CATA50_CHANNEL_ID,
    KUUDRA_T5_CHANNEL_ID, KUUDRA_T5_BATCH_SIZE, KUUDRA_T5_BATCH_DELAY, KUUDRA_T5_CACHE_VALID_MS,
    COMPLETIONS_BATCH_SIZE, COMPLETIONS_BATCH_DELAY, COMPLETIONS_CACHE_VALID_MS,
    F7_COMPLETIONS_CHANNEL_ID, M7_COMPLETIONS_CHANNEL_ID,
    CLASS_RANK_CHANNEL_ID, CLASS_AVG_CHANNEL_ID, CLASS_BATCH_SIZE, CLASS_BATCH_DELAY, CLASS_CACHE_VALID_MS
});

initCommands({
    client, mcidData, saveMCID, parties, isCataGuild, isKuudraGuild, fetchUUID, isValidMCID,
    fetchKuudraT5, getSecretsFound, updateCataRole, updateKuudraRole,
    buildEmbed, buildButtons, buildRoleMentions, getMentionRoles, xpToCataLevelDecimal,
    HYPIXEL_API_KEY, MEMBER_ROLE_ID, TEMPORARY_ROLE_ID,
    VC_CATEGORY_IDS, sleep
});

client.on("interactionCreate", async (interaction) => {
    try {
        if (interaction.isCommand()) {
            switch (interaction.commandName) {
                case "register":              return handleRegisterCommand(interaction);
                case "dungeon_info":          return handleDungeonInfoCommand(interaction);
                case "kuudra_t5":             return handleKuudraT5Command(interaction);
                case "force_cata_update":     return handleForceCataUpdate(interaction);
                case "force_kuudra_update":   return handleForceKuudraUpdate(interaction);

                case "fix_member_roles":      return handleFixMemberRoles(interaction);
                case "cata_50rank":           return handleCata50Rank(interaction);
                case "list_registered":       return handleListRegistered(interaction);
                case "list_unregistered":     return handleListUnregistered(interaction);
                case "list_registered_csv":   return handleListRegisteredCsv(interaction);
                case "list_unregistered_csv": return handleListUnregisteredCsv(interaction);
                case "unregister_user":       return handleUnregisterUser(interaction);
                case "register_user":         return handleRegisterUser(interaction);
                case "pf":                    return handlePfCommand(interaction);
                case "admin_pf_stop":         return handleAdminPfStop(interaction);
            }
        } else if (interaction.isButton()) {
            return handleButtonInteraction(interaction);
        }
    } catch (err) {
        console.error("Interaction Error:", err);
    }
});

client.login(TOKEN);