import { db } from '../core/database.js';

export async function onGuildMemberRemove(member) {
    const discordId = member.user.id;
    if (db.mcidData.users[discordId]) {
        const ign = db.mcidData.users[discordId].ign;
        if (ign && db.mcidData.igns[ign]) {
            delete db.mcidData.igns[ign];
        }
        delete db.mcidData.users[discordId];
        db.save();
        console.log(`[Member Left] 退出に伴い ${ign} (${discordId}) のMCID登録を解除しました`);
    }
}
