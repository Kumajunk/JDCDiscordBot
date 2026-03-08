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
import { fetchUUID } from '../../core/mojangApi.js';
import { fetchAllSkyblockData } from '../../core/hypixelApi.js';
import { extractAllStats } from '../../services/skyblockParser.js';
import { updateCataRole, updateKuudraRole } from '../../services/roleService.js';
import { constants } from '../../utils/embedUtils.js';
import { config } from '../../config/config.js';

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

    const registered = Object.entries(db.mcidData.users);
    if (registered.length === 0) return interaction.editReply("📭 登録済みユーザーはいません").catch(() => {});

    const list = [];
    for (const [discordId, data] of registered) {
        const member = await interaction.guild.members.fetch(discordId).catch(() => null);
        if (!member) continue;
        list.push(`• <@${discordId}> (IGN: **${data.ign ?? "不明"}**, ID: \`${discordId}\`)`);
    }

    if (list.length === 0) return interaction.editReply("⚠ 登録済みユーザーはいますが、現在サーバー在籍者はいません").catch(() => {});

    const chunks = splitIntoChunks(list);
    for (let i = 0; i < chunks.length; i++) {
        const embed = new EmbedBuilder()
            .setTitle(chunks.length > 1 ? `📘 MCID登録済みユーザー（${i + 1}/${chunks.length}）` : "📘 MCID登録済みユーザー（在籍確認済み）")
            .setColor(0x00ff99)
            .setDescription(chunks[i].join("\n"));
        if (i === 0) await interaction.editReply({ embeds: [embed] }).catch(() => {});
        else await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
    }
}

export async function handleListUnregistered(interaction) {
    if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

    const members = await interaction.guild.members.fetch().catch(() => null);
    if (!members) return interaction.editReply("❌ メンバー取得に失敗しました").catch(() => {});

    const list = [];
    for (const member of members.values()) {
        if (member.user.bot) continue;
        if (db.mcidData.users[member.id]) continue;
        list.push(`• <@${member.id}> (ID: \`${member.id}\`)`);
    }

    if (list.length === 0) return interaction.editReply("✅ 全員MCID登録済みです").catch(() => {});

    const chunks = splitIntoChunks(list);
    for (let i = 0; i < chunks.length; i++) {
        const embed = new EmbedBuilder()
            .setTitle(chunks.length > 1 ? `📕 MCID未登録ユーザー（${i + 1}/${chunks.length}）` : "📕 MCID未登録ユーザー")
            .setColor(0xff6666)
            .setDescription(chunks[i].join("\n"));
        if (i === 0) await interaction.editReply({ embeds: [embed] }).catch(() => {});
        else await interaction.followUp({ embeds: [embed], ephemeral: true }).catch(() => {});
    }
}

export async function handleUnregisterUser(interaction) {
    if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });
    
    const target = interaction.options.getUser("user");
    const targetId = target.id;
    
    let deletedCount = 0;

    // 1. ユーザーメインデータの削除
    if (db.mcidData.users[targetId]) {
        const { ign, uuid } = db.mcidData.users[targetId];
        if (ign) delete db.mcidData.igns[ign];
        if (uuid) delete db.mcidData.uuids[uuid];
        delete db.mcidData.users[targetId];
        deletedCount++;
    }

    // 2. DB全体のインデックスをスキャンして、このターゲットIDに紐付いているゴミを全て削除（不整合対策）
    for (const [ign, id] of Object.entries(db.mcidData.igns)) {
        if (id === targetId) { delete db.mcidData.igns[ign]; deletedCount++; }
    }
    for (const [uuid, id] of Object.entries(db.mcidData.uuids)) {
        if (id === targetId) { delete db.mcidData.uuids[uuid]; deletedCount++; }
    }

    if (deletedCount === 0) return interaction.editReply({ content: "❌ このユーザーに関連する登録データは見つかりませんでした" }).catch(() => {});

    db.save();
    return interaction.editReply({ content: `✅ <@${targetId}> に関するすべての登録データを強制解除しました（計 ${deletedCount} 件の情報を削除）。再登録が可能です。` }).catch(() => {});
}

export async function handleForceUnregisterMCID(interaction) {
    if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });
    
    const input = interaction.options.getString("mcid_or_ign");
    
    let deleted = false;
    let targetDiscordId = null;

    // IGN検索
    if (db.mcidData.igns[input]) {
        targetDiscordId = db.mcidData.igns[input];
        delete db.mcidData.igns[input];
        deleted = true;
    }
    // UUID検索（ハイフンなしに統一してチェック）
    const cleanUuid = input.replace(/-/g, "");
    if (db.mcidData.uuids[cleanUuid]) {
        targetDiscordId = db.mcidData.uuids[cleanUuid];
        delete db.mcidData.uuids[cleanUuid];
        deleted = true;
    }

    if (targetDiscordId) {
        // 紐付いていたユーザー情報の削除
        if (db.mcidData.users[targetDiscordId]) {
            const { ign, uuid } = db.mcidData.users[targetDiscordId];
            if (ign) delete db.mcidData.igns[ign];
            if (uuid) delete db.mcidData.uuids[uuid];
            delete db.mcidData.users[targetDiscordId];
        }
    }

    if (!deleted) return interaction.editReply({ content: `❌ 指定された MCID/IGN (\`${input}\`) はDB内に見つかりませんでした` }).catch(() => {});

    db.save();
    return interaction.editReply({ content: `✅ MCID/IGN \`${input}\` の登録を強制解除し、使用可能な状態にしました。` }).catch(() => {});
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
        return interaction.editReply(`✅ ランキング(${type})を送信しました。対象チャンネルを確認してください。`).catch(() => {});
    } catch (e) {
        console.error(`[ForceRanking] ${type} failed:`, e);
        return interaction.editReply(`❌ ランキング(${type})の送信中にエラーが発生しました`).catch(() => {});
    }
}

export async function handleFixDBIntegrity(interaction) {
    if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });
    
    const userIds = new Set(Object.keys(db.mcidData.users));
    let orphanIgns = 0;
    let orphanUuids = 0;

    for (const [ign, id] of Object.entries(db.mcidData.igns)) {
        if (!userIds.has(id)) {
            delete db.mcidData.igns[ign];
            orphanIgns++;
        }
    }
    for (const [uuid, id] of Object.entries(db.mcidData.uuids)) {
        if (!userIds.has(id)) {
            delete db.mcidData.uuids[uuid];
            orphanUuids++;
        }
    }

    if (orphanIgns === 0 && orphanUuids === 0) {
        return interaction.editReply({ content: "✅ データベースの整合性は正常です。ゴミデータは見つかりませんでした。" }).catch(() => {});
    }

    db.save();
    return interaction.editReply({ content: `✅ データベースの不整合を修正しました。\n・削除した古いIGN情報: ${orphanIgns}件\n・削除した古いUUID情報: ${orphanUuids}件` }).catch(() => {});
}

export async function handleRegisterUser(interaction) {
    if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

    const targetUser = interaction.options.getUser("user");
    const ign = interaction.options.getString("ign");

    try {
        const data = await fetchUUID(ign);
        if (!data) return interaction.editReply(`❌ 指定されたMCID (**${ign}**) は存在しません`).catch(() => {});

        // 重複チェック (User)
        if (db.mcidData.users[targetUser.id]) return interaction.editReply(`❌ <@${targetUser.id}> は既に登録済みです（登録内容: ${db.mcidData.users[targetUser.id].ign}）`).catch(() => {});
        
        // MCID重複チェック
        const existingUuidHolder = db.mcidData.uuids?.[data.uuid];
        if (existingUuidHolder) {
            if (!db.mcidData.users[existingUuidHolder]) {
                delete db.mcidData.uuids[data.uuid];
            } else if (existingUuidHolder !== targetUser.id) {
                return interaction.editReply(`❌ そのMCIDは既に使用されています（保持者: <@${existingUuidHolder}>）`).catch(() => {});
            }
        }

        // IGN重複チェック
        const existingIgnHolder = db.mcidData.igns?.[data.ign];
        if (existingIgnHolder) {
            if (!db.mcidData.users[existingIgnHolder]) {
                delete db.mcidData.igns[data.ign];
            } else if (existingIgnHolder !== targetUser.id) {
                return interaction.editReply(`❌ そのIGNは既に使用されています（保持者: <@${existingIgnHolder}>）`).catch(() => {});
            }
        }

        // データの保存
        const targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
        db.mcidData.users[targetUser.id] = { uuid: data.uuid, ign: data.ign, oldNick: targetMember?.nickname ?? null };
        db.mcidData.igns[data.ign] = targetUser.id;
        db.mcidData.uuids[data.uuid] = targetUser.id;

        // 初期スタッツ取得
        const { profiles, cleanUuid } = await fetchAllSkyblockData(data.uuid);
        if (profiles) {
            const stats = extractAllStats(profiles, cleanUuid);
            const now = Date.now();
            db.statsData[data.uuid] = {
                discordId: targetUser.id,
                ign: data.ign,
                cataLevel: stats.cataLevel || 0,
                cataUpdated: now,
                kuudraT5: stats.kuudraT5?.t5 || 0,
                kuudraProfile: stats.kuudraT5?.profile || null,
                kuudraUpdated: now,
            };

            if (targetMember && stats.cataLevel) await updateCataRole(targetMember, stats.cataLevel);
        }

        db.save();

        let nickMessage = `<@${targetUser.id}> の登録を完了しました`;
        if (targetMember) {
            const shouldChangeNick = !config.CATA_GUILD_ID || interaction.guild.id !== config.CATA_GUILD_ID;
            if (shouldChangeNick && data.ign) {
                try {
                    await targetMember.setNickname(data.ign, "AdminによるMCID登録");
                    nickMessage = `<@${targetUser.id}> のニックネームを **${data.ign}** に変更し、登録を完了しました ✓`;
                } catch {
                    nickMessage = `<@${targetUser.id}> のニックネーム変更に失敗しました（権限不足？）が、登録は完了しました`;
                }
            }

            // ロール付与
            if (interaction.guild.id === config.CATA_GUILD_ID && config.MEMBER_ROLE_ID) {
                try {
                    if (!targetMember.roles.cache.has(config.MEMBER_ROLE_ID)) await targetMember.roles.add(config.MEMBER_ROLE_ID);
                    if (config.TEMPORARY_ROLE_ID && targetMember.roles.cache.has(config.TEMPORARY_ROLE_ID)) {
                        await targetMember.roles.remove(config.TEMPORARY_ROLE_ID);
                    }
                } catch (e) {
                    console.warn("[RegisterUser] Role addition failed", e.message);
                }
            }
            if (interaction.guild.id === config.KUUDRA_GUILD_ID) {
                await updateKuudraRole(targetMember, targetUser.id);
            }
        }

        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("Admin: ユーザー登録完了")
            .setDescription(nickMessage)
            .addFields(
                { name: "対象ユーザー", value: `<@${targetUser.id}>`, inline: true },
                { name: "IGN", value: data.ign, inline: true }
            )
            .setFooter({ text: "by Mameneko", iconURL: constants.FOOTER_ICON_URL })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] }).catch(() => {});
    } catch (error) {
        console.error("[/register_user] エラー:", error);
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply("❌ 登録中にエラーが発生しました。").catch(() => {});
        } else {
            return interaction.reply({ content: "❌ 登録中にエラーが発生しました。", ephemeral: true }).catch(() => {});
        }
    }
}
