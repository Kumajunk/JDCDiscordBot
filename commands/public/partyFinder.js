import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { db } from '../../core/database.js';

// Dictionary to hold active parties in memory: { guildId: [ { messageId, author, floor, max, members: [], ... }, ... ] }
export const activeParties = new Map();

function getMentionRoles(floor) {
    switch (floor.toUpperCase()) {
        case "F1": case "F2": case "F3": case "F4": case "F5": case "F6": return ["F1~F6"];
        case "F7": return ["F7"];
        case "M1": case "M2": case "M3": case "M4": return ["M1~M4"];
        case "M5": case "M6": return ["M5~M6"];
        case "M7": return ["M7"];
        default: return [];
    }
}

function buildRoleMentions(guild, names) {
    return names.map((n) => guild.roles.cache.find((r) => r.name === n)).filter(Boolean).map((r) => `<@&${r.id}>`).join(" ");
}

function buildPfEmbed(party) {
    const list = party.members.length
        ? party.members.map((id) => `<@${id}> (\`${db.mcidData.users[id]?.ign ?? "未登録"}\`)`).join("\n")
        : "なし";

    let desc = `募集者: <@${party.author}>\nフロア: **${party.floor}**\n`;
    if (party.description) desc += `\n**説明文:**${party.description}\n`;
    desc += `\n👥 募集人数: ${party.members.length}/${party.max}\n\n**参加メンバー**\n${list}`;

    return new EmbedBuilder().setTitle("Party Finder").setColor(0x00ffff).setDescription(desc);
}

function buildPfButtons(party) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("join_party").setLabel("参加する").setStyle(ButtonStyle.Primary).setDisabled(party.members.length >= party.max),
        new ButtonBuilder().setCustomId("leave_party").setLabel("参加取り消し").setStyle(ButtonStyle.Secondary).setDisabled(party.members.length === 0),
        new ButtonBuilder().setCustomId("create_vc").setLabel("VC作成").setStyle(ButtonStyle.Success).setDisabled(!!party.vcId),
        new ButtonBuilder().setCustomId("end_party").setLabel("募集終了").setStyle(ButtonStyle.Danger)
    );
}

export async function handlePfCommand(interaction) {
    const { guild, user } = interaction;
    const floor = interaction.options.getString("floor");
    let max = interaction.options.getInteger("member");
    const description = interaction.options.getString("description") || "";

    if (max > 4) max = 4;
    if (max < 1) max = 1;

    const party = { messageId: null, mentionMessageId: null, author: user.id, floor, max, members: [], vcId: null, threadId: null, description };

    const msg = await interaction.reply({ embeds: [buildPfEmbed(party)], components: [buildPfButtons(party)], fetchReply: true });

    const mentions = buildRoleMentions(guild, getMentionRoles(floor));
    if (mentions) {
        const mentionMsg = await msg.channel.send(`📢 ${mentions}\n**Dungeon募集が作成されました！**`);
        party.mentionMessageId = mentionMsg.id;
    }

    const thread = await msg.startThread({ name: `Dungeon-${floor}`, autoArchiveDuration: 60 });
    party.messageId = msg.id;
    party.threadId = thread.id;

    if (!activeParties.has(guild.id)) activeParties.set(guild.id, []);
    activeParties.get(guild.id).push(party);
}

export async function handlePfButtonInteraction(interaction) {
    try {
        await interaction.deferReply({ ephemeral: true });
    } catch (error) {
        console.error("Failed to defer interaction:", error);
        return;
    }

    const { guild, user, customId, message } = interaction;
    const parties = activeParties.get(guild.id) || [];
    const partyIndex = parties.findIndex(p => p.messageId === message.id);
    if (partyIndex === -1) return interaction.editReply({ content: "❌ この募集は終了しているか、見つかりません。" });
    
    const party = parties[partyIndex];

    if (customId === "join_party") {
        if (party.members.includes(user.id) || party.author === user.id) return interaction.editReply({ content: "既に加入しています" });
        if (party.members.length >= party.max) return interaction.editReply({ content: "満員です" });
        
        party.members.push(user.id);
        await message.edit({ embeds: [buildPfEmbed(party)], components: [buildPfButtons(party)] });
        return interaction.editReply({ content: "参加しました！" });
    } 
    else if (customId === "leave_party") {
        if (!party.members.includes(user.id)) return interaction.editReply({ content: "参加していません" });
        
        party.members = party.members.filter(id => id !== user.id);
        await message.edit({ embeds: [buildPfEmbed(party)], components: [buildPfButtons(party)] });
        return interaction.editReply({ content: "脱退しました" });
    }
    else if (customId === "end_party") {
        if (party.author !== user.id && !interaction.member.permissions.has("Administrator")) {
            return interaction.editReply({ content: "募集者または管理者のみが終了できます" });
        }
        
        parties.splice(partyIndex, 1);
        await message.delete().catch(() => {});
        if (party.mentionMessageId) {
            message.channel.messages.fetch(party.mentionMessageId).then(m => m.delete()).catch(() => {});
        }
        if (party.threadId) guild.channels.cache.get(party.threadId)?.delete().catch(() => {});
        if (party.vcId) guild.channels.cache.get(party.vcId)?.delete().catch(() => {});
        return interaction.editReply({ content: "募集を終了しました" });
    }
    else if (customId === "create_vc") {
        if (party.author !== user.id) return interaction.editReply({ content: "募集者のみ作成可能です" });
        if (party.vcId) return interaction.editReply({ content: "作成済みです" });

        try {
            const vc = await guild.channels.create({
                name: `Dungeon: ${party.floor}`,
                type: 2, // GUILD_VOICE
                userLimit: party.max + 1,
            });
            party.vcId = vc.id;
            await message.edit({ embeds: [buildPfEmbed(party)], components: [buildPfButtons(party)] });
            return interaction.editReply({ content: `VCを作成しました: <#${vc.id}>` });
        } catch (e) {
            console.error("VC creation failed", e);
            return interaction.editReply({ content: "VC作成に失敗しました" });
        }
    }
}
