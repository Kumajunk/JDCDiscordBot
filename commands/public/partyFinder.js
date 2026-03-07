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

    const party = { messageId: null, author: user.id, floor, max, members: [], vcId: null, threadId: null, description };

    const msg = await interaction.reply({ embeds: [buildPfEmbed(party)], components: [buildPfButtons(party)], fetchReply: true });

    const mentions = buildRoleMentions(guild, getMentionRoles(floor));
    if (mentions) {
        await msg.channel.send(`📢 ${mentions}\n**Dungeon募集が作成されました！**`);
    }

    const thread = await msg.startThread({ name: `Dungeon-${floor}`, autoArchiveDuration: 60 });
    party.messageId = msg.id;
    party.threadId = thread.id;

    if (!activeParties.has(guild.id)) activeParties.set(guild.id, []);
    activeParties.get(guild.id).push(party);
}

export async function handlePfButtonInteraction(interaction) {
    const { guild, user, customId, message } = interaction;
    const parties = activeParties.get(guild.id) || [];
    const partyIndex = parties.findIndex(p => p.messageId === message.id);
    if (partyIndex === -1) return interaction.reply({ content: "❌ この募集は終了しているか、見つかりません。", ephemeral: true });
    
    const party = parties[partyIndex];

    if (customId === "join_party") {
        if (party.members.includes(user.id) || party.author === user.id) return interaction.reply({ content: "既に加入しています", ephemeral: true });
        if (party.members.length >= party.max) return interaction.reply({ content: "満員です", ephemeral: true });
        
        party.members.push(user.id);
        await message.edit({ embeds: [buildPfEmbed(party)], components: [buildPfButtons(party)] });
        return interaction.reply({ content: "参加しました！", ephemeral: true });
    } 
    else if (customId === "leave_party") {
        if (!party.members.includes(user.id)) return interaction.reply({ content: "参加していません", ephemeral: true });
        
        party.members = party.members.filter(id => id !== user.id);
        await message.edit({ embeds: [buildPfEmbed(party)], components: [buildPfButtons(party)] });
        return interaction.reply({ content: "脱退しました", ephemeral: true });
    }
    else if (customId === "end_party") {
        if (party.author !== user.id && !interaction.member.permissions.has("Administrator")) {
            return interaction.reply({ content: "募集者または管理者のみが終了できます", ephemeral: true });
        }
        
        parties.splice(partyIndex, 1);
        await message.delete().catch(() => {});
        if (party.threadId) guild.channels.cache.get(party.threadId)?.delete().catch(() => {});
        if (party.vcId) guild.channels.cache.get(party.vcId)?.delete().catch(() => {});
        return interaction.reply({ content: "募集を終了しました", ephemeral: true });
    }
    else if (customId === "create_vc") {
        if (party.author !== user.id) return interaction.reply({ content: "募集者のみ作成可能です", ephemeral: true });
        if (party.vcId) return interaction.reply({ content: "作成済みです", ephemeral: true });

        try {
            const vc = await guild.channels.create({
                name: `Dungeon: ${party.floor}`,
                type: 2, // GUILD_VOICE
                userLimit: party.max + 1,
            });
            party.vcId = vc.id;
            await message.edit({ embeds: [buildPfEmbed(party)], components: [buildPfButtons(party)] });
            return interaction.reply({ content: `VCを作成しました: <#${vc.id}>`, ephemeral: true });
        } catch (e) {
            console.error("VC creation failed", e);
            return interaction.reply({ content: "VC作成に失敗しました", ephemeral: true });
        }
    }
}
