import { EmbedBuilder, PermissionsBitField } from 'discord.js';
import { db } from '../../core/database.js';
import { runFullUserDataUpdate } from '../../services/updateService.js';
import { splitIntoChunks } from '../../utils/embedUtils.js';
import { 
    sendM7SPRanking, sendF7SPRanking, sendMasterSPRanking, sendSecretsRanking, 
    sendSecretsPerRunRanking, sendClassRanking, sendClassAverageRanking,
    sendKuudraT5Ranking, sendCataRanking, 
    sendMasterCompletionsRanking, sendF7CompletionsRanking 
} from '../../services/rankingService.js';

export async function handleForceCataUpdate(interaction, client) {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin専用コマンドです", ephemeral: true });
    
    await interaction.reply("🔄 Cata等強制全件更新を開始します…（人数が多い場合、完了まで数分〜十数分かかります。完了後に通知します）");
    
    // 時間がかかりDiscordの15分制限(Webhook Token Invalid)を超えるため、バックグラウンド実行して別途送信する
    runFullUserDataUpdate(client).then(() => {
        interaction.channel.send(`✅ <@${interaction.user.id}> バッチ更新が完了しました。詳細はボットのターミナルログを確認してください。`).catch(() => {});
    }).catch((err) => {
        console.error("[ForceUpdate] Error:", err);
        interaction.channel.send(`❌ <@${interaction.user.id}> バッチ更新処理中にエラーが発生しました。`).catch(() => {});
    });
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

export async function handleForceRankingUpdate(interaction, client) {
    if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

    const type = interaction.options.getString("type");
    await interaction.reply(`🔄 ランキング(${type})の送信を開始します…`);

    try {
        switch (type) {
            case "all":
                await sendCataRanking(client);
                await sendM7SPRanking(client);
                await sendF7SPRanking(client);
                await sendSecretsRanking(client);
                await sendKuudraT5Ranking(client);
                await sendF7CompletionsRanking(client);
                for (let i = 7; i >= 1; i--) {
                    await sendMasterCompletionsRanking(client, i);
                    await sendMasterSPRanking(client, i);
                }
                await sendSecretsPerRunRanking(client);
                for (const cls of ['healer', 'mage', 'berserk', 'archer', 'tank']) {
                    await sendClassRanking(client, cls);
                }
                await sendClassAverageRanking(client);
                break;
            case "all_mcomps":
                for (let i = 7; i >= 1; i--) await sendMasterCompletionsRanking(client, i);
                break;
            case "all_msp":
                for (let i = 7; i >= 1; i--) await sendMasterSPRanking(client, i);
                break;
            case "all_classes":
                for (const cls of ['healer', 'mage', 'berserk', 'archer', 'tank']) {
                    await sendClassRanking(client, cls);
                }
                break;
            case "cata": await sendCataRanking(client); break;
            case "m7sp": await sendM7SPRanking(client); break;
            case "f7sp": await sendF7SPRanking(client); break;
            case "secrets": await sendSecretsRanking(client); break;
            case "secretspr": await sendSecretsPerRunRanking(client); break;
            case "kuudra": await sendKuudraT5Ranking(client); break;
            case "f7comps": await sendF7CompletionsRanking(client); break;
            case "m7comps": await sendMasterCompletionsRanking(client, 7); break;
            case "clsavg": await sendClassAverageRanking(client); break;
            default: return interaction.editReply("❌ 無効なタイプです");
        }
        return interaction.editReply(`✅ ランキング(${type})を送信しました。対象チャンネルを確認してください。`);
    } catch (e) {
        console.error(`[ForceRanking] ${type} failed:`, e);
        return interaction.editReply(`❌ ランキング(${type})の送信中にエラーが発生しました`);
    }
}
