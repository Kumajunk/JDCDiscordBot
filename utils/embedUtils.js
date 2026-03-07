import { EmbedBuilder } from "discord.js";

export const constants = {
    MAX_RANKING_DISPLAY: 25,
    CATA_HIGH_LEVEL: 50,
    EMBED_COLOR_GOLD: 0xffd700,
    EMBED_COLOR_PURPLE: 0x9c27b0,
    FOOTER_ICON_URL: "https://files.catbox.moe/56r55u.jpg"
};

/**
 * Creates a common embed for Admin messages.
 * @param {Object} options 
 * @param {string} options.title 
 * @param {string} options.description 
 * @param {number} options.color 
 * @returns {EmbedBuilder}
 */
export function createAdminEmbed({ title, description, color }) {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setFooter({ text: "by Mameneko", iconURL: constants.FOOTER_ICON_URL })
        .setTimestamp();
}

/**
 * Splits lines of text into chunks to respect Discord's 4000 character limit per embed description.
 * @param {string[]} lines 
 * @param {number} maxLength 
 * @returns {string[][]} Array of line-chunks
 */
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

/**
 * Deletes old ranking messages from a channel that match a specific title keyword.
 * @param {import('discord.js').TextChannel} channel 
 * @param {string} titleKeyword 
 * @param {number} limit 
 */
export async function deleteOldRankingMessages(channel, titleKeyword, limit = 50) {
    if (!channel || !channel.isTextBased()) return;
    try {
        const fetched = await channel.messages.fetch({ limit });
        const toDelete = fetched.filter(
            (msg) => msg.embeds?.length > 0 && msg.embeds[0].title?.includes(titleKeyword)
        );
        if (toDelete.size > 0) {
            await channel.bulkDelete(toDelete, true).catch(() => {});
        }
    } catch (err) {
        console.error(`[deleteOldRankingMessages] Error for ${titleKeyword}:`, err.message);
    }
}
