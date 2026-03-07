import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { db } from '../../core/database.js';
import { runFullUserDataUpdate } from '../../services/updateService.js';
import { splitIntoChunks } from '../../utils/embedUtils.js';

export async function handleForceCataUpdate(interaction, client) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin専用コマンドです", ephemeral: true });
    await interaction.reply("🔄 Cata等強制全件更新を開始します…");
    await runFullUserDataUpdate(client);
    return interaction.editReply("✅ バッチ更新が完了しました。詳細はボットのターミナルログを確認してください。");
}

export async function handleListRegistered(interaction) {
    if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const registered = Object.entries(db.mcidData.users);
    if (registered.length === 0) return interaction.editReply("📭 登録済みユーザーはいません");

    const list = [];
    for (const [discordId, data] of registered) {
        const member = await interaction.guild.members.fetch(discordId).catch(() => null);
        if (!member) continue;
        list.push(`• <@${discordId}> (IGN: **${data.ign ?? "不明"}**, ID: \`${discordId}\`)`);
    }

    if (list.length === 0) return interaction.editReply("⚠ 登録済みユーザーはいますが、現在サーバー在籍者はいません");

    const chunks = splitIntoChunks(list);
    for (let i = 0; i < chunks.length; i++) {
        const embed = new EmbedBuilder()
            .setTitle(chunks.length > 1 ? `📘 MCID登録済みユーザー（${i + 1}/${chunks.length}）` : "📘 MCID登録済みユーザー（在籍確認済み）")
            .setColor(0x00ff99)
            .setDescription(chunks[i].join("\n"));
        if (i === 0) await interaction.editReply({ embeds: [embed] });
        else await interaction.followUp({ embeds: [embed], ephemeral: true });
    }
}

export async function handleListUnregistered(interaction) {
    if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });
    const members = await interaction.guild.members.fetch().catch(() => null);
    if (!members) return interaction.editReply("❌ メンバー取得に失敗しました");

    const list = [];
    for (const member of members.values()) {
        if (member.user.bot) continue;
        if (db.mcidData.users[member.id]) continue;
        list.push(`• <@${member.id}> (ID: \`${member.id}\`)`);
    }

    if (list.length === 0) return interaction.editReply("✅ 全員MCID登録済みです");

    const chunks = splitIntoChunks(list);
    for (let i = 0; i < chunks.length; i++) {
        const embed = new EmbedBuilder()
            .setTitle(chunks.length > 1 ? `📕 MCID未登録ユーザー（${i + 1}/${chunks.length}）` : "📕 MCID未登録ユーザー")
            .setColor(0xff6666)
            .setDescription(chunks[i].join("\n"));
        if (i === 0) await interaction.editReply({ embeds: [embed] });
        else await interaction.followUp({ embeds: [embed], ephemeral: true });
    }
}

export async function handleUnregisterUser(interaction) {
    if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });
    
    const target = interaction.options.getUser("user");
    if (!db.mcidData.users[target.id]) return interaction.reply({ content: "❌ このユーザーは登録されていません", ephemeral: true });

    const { ign } = db.mcidData.users[target.id];
    delete db.mcidData.igns[ign];
    delete db.mcidData.users[target.id];
    db.save();

    return interaction.reply({ content: `✅ <@${target.id}> のIGN登録を解除しました`, ephemeral: true });
}
