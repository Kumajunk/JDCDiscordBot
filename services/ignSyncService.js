import { db } from '../core/database.js';

export function startIgnSyncTask(client) {
    setInterval(async () => {
        const users = Object.entries(db.mcidData.users || {});
        if (users.length === 0) return;

        for (const [discordId, userData] of users) {
            const uuid = userData.uuid;
            if (!uuid) continue;

            try {
                // Check Mojang Session Server for latest IGN
                const res = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`);
                if (!res.ok) continue;

                const profile = await res.json();
                const currentIgn = profile.name;

                if (currentIgn && currentIgn !== userData.ign) {
                    const oldIgn = userData.ign;
                    console.log(`IGN変更検知: ${oldIgn} → ${currentIgn} (${discordId})`);

                    if (oldIgn && db.mcidData.igns[oldIgn]) {
                        delete db.mcidData.igns[oldIgn];
                    }

                    userData.ign = currentIgn;
                    db.mcidData.igns[currentIgn] = discordId;
                    
                    if (db.statsData[uuid]) {
                        db.statsData[uuid].ign = currentIgn;
                    }

                    db.save();

                    // Update nicknames across guilds
                    for (const guild of client.guilds.cache.values()) {
                        const member = await guild.members.fetch(discordId).catch(() => null);
                        if (!member) continue;

                        if (guild.id === process.env.CATA_GUILD_ID) {
                            console.log(`[IGN Change] Skipped nickname update in CATA Server for ${currentIgn}`);
                            continue;
                        }

                        try {
                            await member.setNickname(currentIgn, "IGN変更自動反映");
                            console.log(`[IGN Change] Nickname updated: ${member.user.tag} → ${currentIgn} @ ${guild.name}`);
                        } catch (err) {
                            console.warn(`[IGN Change] Nickname update failed for ${member.user.tag} @ ${guild.name}`, err.message);
                        }
                    }

                    // Send Log
                    const logChannelId = process.env.ADMIN_LOG_CHANNEL_ID;
                    if (logChannelId) {
                        const msgContent = `📝 **IGN変更検知**\nユーザー: <@${discordId}>\nUUID: \`${uuid}\`\n旧IGN: **${oldIgn}** → 新IGN: **${currentIgn}**`;
                        for (const guild of client.guilds.cache.values()) {
                            const ch = guild.channels.cache.get(logChannelId);
                            if (ch && ch.isTextBased()) await ch.send(msgContent).catch(() => {});
                        }
                    }
                }
            } catch (err) {
                console.error(`IGN Sync Error (${discordId})`, err.message);
            }
        }
    }, 60 * 60 * 1000); // Check every 60 minutes
}
