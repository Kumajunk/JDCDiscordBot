import { EmbedBuilder, PermissionsBitField } from "discord.js";
import { splitIntoChunks, msToDungeonTime, EMBED_COLOR_GOLD, EMBED_COLOR_PURPLE, FOOTER_ICON_URL } from "./utils.js";

// ===== 共有コンテキスト =====
// initCommands() で初期化される
let client, mcidData, saveMCID, parties;
let isCataGuild, isKuudraGuild;
let fetchUUID, isValidMCID, getCatacombsLevel, fetchKuudraT5, getSecretsFound;
let updateCataRole, updateKuudraRole, buildEmbed, buildButtons, buildRoleMentions, getMentionRoles;
let xpToCataLevelDecimal, loadBoostData, saveBoostData;
let HYPIXEL_API_KEY, MEMBER_ROLE_ID, TEMPORARY_ROLE_ID, BOOST_ROLE_ID, ADMIN_ROLE_ID, VC_CATEGORY_IDS;
let sleep;

export function initCommands(ctx) {
  client              = ctx.client;
  mcidData            = ctx.mcidData;
  saveMCID            = ctx.saveMCID;
  parties             = ctx.parties;
  isCataGuild         = ctx.isCataGuild;
  isKuudraGuild       = ctx.isKuudraGuild;
  fetchUUID           = ctx.fetchUUID;
  isValidMCID         = ctx.isValidMCID;
  getCatacombsLevel   = ctx.getCatacombsLevel;
  fetchKuudraT5       = ctx.fetchKuudraT5;
  getSecretsFound     = ctx.getSecretsFound;
  updateCataRole      = ctx.updateCataRole;
  updateKuudraRole    = ctx.updateKuudraRole;
  buildEmbed          = ctx.buildEmbed;
  buildButtons        = ctx.buildButtons;
  buildRoleMentions   = ctx.buildRoleMentions;
  getMentionRoles     = ctx.getMentionRoles;
  xpToCataLevelDecimal = ctx.xpToCataLevelDecimal;
  loadBoostData       = ctx.loadBoostData;
  saveBoostData       = ctx.saveBoostData;
  HYPIXEL_API_KEY     = ctx.HYPIXEL_API_KEY;
  MEMBER_ROLE_ID      = ctx.MEMBER_ROLE_ID;
  TEMPORARY_ROLE_ID   = ctx.TEMPORARY_ROLE_ID;
  BOOST_ROLE_ID       = ctx.BOOST_ROLE_ID;
  ADMIN_ROLE_ID       = ctx.ADMIN_ROLE_ID;
  VC_CATEGORY_IDS     = ctx.VC_CATEGORY_IDS;
  sleep               = ctx.sleep;
}

// ===== /register =====
export async function handleRegisterCommand(interaction) {
  const user   = interaction.user;
  const member = interaction.member;
  const ign    = interaction.options.getString("ign");

  await interaction.deferReply({ ephemeral: true });

  try {
    const data = await fetchUUID(ign);
    if (!data) return interaction.editReply("❌ そのMCIDは存在しません");

    if (mcidData.users[user.id]) return interaction.editReply("❌ 既に登録済みです");
    if (mcidData.uuids?.[data.uuid]) return interaction.editReply("❌ そのMCIDは既に使用されています");

    mcidData.uuids ??= {};
    mcidData.igns  ??= {};

    mcidData.users[user.id] = {
      uuid:             data.uuid,
      ign:              data.ign,
      oldNick:          member.nickname ?? null,
      registered:       true,
      lastCataLevel:    0,
      lastUpdatedAt:    0,
      lastKuudraT5:     null,
      lastKuudraUpdated: 0,
      kuudraProfile:    null,
    };

    mcidData.igns[data.ign]    = user.id;
    mcidData.uuids[data.uuid]  = user.id;

    const uuid      = data.uuid;
    const cleanUuid = uuid.replace(/-/g, "");

    // Hypixel API で Catacombs + Kuudra 取得
    const res = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`, {
      headers: { "API-Key": HYPIXEL_API_KEY },
    });
    const apiData = await res.json();

    if (apiData.success && apiData.profiles?.length) {
      const selectedProfile = apiData.profiles.find((p) => p.selected) || apiData.profiles[0];
      const memberData      = selectedProfile.members?.[cleanUuid];

      if (memberData) {
        const xp        = memberData.dungeons?.dungeon_types?.catacombs?.experience ?? 0;
        const cataLevel = xpToCataLevelDecimal(xp);
        mcidData.users[user.id].lastCataLevel = cataLevel;
        mcidData.users[user.id].lastUpdatedAt = Date.now();
        await updateCataRole(member, cataLevel);
      }

      const { t5, profile } = await fetchKuudraT5(HYPIXEL_API_KEY, uuid);
      mcidData.users[user.id].lastKuudraT5      = t5;
      mcidData.users[user.id].kuudraProfile      = profile;
      mcidData.users[user.id].lastKuudraUpdated  = Date.now();
    }

    saveMCID();

    // ニックネーム変更
    const shouldChangeNick = !isCataGuild(interaction.guild.id);
    let nickMessage;
    if (shouldChangeNick && data.ign) {
      try {
        await member.setNickname(data.ign, "MCID登録による自動変更");
        nickMessage = `ニックネームを **${data.ign}** に変更しました ✓`;
      } catch {
        nickMessage = "ニックネーム変更に失敗しました（権限不足？）";
      }
    } else {
      nickMessage = "JDCへようこそ！登録完了です";
    }

    // A鯖ならMemberロール付与 & Temporary削除
    if (isCataGuild(interaction.guild.id)) {
      try {
        if (!member.roles.cache.has(MEMBER_ROLE_ID))    await member.roles.add(MEMBER_ROLE_ID);
        if (member.roles.cache.has(TEMPORARY_ROLE_ID)) await member.roles.remove(TEMPORARY_ROLE_ID);
      } catch (e) {
        console.warn("[Register] Member/Temporary 処理失敗", e);
      }
    }

    if (isKuudraGuild(interaction.guild.id)) await updateKuudraRole(member, user.id);

    const embed = new EmbedBuilder()
      .setColor(0x2ecc71)
      .setTitle("MCID 登録完了")
      .setDescription(nickMessage)
      .addFields({ name: "IGN", value: data.ign, inline: true })
      .setFooter({ text: "by Mameneko", iconURL: FOOTER_ICON_URL })
      .setTimestamp();

    return interaction.editReply({ content: `✅ **${data.ign}** を登録しました！`, embeds: [embed] });
  } catch (error) {
    console.error("[/register] 全体エラー:", error);
    return interaction.editReply("❌ 登録中にエラーが発生しました。管理者に連絡してください。");
  }
}

// ===== /dungeon_info =====
export async function handleDungeonInfoCommand(interaction) {
  await interaction.deferReply();

  let inputIgn = interaction.options.getString("username");

  if (!inputIgn) {
    const userData = mcidData.users[interaction.user.id];
    if (!userData?.ign) {
      return interaction.editReply("❌ あなたはまだMCIDを登録していません。\n`/register <IGN>` で登録してください。");
    }
    inputIgn = userData.ign;
  }

  const uuidData = await fetchUUID(inputIgn);
  if (!uuidData) return interaction.editReply(`❌ ${inputIgn} は存在しないIGNです`);

  const { ign, uuid } = uuidData;
  const cleanUuid     = uuid.replace(/-/g, "");

  try {
    const res     = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuid}`, { headers: { "API-Key": HYPIXEL_API_KEY } });
    const apiData = await res.json();

    if (!apiData.success || !apiData.profiles?.length) {
      return interaction.editReply(`❌ ${ign} のSkyBlockプロファイルが見つかりません`);
    }

    // 最高 Cata XP のプロファイル選択
    let bestProfile = null;
    let maxCataXp   = -1;
    for (const profile of apiData.profiles) {
      const member = profile.members?.[cleanUuid];
      if (member?.dungeons?.dungeon_types?.catacombs) {
        const cataXp = member.dungeons.dungeon_types.catacombs.experience ?? 0;
        if (cataXp > maxCataXp) { maxCataXp = cataXp; bestProfile = profile; }
      }
    }

    const profile   = bestProfile || apiData.profiles.find((p) => p.selected) || apiData.profiles[0];
    const member    = profile.members?.[cleanUuid];

    if (!member?.dungeons?.dungeon_types?.catacombs) {
      return interaction.editReply(`❌ ${ign} のCatacombsデータがありません（未プレイ？）`);
    }

    const catacombs       = member.dungeons.dungeon_types.catacombs;
    const masterCatacombs = member.dungeons.dungeon_types.master_catacombs || {};
    const cataLevel       = xpToCataLevelDecimal(catacombs.experience ?? 0);

    // クラスレベル
    const classes    = member.dungeons?.player_classes || {};
    const classLevels = {
      Healer:  classes.healer?.experience  ? xpToCataLevelDecimal(classes.healer.experience)  : 0,
      Mage:    classes.mage?.experience    ? xpToCataLevelDecimal(classes.mage.experience)    : 0,
      Berserk: classes.berserk?.experience ? xpToCataLevelDecimal(classes.berserk.experience) : 0,
      Archer:  classes.archer?.experience  ? xpToCataLevelDecimal(classes.archer.experience)  : 0,
      Tank:    classes.tank?.experience    ? xpToCataLevelDecimal(classes.tank.experience)    : 0,
    };

    const classLvValues = Object.values(classLevels).filter((lv) => lv > 0);
    const classAvg = classLvValues.length > 0
      ? (classLvValues.reduce((a, b) => a + b, 0) / classLvValues.length).toFixed(1)
      : "N/A";

    // F7 / M7 S+ PB
    const f7Spb = catacombs?.fastest_time_s_plus?.["7"]        ? msToDungeonTime(catacombs.fastest_time_s_plus["7"])        : "N/A";
    const m7Spb = masterCatacombs?.fastest_time_s_plus?.["7"]  ? msToDungeonTime(masterCatacombs.fastest_time_s_plus["7"])  : "N/A";

    // Total Runs（F0 と total を除外）
    let totalRuns = 0;
    const normalCompletions = catacombs?.tier_completions || {};
    const masterCompletions = masterCatacombs?.tier_completions || {};
    for (const floor in normalCompletions) {
      if (floor !== "total" && floor !== "0") totalRuns += Math.round(normalCompletions[floor] || 0);
    }
    for (const floor in masterCompletions) {
      if (floor !== "total") totalRuns += Math.round(masterCompletions[floor] || 0);
    }

    const totalSecrets  = await getSecretsFound(HYPIXEL_API_KEY, uuid) ?? 0;
    const secretsPerRun = totalRuns > 0 ? (totalSecrets / totalRuns).toFixed(2) : "N/A";
    const secretsNote   = totalSecrets > 0 ? "" : " (API未記録 or 0)";

    const embed = new EmbedBuilder()
      .setColor(cataLevel >= 50 ? EMBED_COLOR_GOLD : EMBED_COLOR_PURPLE)
      .setTitle(`Dungeon Stats for ${ign}`)
      .setDescription(`**Catacombs Level: ${cataLevel.toFixed(1)}**${bestProfile ? " ✨ (Best Cata Profile)" : ""}`)
      .setThumbnail(`https://mc-heads.net/avatar/${uuid}/128.png`)
      .addFields(
        { name: "**Healer**",       value: `Lv ${classLevels.Healer.toFixed(1)}`,  inline: true },
        { name: "**Mage**",         value: `Lv ${classLevels.Mage.toFixed(1)}`,    inline: true },
        { name: "**Berserk**",      value: `Lv ${classLevels.Berserk.toFixed(1)}`, inline: true },
        { name: "**Archer**",       value: `Lv ${classLevels.Archer.toFixed(1)}`,  inline: true },
        { name: "**Tank**",         value: `Lv ${classLevels.Tank.toFixed(1)}`,    inline: true },
        { name: "**Class Avg**",    value: classAvg,                               inline: true },
        { name: "**Total Runs**",   value: totalRuns.toLocaleString(),             inline: true },
        { name: "**Secrets Found**",value: totalSecrets.toLocaleString() + secretsNote, inline: true },
        { name: "**Per Run**",      value: secretsPerRun,                          inline: true },
        { name: "**F7 S+ PB**",     value: f7Spb,                                 inline: true },
        { name: "**M7 S+ PB**",     value: m7Spb,                                 inline: true }
      )
      .setFooter({ text: "by Mameneko", iconURL: FOOTER_ICON_URL })
      .setTimestamp();

    if (cataLevel >= 50) {
      embed.setDescription(`**Catacombs Level: ${cataLevel.toFixed(1)}**  **Cata50+**${bestProfile ? " ✨" : ""}`);
    }

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[dungeon_info error]", inputIgn, err);
    return interaction.editReply(`❌ ${inputIgn} のデータ取得に失敗しました`);
  }
}

// ===== /kuudra_t5 =====
export async function handleKuudraT5Command(interaction) {
  await interaction.deferReply();
  const inputIgn = interaction.options.getString("ign")?.trim();

  if (!inputIgn) return interaction.editReply({ content: "IGNを入力してください。", ephemeral: true });

  try {
    const mojangRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(inputIgn)}`);
    if (!mojangRes.ok) {
      if (mojangRes.status === 204) return interaction.editReply(`「${inputIgn}」というMinecraftプレイヤーは存在しません。`);
      throw new Error(`Mojang API error: ${mojangRes.status}`);
    }

    const { id: uuid, name: actualIgn } = await mojangRes.json();

    const registeredUser = Object.values(mcidData.users || {}).find(
      (u) => u.uuid?.replace(/-/g, "") === uuid
    );
    let discordMention = "未登録";
    if (registeredUser) {
      const discordId = Object.keys(mcidData.users).find((id) => mcidData.users[id] === registeredUser);
      if (discordId) discordMention = `<@${discordId}>`;
    }

    const { t5, profile } = await fetchKuudraT5(HYPIXEL_API_KEY, uuid);
    if (t5 === null || t5 === undefined) {
      return interaction.editReply(`${actualIgn} のKuudraデータが取得できませんでした（Hypixel APIエラーまたは未プレイの可能性）`);
    }

    const embed = new EmbedBuilder()
      .setColor(0x9c27b0)
      .setTitle(`Kuudra Infernal (T5) Stats - ${actualIgn}`)
      .setDescription(`**${t5.toLocaleString()} runs**`)
      .setThumbnail(`https://mc-heads.net/avatar/${uuid}/128.png`)
      .addFields(
        { name: "Discord", value: discordMention,        inline: true },
        { name: "IGN",     value: `\`${actualIgn}\``,    inline: true }
      );

    if (profile) embed.addFields({ name: "Profile", value: profile, inline: true });
    if (t5 >= 10000) {
      embed.setColor(EMBED_COLOR_GOLD);
      embed.setDescription(`**${t5.toLocaleString()} runs** 👑 **Over 10k+**`);
    }
    if (t5 === 0) {
      embed.setDescription("まだ **Kuudra Infernal (T5)** をクリアしていません");
      embed.setColor(0x5865f2);
    }

    embed.setFooter({ text: "by Mameneko", iconURL: FOOTER_ICON_URL }).setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  } catch (error) {
    console.error("[/kuudra_t5] エラー:", inputIgn, error);
    return interaction.editReply({ content: "データの取得中にエラーが発生しました。もう一度お試しください。", ephemeral: true });
  }
}

// ===== /force_cata_update =====
export async function handleForceCataUpdate(interaction) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Admin専用コマンドです", ephemeral: true });
  }

  await interaction.reply("🔄 Cata強制更新を開始します…");

  const users = Object.entries(mcidData.users ?? {});
  let success = 0, noUuid = 0, noSkyblock = 0, noMember = 0;

  for (const [discordId, userData] of users) {
    try {
      if (!userData.uuid) { noUuid++; continue; }

      const cataLevel = await getCatacombsLevel(HYPIXEL_API_KEY, userData.uuid);
      if (typeof cataLevel !== "number") { noSkyblock++; continue; }

      const member = await interaction.guild.members.fetch(discordId).catch(() => null);
      if (!member) { noMember++; continue; }

      await updateCataRole(member, cataLevel);
      userData.lastCataLevel = cataLevel;
      userData.lastUpdatedAt = Date.now();
      success++;

      await sleep(1200);
    } catch (err) {
      console.error("[force_cata_update error]", discordId, err);
    }
  }

  saveMCID();

  return interaction.editReply(
    `✅ Cata強制更新完了\n\n🟢 成功: ${success}人\n🟡 SkyBlock未確認: ${noSkyblock}人\n🔵 UUID未登録: ${noUuid}人\n🟠 サーバー未在籍: ${noMember}人`
  );
}

// ===== /force_kuudra_update =====
export async function handleForceKuudraUpdate(interaction) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Admin専用コマンドです", ephemeral: true });
  }

  await interaction.reply("🔄 Kuudra Infernal (T5) 強制更新を開始します…");

  const users    = Object.entries(mcidData.users ?? {});
  let success = 0, noUuid = 0, noMember = 0, apiErrors = 0;

  const guild = client.guilds.cache.get(process.env.KUUDRA_GUILD_ID);
  if (!guild) return interaction.editReply("❌ KUUDRA_GUILD_ID のサーバーが見つかりません");

  for (const [discordId, userData] of users) {
    try {
      if (!userData.uuid) { noUuid++; continue; }

      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) { noMember++; continue; }

      const { t5, profile } = await fetchKuudraT5(HYPIXEL_API_KEY, userData.uuid);
      console.log("[Kuudra Debug]", discordId, t5, profile);

      userData.lastKuudraT5      = t5;
      userData.kuudraProfile     = profile;
      userData.lastKuudraUpdated = Date.now();

      await updateKuudraRole(member, discordId);
      success++;

      await sleep(1400);
    } catch (err) {
      console.error("[force_kuudra_update error]", discordId, err);
      apiErrors++;
    }
  }

  saveMCID();

  const embed = new EmbedBuilder()
    .setTitle("Kuudra Infernal (T5) 強制更新完了")
    .setColor(EMBED_COLOR_PURPLE)
    .setDescription(`🟢 更新成功: ${success}人\n🔵 UUID未登録: ${noUuid}人\n🟠 サーバー未在籍: ${noMember}人\n🔴 APIエラー: ${apiErrors}件`)
    .setFooter({ text: "by Mameneko", iconURL: FOOTER_ICON_URL })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

// ===== /boost_status =====
export async function handleBoostStatusCommand(interaction) {
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({ content: "このコマンドはAdmin専用です。", ephemeral: true });
  }

  const boostData = loadBoostData() || {};
  const guild     = interaction.guild;
  const boosters  = [];

  for (const [userId, data] of Object.entries(boostData)) {
    if (!data?.prevHadBoost) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    boosters.push({ tag: member.user.tag, boosts: data.boosts ?? 1, since: data.premiumSince });
  }

  if (boosters.length === 0) {
    return interaction.reply({ content: "現在Boost中のメンバーはいません。", ephemeral: true });
  }

  const embed = {
    title: "🚀 現在のBooster一覧",
    color: 0xf47fff,
    timestamp: new Date(),
    description: boosters
      .map((b) => `**${b.tag}**\n・Boost数: **${b.boosts}**\n・開始: <t:${Math.floor(b.since / 1000)}:R>`)
      .join("\n\n"),
    footer: { text: `合計 ${boosters.length} 人` },
  };

  return interaction.reply({ embeds: [embed] });
}

// ===== /boost_edit =====
export async function handleBoostEditCommand(interaction) {
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({ content: "このコマンドはAdmin専用です。", ephemeral: true });
  }

  const target    = interaction.options.getUser("user");
  const boosts    = interaction.options.getInteger("boosts");
  const boostData = loadBoostData() || {};

  if (!boostData[target.id]?.prevHadBoost) {
    return interaction.reply({ content: "このユーザーはBoosterとして登録されていません。", ephemeral: true });
  }

  boostData[target.id].boosts = boosts;
  saveBoostData(boostData);

  return interaction.reply({ content: `✅ **${target.tag}** のBoost数を **${boosts}** に設定しました。`, ephemeral: true });
}

// ===== /fix_member_roles =====
export async function handleFixMemberRoles(interaction) {
  if (!interaction.member.permissions.has("Administrator")) {
    return interaction.reply({ content: "Admin専用です", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });
  const guild = interaction.guild;

  if (!isCataGuild(guild.id)) {
    return interaction.editReply("このコマンドはA鯖（CATA_GUILD_ID）でのみ実行可能です");
  }

  let processed = 0, added = 0, removedTemp = 0, skipped = 0, errors = 0;

  try {
    const members = await guild.members.fetch({ time: 30000 });

    for (const member of members.values()) {
      if (member.user.bot) continue;

      const userData = mcidData.users?.[member.id];
      if (!userData) { skipped++; continue; }

      try {
        let changed = false;
        if (!member.roles.cache.has(MEMBER_ROLE_ID))    { await member.roles.add(MEMBER_ROLE_ID);    added++;       changed = true; }
        if (member.roles.cache.has(TEMPORARY_ROLE_ID))  { await member.roles.remove(TEMPORARY_ROLE_ID); removedTemp++; changed = true; }
        if (changed) processed++;
      } catch (err) {
        console.error(`[Fix Member] 失敗 ${member.user.tag}`, err);
        errors++;
      }
    }

    const embed = new EmbedBuilder()
      .setColor(0x57f287)
      .setTitle("Memberロール一括修正完了")
      .setDescription(
        `処理対象メンバー: ${members.size}人\n\n` +
        `・登録済みユーザー: ${processed}人\n` +
        `　→ Member付与: ${added}人\n` +
        `　→ Temporary削除: ${removedTemp}人\n\n` +
        `・スキップ（未登録）: ${skipped}人\n` +
        `・エラー: ${errors}件`
      )
      .setFooter({ text: "by Mameneko", iconURL: FOOTER_ICON_URL })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[Fix Member Roles] 全般エラー", err);
    return interaction.editReply("処理中にエラーが発生しました");
  }
}

// ===== /cata_50rank =====
export async function handleCata50Rank(interaction) {
  await interaction.deferReply();

  const allUsers = Object.entries(mcidData.users)
    .map(([id, u]) => ({
      discordId: id,
      ign:   u.ign ?? "不明",
      level: typeof u.lastCataLevel === "number" ? u.lastCataLevel : 0,
    }))
    .filter((u) => u.level > 0)
    .sort((a, b) => b.level - a.level);

  const ranking50    = allUsers.filter((u) => u.level >= 50).slice(0, 15);
  const rankingBelow = allUsers.filter((u) => 1 <= u.level && u.level < 50).slice(0, 15);

  const embed50 = new EmbedBuilder()
    .setTitle("Catacombs Lv50+ Ranking")
    .setColor(EMBED_COLOR_GOLD)
    .setDescription(ranking50.map((u, i) => `**${i + 1}.** <@${u.discordId}> — Lv ${u.level.toFixed(1)}`).join("\n") || "なし");

  const embedBelow = new EmbedBuilder()
    .setTitle("Catacombs Lv1〜49 Ranking")
    .setColor(EMBED_COLOR_PURPLE)
    .setDescription(rankingBelow.map((u, i) => `**${i + 1}.** <@${u.discordId}> — Lv ${u.level.toFixed(1)}`).join("\n") || "なし");

  return interaction.editReply({ embeds: [embed50, embedBelow] });
}

// ===== /list_registered =====
export async function handleListRegistered(interaction) {
  const { guild } = interaction;
  const isAdmin   = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);

  if (!isAdmin) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

  try {
    if (!interaction.deferred) await interaction.deferReply({ ephemeral: true });

    const registered = Object.entries(mcidData.users);
    if (registered.length === 0) return interaction.editReply("📭 登録済みユーザーはいません");

    const list = [];
    for (const [discordId, data] of registered) {
      const member = await guild.members.fetch(discordId).catch(() => null);
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
      else         await interaction.followUp({ embeds: [embed], ephemeral: true });
    }
  } catch (err) {
    console.error("list_registered error", err);
    if (interaction.deferred) return interaction.editReply("❌ 登録済みユーザー取得中にエラーが発生しました");
  }
}

// ===== /list_unregistered =====
export async function handleListUnregistered(interaction) {
  const { guild } = interaction;
  const isAdmin   = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);

  if (!isAdmin) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

  try {
    if (!interaction.deferred) await interaction.deferReply({ ephemeral: true });

    const members = await guild.members.fetch().catch(() => null);
    if (!members) return interaction.editReply("❌ メンバー取得に失敗しました（Intent未許可の可能性）");

    const list = [];
    for (const member of members.values()) {
      if (member.user.bot) continue;
      if (mcidData.users[member.id]) continue;
      const exists = await guild.members.fetch(member.id).catch(() => null);
      if (!exists) continue;
      list.push(`• <@${member.id}> (ID: \`${member.id}\`)`);
    }

    if (list.length === 0) return interaction.editReply("✅ 全員MCID登録済みです");

    const chunks = splitIntoChunks(list);
    for (let i = 0; i < chunks.length; i++) {
      const embed = new EmbedBuilder()
        .setTitle(chunks.length > 1 ? `📕 MCID未登録ユーザー（${i + 1}/${chunks.length}）` : "📕 MCID未登録ユーザー（在籍確認済み）")
        .setColor(0xff6666)
        .setDescription(chunks[i].join("\n"));
      if (i === 0) await interaction.editReply({ embeds: [embed] });
      else         await interaction.followUp({ embeds: [embed], ephemeral: true });
    }
  } catch (err) {
    console.error("list_unregistered error", err);
    if (interaction.deferred) return interaction.editReply("❌ 未登録ユーザー取得中にエラーが発生しました");
  }
}

// ===== /list_registered_csv =====
export async function handleListRegisteredCsv(interaction) {
  const isAdmin = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isAdmin) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

  try {
    await interaction.deferReply({ ephemeral: true });
    const users = Object.entries(mcidData.users);
    if (users.length === 0) return interaction.editReply("📭 登録済みユーザーがいません");

    const rows = [["DiscordID", "IGN", "UUID"]];
    for (const [discordId, data] of users) {
      rows.push([discordId, data.ign ?? "", data.uuid ?? ""]);
    }

    const csv    = "\uFEFF" + rows.map((r) => r.join(",")).join("\n");
    const buffer = Buffer.from(csv, "utf8");

    return interaction.editReply({ content: "📄 MCID登録済みユーザーCSV", files: [{ attachment: buffer, name: "registered_mcid.csv" }] });
  } catch (err) {
    console.error("CSV出力失敗", err);
    if (interaction.deferred) return interaction.editReply("❌ CSV出力中にエラーが発生しました");
  }
}

// ===== /list_unregistered_csv =====
export async function handleListUnregisteredCsv(interaction) {
  const { guild } = interaction;
  const isAdmin   = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isAdmin) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

  try {
    await interaction.deferReply({ ephemeral: true });
    const members = await guild.members.fetch().catch(() => null);
    if (!members) return interaction.editReply("❌ メンバー取得に失敗しました（Intent未許可の可能性）");

    const rows = [["DiscordID", "Username"]];
    for (const member of members.values()) {
      if (member.user.bot) continue;
      if (mcidData.users[member.id]) continue;
      rows.push([member.id, member.user.tag]);
    }

    if (rows.length === 1) return interaction.editReply("✅ 全員MCID登録済みです");

    const csv    = "\uFEFF" + rows.map((r) => r.join(",")).join("\n");
    const buffer = Buffer.from(csv, "utf8");

    return interaction.editReply({ content: "📄 MCID未登録ユーザーCSV", files: [{ attachment: buffer, name: "unregistered_mcid.csv" }] });
  } catch (err) {
    console.error("未登録CSV出力失敗", err);
    if (interaction.deferred) return interaction.editReply("❌ CSV出力中にエラーが発生しました");
  }
}

// ===== /unregister_user (Admin) =====
export async function handleUnregisterUser(interaction) {
  const { guild } = interaction;
  const isAdmin   = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isAdmin) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

  const target       = interaction.options.getUser("user");
  const targetMember = await guild.members.fetch(target.id).catch(() => null);

  if (!mcidData.users[target.id]) {
    return interaction.reply({ content: "❌ このユーザーは登録されていません", ephemeral: true });
  }

  const { ign, oldNick } = mcidData.users[target.id];
  delete mcidData.igns[ign];
  delete mcidData.users[target.id];
  saveMCID();

  if (targetMember && oldNick !== undefined) {
    await targetMember.setNickname(oldNick).catch(() => {});
  }

  return interaction.reply({ content: `✅ <@${target.id}> のIGN登録を解除しました`, ephemeral: true });
}

// ===== /register_user (Admin) =====
export async function handleRegisterUser(interaction) {
  const { guild } = interaction;
  const isAdmin   = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isAdmin) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  const target       = interaction.options.getUser("user");
  const ign          = interaction.options.getString("ign");
  const targetMember = await guild.members.fetch(target.id).catch(() => null);

  const valid = await isValidMCID(ign);
  if (!valid)                        return interaction.editReply("❌ そのMCIDは存在しません");
  if (mcidData.users[target.id])     return interaction.editReply("❌ 既に登録済みです");
  if (mcidData.igns[ign])            return interaction.editReply("❌ そのIGNは使用されています");

  const uuidData = await fetchUUID(ign);
  if (!uuidData) return interaction.editReply("❌ UUID取得に失敗しました");

  mcidData.users[target.id] = {
    uuid:              uuidData.uuid,
    ign:               uuidData.ign,
    oldNick:           targetMember?.nickname ?? null,
    registered:        true,
    lastKuudraT5:      null,
    lastKuudraUpdated: 0,
  };
  mcidData.igns[uuidData.ign]    = target.id;
  mcidData.uuids             ??= {};
  mcidData.uuids[uuidData.uuid]  = target.id;

  // Hypixel API で Kuudra 取得
  try {
    const cleanUuid = uuidData.uuid.replace(/-/g, "");
    const res       = await fetch(`https://api.hypixel.net/v2/skyblock/profiles?uuid=${uuidData.uuid}`, { headers: { "API-Key": HYPIXEL_API_KEY } });
    const apiData   = await res.json();

    if (apiData.success && apiData.profiles?.length) {
      let t5Comps = 0, bestProfileName = "不明";
      for (const prof of apiData.profiles) {
        const m       = prof.members?.[cleanUuid];
        const kuudra  = m?.nether_island_player_data?.kuudra_completed_tiers;
        const current = kuudra?.infernal ?? 0;
        if (current > t5Comps) { t5Comps = current; bestProfileName = prof.cute_name || prof.name || "不明"; }
      }
      if (t5Comps > 0) {
        mcidData.users[target.id].lastKuudraT5     = t5Comps;
        mcidData.users[target.id].lastKuudraUpdated = Date.now();
        mcidData.users[target.id].kuudraProfile     = bestProfileName;
        if (process.env.KUUDRA_GUILD_ID && guild.id === process.env.KUUDRA_GUILD_ID) {
          await updateKuudraRole(targetMember, target.id);
        }
      }
    }
  } catch (err) {
    console.error("[/register_user APIエラー]", err);
  }

  saveMCID();

  // ニックネーム変更
  let nickChangedMsg = "";
  if (targetMember) {
    const shouldChangeNick = targetMember.guild.id !== process.env.CATA_GUILD_ID;
    if (shouldChangeNick) {
      try {
        await targetMember.setNickname(uuidData.ign, "AdminによるMCID登録");
        nickChangedMsg = `ニックネームを **${uuidData.ign}** に変更しました`;
      } catch {
        nickChangedMsg = "ニックネーム変更に失敗しました（権限不足？）";
      }
    } else {
      nickChangedMsg = "CATAサーバーのためニックネームは変更していません";
    }
  }

  // A鯖でのMemberロール付与
  if (guild.id === process.env.CATA_GUILD_ID && targetMember && mcidData.users[target.id]?.registered) {
    try {
      await targetMember.roles.add(process.env.MEMBER_ROLE_ID);
      if (targetMember.roles.cache.has(process.env.TEMPORARY_ROLE_ID)) {
        await targetMember.roles.remove(process.env.TEMPORARY_ROLE_ID);
      }
    } catch (e) {
      console.warn("[Register_user] Memberロール付与失敗", e);
    }
  }

  let reply = `✅ <@${target.id}> を IGN「${uuidData.ign}」で登録しました`;
  if (mcidData.users[target.id].lastKuudraT5 > 0) {
    reply += `\nKuudra Infernal (T5): **${mcidData.users[target.id].lastKuudraT5.toLocaleString()} 回**`;
  }
  if (nickChangedMsg) reply += `\n${nickChangedMsg}`;

  return interaction.editReply(reply);
}

// ===== /pf =====
export async function handlePfCommand(interaction) {
  const { guild, user } = interaction;
  const floor           = interaction.options.getString("floor");
  let max               = interaction.options.getInteger("member");
  const description     = interaction.options.getString("description") || "";

  // 最大4人制限
  if (max > 4) max = 4;
  if (max < 1) max = 1;

  const party = { messageId: null, author: user.id, floor, max, members: [], vcId: null, threadId: null, description, mentionMessageId: null };

  const msg = await interaction.reply({ embeds: [buildEmbed(party)], components: [buildButtons(party)], fetchReply: true });

  // ロールメンション
  const mentions = buildRoleMentions(guild, getMentionRoles(floor));
  if (mentions) {
    const mentionMsg = await msg.channel.send(`📢 ${mentions}\n**Dungeon募集が作成されました！**`);
    party.mentionMessageId = mentionMsg.id;
  }

  const thread  = await msg.startThread({ name: `Dungeon-${floor}`, autoArchiveDuration: 60 });
  party.messageId = msg.id;
  party.threadId  = thread.id;

  if (!parties.has(guild.id)) parties.set(guild.id, []);
  parties.get(guild.id).push(party);
}

// ===== /admin pf_stop =====
export async function handleAdminPfStop(interaction) {
  const { guild } = interaction;
  const isAdmin   = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);
  if (!isAdmin) return interaction.reply({ content: "❌ Admin限定です", ephemeral: true });

  await interaction.deferReply({ ephemeral: true });

  const list = parties.get(guild.id) || [];

  for (const party of list) {
    for (const ch of guild.channels.cache.values()) {
      if (!ch.isTextBased()) continue;
      const msg = await ch.messages.fetch(party.messageId).catch(() => null);
      if (msg) { await msg.delete().catch(() => {}); break; }
    }
    if (party.vcId)     guild.channels.cache.get(party.vcId)?.delete().catch(() => {});
    if (party.threadId) guild.channels.cache.get(party.threadId)?.delete().catch(() => {});
  }

  parties.set(guild.id, []);
  return interaction.editReply("✅ 全募集を終了しました");
}

// ===== ボタンインタラクション =====
export async function handleButtonInteraction(interaction) {
  const { guild, user } = interaction;
  const isAdmin = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);

  const party = (parties.get(guild.id) || []).find((p) => p.messageId === interaction.message.id);
  if (!party) return interaction.reply({ content: "❌ 募集が見つかりません", ephemeral: true });

  // 参加取り消し
  if (interaction.customId === "leave_party") {
    if (!party.members.includes(user.id)) {
      return interaction.reply({ content: "❌ 参加していません", ephemeral: true });
    }

    if (party.mentionMessageId) {
      for (const ch of guild.channels.cache.values()) {
        if (!ch.isTextBased()) continue;
        const m = await ch.messages.fetch(party.mentionMessageId).catch(() => null);
        if (m) { await m.delete().catch(() => {}); break; }
      }
    }

    party.members = party.members.filter((id) => id !== user.id);
    return interaction.update({ embeds: [buildEmbed(party)], components: [buildButtons(party)] });
  }

  // 参加
  if (interaction.customId === "join_party") {
    if (!mcidData.users[user.id]) return interaction.reply({ content: "❌ MCID未登録です", ephemeral: true });
    if (user.id === party.author) return interaction.reply({ content: "❌ 募集主は参加できません", ephemeral: true });
    if (party.members.includes(user.id)) return interaction.reply({ content: "❌ 既に参加しています", ephemeral: true });
    if (party.members.length >= party.max) return interaction.reply({ content: "❌ 満員です", ephemeral: true });

    party.members.push(user.id);
    return interaction.update({ embeds: [buildEmbed(party)], components: [buildButtons(party)] });
  }

  // VC作成
  if (interaction.customId === "create_vc") {
    if (user.id !== party.author && !isAdmin) {
      return interaction.reply({ content: "❌ 募集主またはAdminのみ操作可能", ephemeral: true });
    }

    const vc = await guild.channels.create({ name: `Dungeon-${party.floor}`, type: 2, parent: VC_CATEGORY_IDS[0] });
    party.vcId = vc.id;
    await interaction.update({ embeds: [buildEmbed(party)], components: [buildButtons(party)] });
    return interaction.followUp({ content: `🎧 VCを作成しました → <#${vc.id}>`, ephemeral: true });
  }

  // 募集終了
  if (interaction.customId === "end_party") {
    if (user.id !== party.author && !isAdmin) {
      return interaction.reply({ content: "❌ 募集主またはAdminのみ操作可能", ephemeral: true });
    }

    await interaction.message.delete().catch(() => {});
    if (party.vcId)     guild.channels.cache.get(party.vcId)?.delete().catch(() => {});
    if (party.threadId) guild.channels.cache.get(party.threadId)?.delete().catch(() => {});

    if (party.mentionMessageId) {
      for (const ch of guild.channels.cache.values()) {
        if (!ch.isTextBased()) continue;
        const m = await ch.messages.fetch(party.mentionMessageId).catch(() => null);
        if (m) { await m.delete().catch(() => {}); break; }
      }
    }

    parties.set(guild.id, (parties.get(guild.id) || []).filter((p) => p.messageId !== party.messageId));
  }
}
