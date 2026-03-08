import { EmbedBuilder } from 'discord.js';
import { db } from '../../core/database.js';
import { fetchUUID } from '../../core/mojangApi.js';
import { fetchAllSkyblockData } from '../../core/hypixelApi.js';
import { extractAllStats } from '../../services/skyblockParser.js';
import { updateCataRole, updateKuudraRole } from '../../services/roleService.js';
import { msToDungeonTime } from '../../utils/formatters.js';
import { constants } from '../../utils/embedUtils.js';
import { config } from '../../config/config.js';
import { 
    sendM7SPRanking, sendF7SPRanking, sendMasterSPRanking, sendSecretsRanking, 
    sendSecretsPerRunRanking, sendClassRanking, sendClassAverageRanking,
    sendKuudraT5Ranking, sendCataRanking, 
    sendMasterCompletionsRanking, sendF7CompletionsRanking 
} from '../../services/rankingService.js';


export async function handleRegisterCommand(interaction) {
    const user = interaction.user;
    const member = interaction.member;
    const ign = interaction.options.getString("ign");

    try {
        const data = await fetchUUID(ign);
        if (!data) return interaction.editReply("❌ そのMCIDは存在しません").catch(() => {});

        if (db.mcidData.users[user.id]) return interaction.editReply("❌ 既に登録済みです").catch(() => {});
        
        // MCID重複チェック + 自己修復ロジック
        const existingUuidHolder = db.mcidData.uuids?.[data.uuid];
        if (existingUuidHolder) {
            if (!db.mcidData.users[existingUuidHolder]) {
                // 持ち主がいないゴミデータなので削除して続行
                delete db.mcidData.uuids[data.uuid];
            } else if (existingUuidHolder !== user.id) {
                return interaction.editReply(`❌ そのMCIDは既に使用されています（保持者: <@${existingUuidHolder}>）`);
            }
        }

        // IGN重複チェック + 自己修復ロジック
        const existingIgnHolder = db.mcidData.igns?.[data.ign];
        if (existingIgnHolder) {
            if (!db.mcidData.users[existingIgnHolder]) {
                delete db.mcidData.igns[data.ign];
            } else if (existingIgnHolder !== user.id) {
                return interaction.editReply(`❌ そのIGNは既に使用されています（保持者: <@${existingIgnHolder}>）`);
            }
        }

        db.mcidData.users[user.id] = { uuid: data.uuid, ign: data.ign, oldNick: member.nickname ?? null };
        db.mcidData.igns[data.ign] = user.id;
        db.mcidData.uuids[data.uuid] = user.id;

        const { profiles, cleanUuid } = await fetchAllSkyblockData(data.uuid);
        if (profiles) {
            const stats = extractAllStats(profiles, cleanUuid);
            const now = Date.now();
            db.statsData[data.uuid] = {
                discordId: user.id,
                ign: data.ign,
                cataLevel: stats.cataLevel || 0,
                cataUpdated: now,
                kuudraT5: stats.kuudraT5?.t5 || 0,
                kuudraProfile: stats.kuudraT5?.profile || null,
                kuudraUpdated: now,
            };

            if (stats.cataLevel) await updateCataRole(member, stats.cataLevel);
        }

        db.save();

        const shouldChangeNick = !config.CATA_GUILD_ID || interaction.guild.id !== config.CATA_GUILD_ID;
        let nickMessage = "JDCへようこそ!登録完了です";
        if (shouldChangeNick && data.ign) {
            try {
                await member.setNickname(data.ign, "MCID登録による自動変更");
                nickMessage = `ニックネームを **${data.ign}** に変更しました ✓`;
            } catch (e) {
                console.warn(`[Register] Nickname change failed for ${member.id}:`, e.message);
                nickMessage = "ニックネーム変更に失敗しました（権限不足？）";
            }
        }

        if (interaction.guild.id === config.CATA_GUILD_ID && config.MEMBER_ROLE_ID) {
            try {
                if (!member.roles.cache.has(config.MEMBER_ROLE_ID)) await member.roles.add(config.MEMBER_ROLE_ID);
                if (config.TEMPORARY_ROLE_ID && member.roles.cache.has(config.TEMPORARY_ROLE_ID)) {
                    await member.roles.remove(config.TEMPORARY_ROLE_ID);
                }
            } catch (e) {
                console.warn("[Register] Member role addition failed", e.message);
            }
        }

        if (interaction.guild.id === config.KUUDRA_GUILD_ID) {
            await updateKuudraRole(member, user.id);
        }

        const embed = new EmbedBuilder()
            .setColor(0x2ecc71)
            .setTitle("MCID 登録完了")
            .setDescription(nickMessage)
            .addFields({ name: "IGN", value: data.ign, inline: true })
            .setFooter({ text: "by Mameneko", iconURL: constants.FOOTER_ICON_URL })
            .setTimestamp();

        return interaction.editReply({ content: `✅ **${data.ign}** を登録しました！`, embeds: [embed] }).catch(() => {});
    } catch (error) {
        console.error("[/register] 全体エラー:", error);
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply("❌ 登録中にエラーが発生しました。管理者に連絡してください。").catch(() => {});
        } else {
            return interaction.reply({ content: "❌ 登録中にエラーが発生しました。管理者に連絡してください。", ephemeral: true }).catch(() => {});
        }
    }
}

export async function handleDungeonInfoCommand(interaction) {
    let inputIgn = interaction.options.getString("username");

    if (!inputIgn) {
        const userData = db.mcidData.users[interaction.user.id];
        if (!userData?.ign) return interaction.editReply("❌ あなたはまだMCIDを登録していません。\n`/register <IGN>` で登録してください。");
        inputIgn = userData.ign;
    }

    const uuidData = await fetchUUID(inputIgn);
    if (!uuidData) return interaction.editReply(`❌ ${inputIgn} は存在しないIGNです`).catch(() => {});

    try {
        const { profiles, cleanUuid } = await fetchAllSkyblockData(uuidData.uuid);
        if (!profiles) return interaction.editReply(`❌ ${inputIgn} のSkyBlockプロファイルが見つかりません`).catch(() => {});

        const stats = extractAllStats(profiles, cleanUuid);
        if (stats.cataLevel === null) return interaction.editReply(`❌ ${inputIgn} のCatacombsデータがありません（未プレイ？）`).catch(() => {});

        const cLevel = stats.cataLevel;
        const classes = stats.classLevels;
        const classLvValues = Object.values(classes).filter(lv => lv > 0);
        const classAvg = classLvValues.length > 0 ? (classLvValues.reduce((a, b) => a + b, 0) / classLvValues.length).toFixed(1) : "N/A";

        const totalRuns = (stats.f7comps || 0) + (stats.m1comps || 0) + (stats.m2comps || 0) + (stats.m3comps || 0) + (stats.m4comps || 0) + (stats.m5comps || 0) + (stats.m6comps || 0) + (stats.m7comps || 0); // Simplified total runs calculation based on extracted data

        const totalSecrets = stats.secrets || 0;
        const secretsPerRun = totalRuns > 0 ? (totalSecrets / totalRuns).toFixed(2) : "N/A";

        // Optional: Update db.statsData here just to keep fresh
        db.statsData[uuidData.uuid] ??= { discordId: db.mcidData.uuids[uuidData.uuid], ign: uuidData.ign };
        Object.assign(db.statsData[uuidData.uuid], { cataLevel: cLevel, cataUpdated: Date.now(), secrets: totalSecrets });
        db.save();

        const embed = new EmbedBuilder()
            .setColor(cLevel >= 50 ? constants.EMBED_COLOR_GOLD : constants.EMBED_COLOR_PURPLE)
            .setTitle(`Dungeon Stats for ${uuidData.ign}`)
            .setDescription(`**Catacombs Level: ${cLevel.toFixed(1)}**${cLevel >= 50 ? " ✨" : ""}`)
            .setThumbnail(`https://mc-heads.net/avatar/${uuidData.uuid}/128.png`)
            .addFields(
                { name: "**Healer**", value: `Lv ${classes.healer.toFixed(1)}`, inline: true },
                { name: "**Mage**", value: `Lv ${classes.mage.toFixed(1)}`, inline: true },
                { name: "**Berserk**", value: `Lv ${classes.berserk.toFixed(1)}`, inline: true },
                { name: "**Archer**", value: `Lv ${classes.archer.toFixed(1)}`, inline: true },
                { name: "**Tank**", value: `Lv ${classes.tank.toFixed(1)}`, inline: true },
                { name: "**Class Avg**", value: classAvg, inline: true },
                { name: "**Total Runs (F7+MM)**", value: totalRuns.toLocaleString(), inline: true },
                { name: "**Secrets Found**", value: totalSecrets.toLocaleString(), inline: true },
                { name: "**Per Run**", value: secretsPerRun, inline: true },
                { name: "**F7 S+ PB**", value: stats.f7sp ? msToDungeonTime(stats.f7sp * 1000) : "N/A", inline: true },
                { name: "**M7 S+ PB**", value: stats.m7sp ? msToDungeonTime(stats.m7sp * 1000) : "N/A", inline: true }
            )
            .setFooter({ text: "by Mameneko", iconURL: constants.FOOTER_ICON_URL })
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] }).catch(() => {});
    } catch (err) {
        console.error("[dungeon_info error]", err);
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply(`❌ ${inputIgn} のデータ取得に失敗しました`).catch(() => {});
        } else {
            return interaction.reply({ content: `❌ ${inputIgn} のデータ取得に失敗しました`, ephemeral: true }).catch(() => {});
        }
    }
}

export async function handleKuudraT5Command(interaction) {
    const inputIgn = interaction.options.getString("ign")?.trim();
    if (!inputIgn) return interaction.editReply({ content: "IGNを入力してください。", ephemeral: true });

    try {
        const uuidData = await fetchUUID(inputIgn);
        if (!uuidData) return interaction.editReply(`「${inputIgn}」というMinecraftプレイヤーは存在しません。`).catch(() => {});

        const registeredUserDiscordId = db.mcidData.uuids[uuidData.uuid];
        const discordMention = registeredUserDiscordId ? `<@${registeredUserDiscordId}>` : "未登録";

        const { profiles, cleanUuid } = await fetchAllSkyblockData(uuidData.uuid);
        if (!profiles) return interaction.editReply(`${uuidData.ign} のKuudraデータが取得できませんでした（未プレイの可能性）`).catch(() => {});

        const stats = extractAllStats(profiles, cleanUuid);
        const t5 = stats.kuudraT5?.t5;
        const profileName = stats.kuudraT5?.profile;

        if (t5 === null || t5 === undefined) {
            return interaction.editReply(`${uuidData.ign} のKuudraデータが取得できませんでした（未プレイの可能性）`).catch(() => {});
        }

        const embed = new EmbedBuilder()
            .setColor(t5 >= 10000 ? constants.EMBED_COLOR_GOLD : constants.EMBED_COLOR_PURPLE)
            .setTitle(`Kuudra Infernal (T5) Stats - ${uuidData.ign}`)
            .setDescription(`**${t5.toLocaleString()} runs**${t5 >= 10000 ? " 👑 **Over 10k+**" : ""}`)
            .setThumbnail(`https://mc-heads.net/avatar/${uuidData.uuid}/128.png`)
            .addFields(
                { name: "Discord", value: discordMention, inline: true },
                { name: "IGN", value: `\`${uuidData.ign}\``, inline: true }
            );

        if (profileName) embed.addFields({ name: "Profile", value: profileName, inline: true });
        if (t5 === 0) embed.setDescription("まだ **Kuudra Infernal (T5)** をクリアしていません").setColor(0x5865f2);

        embed.setFooter({ text: "by Mameneko", iconURL: constants.FOOTER_ICON_URL }).setTimestamp();
        return interaction.editReply({ embeds: [embed] }).catch(() => {});
    } catch (error) {
        console.error("[/kuudra_t5] エラー:", error);
        if (interaction.deferred || interaction.replied) {
            return interaction.editReply({ content: "データの取得中にエラーが発生しました。" }).catch(() => {});
        } else {
            return interaction.reply({ content: "データの取得中にエラーが発生しました。", ephemeral: true }).catch(() => {});
        }
    }
}

// ==========================================
// User-triggered Ranking display commands
// ==========================================

export async function handleCata50RankCommand(interaction, client) {
    if (interaction.channelId !== config.CATA50_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.CATA50_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendCataRanking(client);
    return interaction.deleteReply().catch(() => {});
}

export async function handleCataRankCommand(interaction, client) {
    // 動作としてはCata50Rankと同じ（名称揺れ対応）
    return handleCata50RankCommand(interaction, client);
}

export async function handleM7SPRankCommand(interaction, client) {
    if (interaction.channelId !== config.M7SP_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.M7SP_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendM7SPRanking(client);
    return interaction.deleteReply().catch(() => {});
}

export async function handleF7SPRankCommand(interaction, client) {
    if (interaction.channelId !== config.F7SP_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.F7SP_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendF7SPRanking(client);
    return interaction.deleteReply().catch(() => {});
}

export async function handleSecretsRankCommand(interaction, client) {
    if (interaction.channelId !== config.SECRETS_RANK_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.SECRETS_RANK_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendSecretsRanking(client);
    return interaction.deleteReply().catch(() => {});
}

export async function handleKuudraT5RankCommand(interaction, client) {
    if (interaction.channelId !== config.KUUDRA_T5_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.KUUDRA_T5_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendKuudraT5Ranking(client);
    return interaction.deleteReply().catch(() => {});
}

export async function handleF7CompsRankCommand(interaction, client) {
    if (interaction.channelId !== config.F7_COMPLETIONS_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.F7_COMPLETIONS_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendF7CompletionsRanking(client);
    return interaction.deleteReply().catch(() => {});
}

export async function handleM7CompsRankCommand(interaction, client) {
    if (interaction.channelId !== config.M7_COMPLETIONS_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.M7_COMPLETIONS_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendMasterCompletionsRanking(client, 7);
    return interaction.deleteReply().catch(() => {});
}

export async function handleM6CompsRankCommand(interaction, client) {
    if (interaction.channelId !== config.M6_COMPLETIONS_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.M6_COMPLETIONS_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendMasterCompletionsRanking(client, 6);
    return interaction.deleteReply().catch(() => {});
}

export async function handleM5CompsRankCommand(interaction, client) {
    if (interaction.channelId !== config.M5_COMPLETIONS_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.M5_COMPLETIONS_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendMasterCompletionsRanking(client, 5);
    return interaction.deleteReply().catch(() => {});
}

export async function handleM4CompsRankCommand(interaction, client) {
    if (interaction.channelId !== config.M4_COMPLETIONS_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.M4_COMPLETIONS_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendMasterCompletionsRanking(client, 4);
    return interaction.deleteReply().catch(() => {});
}

export async function handleM3CompsRankCommand(interaction, client) {
    if (interaction.channelId !== config.M3_COMPLETIONS_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.M3_COMPLETIONS_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendMasterCompletionsRanking(client, 3);
    return interaction.deleteReply().catch(() => {});
}

export async function handleM2CompsRankCommand(interaction, client) {
    if (interaction.channelId !== config.M2_COMPLETIONS_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.M2_COMPLETIONS_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendMasterCompletionsRanking(client, 2);
    return interaction.deleteReply().catch(() => {});
}

export async function handleM1CompsRankCommand(interaction, client) {
    if (interaction.channelId !== config.M1_COMPLETIONS_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.M1_COMPLETIONS_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendMasterCompletionsRanking(client, 1);
    return interaction.deleteReply().catch(() => {});
}

export async function handleSecretsPerRunRankCommand(interaction, client) {
    if (interaction.channelId !== config.SECRETS_PER_RUN_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.SECRETS_PER_RUN_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendSecretsPerRunRanking(client);
    return interaction.deleteReply().catch(() => {});
}

export async function handleClassRankCommand(interaction, client, className) {
    if (interaction.channelId !== config.CLASS_RANK_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.CLASS_RANK_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendClassRanking(client, className);
    return interaction.deleteReply().catch(() => {});
}

export async function handleClassAverageRankCommand(interaction, client) {
    if (interaction.channelId !== config.CLASS_AVG_CHANNEL_ID && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config.CLASS_AVG_CHANNEL_ID}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendClassAverageRanking(client);
    return interaction.deleteReply().catch(() => {});
}

export async function handleMasterSPRankCommand(interaction, client, floor) {
    if (interaction.channelId !== config[`M${floor}SP_CHANNEL_ID`] && interaction.channelId !== config.AUTO_CLEAR_CHANNEL_ID) {
        return interaction.reply({ content: `❌ このコマンドは <#${config[`M${floor}SP_CHANNEL_ID`]}> でのみ実行可能です`, ephemeral: true });
    }
    await interaction.deferReply();
    await sendMasterSPRanking(client, floor);
    return interaction.deleteReply().catch(() => {});
}


