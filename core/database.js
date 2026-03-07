import fs from "fs";
import { config } from "../config/config.js";

class Database {
    constructor() {
        this.mcidData = { users: {}, igns: {}, uuids: {} };
        this.statsData = {};
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(config.MCID_FILE)) {
                this.mcidData = JSON.parse(fs.readFileSync(config.MCID_FILE, "utf8"));
                this.mcidData.users ??= {};
                this.mcidData.igns ??= {};
                this.mcidData.uuids ??= {};
            }
            if (fs.existsSync(config.STATS_FILE)) {
                this.statsData = JSON.parse(fs.readFileSync(config.STATS_FILE, "utf8"));
            }
        } catch (e) {
            console.error("[Database] Load error:", e);
        }
    }

    save() {
        try {
            const mcidTmp = config.MCID_FILE + ".tmp";
            fs.writeFileSync(mcidTmp, JSON.stringify(this.mcidData, null, 2));
            fs.renameSync(mcidTmp, config.MCID_FILE);
            
            const statsTmp = config.STATS_FILE + ".tmp";
            fs.writeFileSync(statsTmp, JSON.stringify(this.statsData, null, 2));
            fs.renameSync(statsTmp, config.STATS_FILE);
        } catch (e) {
            console.error("[Database] Save error:", e);
        }
    }

    getUser(discordId) {
        return this.mcidData.users[discordId];
    }
    
    getStats(uuid) {
        return this.statsData[uuid];
    }
}

export const db = new Database();
