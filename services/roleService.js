import { config } from '../config/config.js';
import { db } from '../core/database.js';

const roleRanges = [
    { min: 0,  max: 24, role: "Cata0~23" },
    { min: 24, max: 35, role: "Cata24~35" },
    { min: 35, max: 44, role: "Cata36~44" },
    { min: 44, max: 50, role: "Cata45~49" },
    { min: 50, max: Infinity, role: "Cata50+" },
];

function roleForLevel(level) {
    return roleRanges.find((r) => level >= r.min && level <= r.max)?.role;
}

/**
 * Updates a member's Catacombs role based on their level.
 */
export async function updateCataRole(member, cataLevel) {
    const targetGuildId = config.CATA_GUILD_ID;
    if (!targetGuildId || member.guild.id !== targetGuildId) return;

    if (typeof cataLevel !== "number") return;

    const targetRoleName = roleForLevel(cataLevel);
    if (!targetRoleName) return;

    const guild = member.guild;
    const me = guild.members.me;

    if (!me.permissions.has("ManageRoles")) return;

    const newRole = guild.roles.cache.find((r) => r.name === targetRoleName);
    if (!newRole || newRole.position >= me.roles.highest.position) return;

    const cataRoleNames = roleRanges.map((r) => r.role);
    for (const roleName of cataRoleNames) {
        const role = guild.roles.cache.find((r) => r.name === roleName);
        if (role && member.roles.cache.has(role.id) && role.position < me.roles.highest.position) {
            await member.roles.remove(role).catch(() => {});
        }
    }

    if (!member.roles.cache.has(newRole.id)) {
        await member.roles.add(newRole);
        console.log(`✅ Role added: ${member.user.tag} → ${newRole.name}`);
    }
}

/**
 * Updates a member's Kuudra tier role based on their completions.
 */
export async function updateKuudraRole(member, discordId) {
    const targetGuildId = config.KUUDRA_GUILD_ID;
    if (!targetGuildId || member.guild.id !== targetGuildId) return;

    const userMap = db.mcidData.users[discordId];
    if (!userMap) return;
    
    const uuid = userMap.uuid;
    const stat = db.statsData[uuid];
    if (!stat || stat.kuudraT5 === undefined || stat.kuudraT5 === null) return;
    
    const t5 = Number(stat.kuudraT5);
    if (Number.isNaN(t5)) return;
    
    const kuudraRoles = [
        { min: 20000, name: "20k+" },
        { min: 15000, name: "15k+" },
        { min: 10000, name: "10k+" },
        { min: 5000,  name: "5k+" },
        { min: 2000,  name: "2k+" },
        { min: 1000,  name: "1k+" },
    ];

    const me = member.guild.members.me;

    for (const r of kuudraRoles) {
        const role = member.guild.roles.cache.find((x) => x.name === r.name);
        if (role && member.roles.cache.has(role.id)) {
            await member.roles.remove(role).catch(() => {});
        }
    }

    for (const r of kuudraRoles) {
        if (t5 >= r.min) {
            const role = member.guild.roles.cache.find((x) => x.name === r.name);
            if (role) {
                if (role.position >= me.roles.highest.position) return;
                await member.roles.add(role).catch(() => {});
                console.log(`[Kuudra Role] Added ${r.name} to ${member.user.tag}`);
            }
            break;
        }
    }
}
