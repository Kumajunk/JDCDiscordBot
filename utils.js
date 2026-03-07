import { EmbedBuilder } from "discord.js";

// ===== 定数 =====
export const MAX_RANKING_DISPLAY = 25;
export const CATA_HIGH_LEVEL = 50;
export const EMBED_COLOR_GOLD = 0xffd700;
export const EMBED_COLOR_PURPLE = 0x9c27b0;
export const FOOTER_ICON_URL = "https://files.catbox.moe/56r55u.jpg";

// ===== 時間フォーマット（切り捨て版） =====
// 秒数を "m:ss" 形式に変換する（M7・F7・M1〜M6 共通）
export function formatDungeonTime(seconds) {
    if (typeof seconds !== "number" || seconds <= 0) return "N/A";

    const totalSeconds = Math.floor(seconds);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;

    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// 後方互換エイリアス（呼び出し元を変更しない）
export const formatM7Time = formatDungeonTime;
export const formatF7Time = formatDungeonTime;

// ===== ms → mm:ss 変換（ダンジョンタイム形式） =====
export function msToDungeonTime(ms) {
    if (!ms || Number.isNaN(ms)) return "N/A";
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ===== 表示レベル文字列ヘルパー =====
export function formatLevel(lv) {
    if (!Number.isFinite(lv)) return "N/A";
    const floored = Math.floor(lv);
    const decimal = (lv - floored).toFixed(1).slice(1); // ".0" や ".3"
    return decimal === ".0" ? `Lv ${floored}` : `Lv ${lv.toFixed(1)}`;
}

// ===== 古いランキングメッセージを削除する共通関数 =====
// channel: テキストチャンネル
// titleKeyword: Embedのタイトルに含まれる文字列で絞り込む
// limit: フェッチするメッセージ数
export async function deleteOldRankingMessages(channel, titleKeyword, limit = 50) {
    const fetched = await channel.messages.fetch({ limit });
    const toDelete = fetched.filter(
        (msg) => msg.embeds?.length > 0 && msg.embeds[0].title?.includes(titleKeyword)
    );
    if (toDelete.size > 0) {
        await channel.bulkDelete(toDelete, true).catch(() => {});
    }
}

// ===== Admin向け共通Embed生成 =====
export function createAdminEmbed({ title, description, color }) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ text: "by Mameneko", iconURL: FOOTER_ICON_URL })
        .setTimestamp();
}

// ===== テキストを4000文字以内のチャンクに分割（Discord Embed上限対策） =====
// lines: 表示する行の配列
// maxLength: 1チャンクの最大文字数（安全マージンを考慮して4000推奨）
export function splitIntoChunks(lines, maxLength = 4000) {
    const chunks = [];
    let chunk = [];
    let length = 0;

    for (const line of lines) {
        if (length + line.length + 1 > maxLength) {
            chunks.push(chunk);
            chunk = [];
            length = 0;
        }
        chunk.push(line);
        length += line.length + 1;
    }

    if (chunk.length > 0) chunks.push(chunk);
    return chunks;
}
