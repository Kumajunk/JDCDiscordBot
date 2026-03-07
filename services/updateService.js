import { db } from '../core/database.js';
import { fetchAllSkyblockData } from '../core/hypixelApi.js';
import { extractAllStats } from './skyblockParser.js';
import { config } from '../config/config.js';
import { updateCataRole, updateKuudraRole } from './roleService.js';

export async function runFullUserDataUpdate(client) {
    const users = Object.entries(db.mcidData.users || {});
    if (users.length === 0) return;

    let success = 0, skipped = 0, errors = 0;
    console.log(`[FullUpdate] 開始 (${users.length}人)`);

    const cataGuild = config.CATA_GUILD_ID ? client.guilds.cache.get(config.CATA_GUILD_ID) : null;
    const kuudraGuild = config.KUUDRA_GUILD_ID ? client.guilds.cache.get(config.KUUDRA_GUILD_ID) : null;

    const BATCH_SIZE = 100;
    const BATCH_DELAY = 5 * 60 * 1000;

    for (let i = 0; i < users.length; i += BATCH_SIZE) {
        const batch = users.slice(i, i + BATCH_SIZE);
        const batchIdx = Math.floor(i / BATCH_SIZE) + 1;
        console.log(`[FullUpdate] バッチ ${batchIdx} 開始 (${batch.length}人)`);

        for (const [discordId, userData] of batch) {
            try {
                const uuid = userData.uuid;
                if (!uuid) { skipped++; continue; }

                const { profiles, cleanUuid } = await fetchAllSkyblockData(uuid);
                if (!profiles) { skipped++; continue; }

                const data = extractAllStats(profiles, cleanUuid);
                const now = Date.now();

                // Get or create stats entry
                db.statsData[uuid] ??= { discordId, ign: userData.ign };
                const stat = db.statsData[uuid];

                // CATA Level Update
                if (data.cataLevel !== null) {
                    stat.cataLevel = data.cataLevel;
                    stat.cataUpdated = now;

                    if (cataGuild) {
                        const member = await cataGuild.members.fetch(discordId).catch(() => null);
                        if (member) await updateCataRole(member, data.cataLevel);
                    }
                }
                
                // Class Levels Update
                if (Object.values(data.classLevels).some((lv) => lv > 0)) {
                    stat.classLevels = data.classLevels;
                    stat.classLevelsUpdated = now;
                }

                // Kuudra T5 Update
                if (data.kuudraT5.t5 !== null) {
                    stat.kuudraT5 = data.kuudraT5.t5;
                    stat.kuudraProfile = data.kuudraT5.profile;
                    stat.kuudraUpdated = now;

                    if (kuudraGuild) {
                        const member = await kuudraGuild.members.fetch(discordId).catch(() => null);
                        if (member) await updateKuudraRole(member, discordId);
                    }
                }

                // Other Stats Updates
                if (data.m7sp !== null) { stat.m7SP = data.m7sp; stat.m7SPUpdated = now; }
                if (data.f7sp !== null) { stat.f7SP = data.f7sp; stat.f7SPUpdated = now; }
                if (data.secrets !== null) { stat.secrets = data.secrets; stat.secretsUpdated = now; }
                
                // Master / Floor Completions
                if (data.m1comps > 0) { stat.m1Comps = data.m1comps; stat.m1CompsUpdated = now; }
                if (data.m2comps > 0) { stat.m2Comps = data.m2comps; stat.m2CompsUpdated = now; }
                if (data.m3comps > 0) { stat.m3Comps = data.m3comps; stat.m3CompsUpdated = now; }
                if (data.m4comps > 0) { stat.m4Comps = data.m4comps; stat.m4CompsUpdated = now; }
                if (data.m5comps > 0) { stat.m5Comps = data.m5comps; stat.m5CompsUpdated = now; }
                if (data.m6comps > 0) { stat.m6Comps = data.m6comps; stat.m6CompsUpdated = now; }
                if (data.m7comps > 0) { stat.m7Comps = data.m7comps; stat.m7CompsUpdated = now; }
                if (data.f7comps > 0) { stat.f7Comps = data.f7comps; stat.f7CompsUpdated = now; }

                success++;
            } catch (err) {
                console.error(`[FullUpdate] ${discordId} (IGN: ${userData.ign}) 更新失敗`, err);
                errors++;
            }
        }

        if (i + BATCH_SIZE < users.length) {
            console.log("[FullUpdate] バッチ間待機...");
            await config.sleep(BATCH_DELAY);
        }
    }

    db.save();
    console.log(`[FullUpdate] 完了 | 成功: ${success}人 | スキップ: ${skipped}人 | エラー: ${errors}件`);
}
