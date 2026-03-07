import dotenv from "dotenv";
dotenv.config();
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const sleep = ms => new Promise(r => setTimeout(r, ms));

export default {
    sleep,
    // ===== 設定 =====
    TOKEN: process.env.TOKEN,
    HYPIXEL_API_KEY: process.env.HYPIXEL_API_KEY,
    MCID_FILE: path.join(__dirname, "mcid.json"),
    CATA50_CHANNEL_ID: process.env.CATA50_RANK_CHANNEL_ID,
    AUTO_CLEAR_CHANNEL_ID: process.env.AUTO_CLEAR_CHANNEL_ID,
    VC_CATEGORY_IDS: (process.env.DUNGEON_VC_CATEGORY_IDS || "").split(",").filter(Boolean),

    // ===== Kuudra T5 ロール更新 =====
    KUUDRA_UPDATE_INTERVAL: 12 * 60 * 60 * 1000,
    KUUDRA_BATCH_SIZE: 100,
    KUUDRA_BATCH_DELAY: 5 * 60 * 1000,

    CATA_GUILD_ID: process.env.CATA_GUILD_ID,
    KUUDRA_GUILD_ID: process.env.KUUDRA_GUILD_ID,
    MEMBER_ROLE_ID: process.env.MEMBER_ROLE_ID,
    TEMPORARY_ROLE_ID: process.env.TEMPORARY_ROLE_ID,

    // ===== Kuudra T5 Ranking =====
    KUUDRA_T5_CHANNEL_ID: process.env.KUUDRA_T5_CHANNEL_ID,
    KUUDRA_T5_UPDATE_INTERVAL: 12 * 60 * 60 * 1000,
    KUUDRA_T5_BATCH_SIZE: 20,
    KUUDRA_T5_BATCH_DELAY: 5000,
    KUUDRA_T5_CACHE_VALID_MS: 12 * 60 * 60 * 1000,

    // ===== F7 / M7 Completions =====
    F7_COMPLETIONS_CHANNEL_ID: process.env.F7_COMPLETIONS_CHANNEL_ID,
    M7_COMPLETIONS_CHANNEL_ID: process.env.M7_COMPLETIONS_CHANNEL_ID,

    F7_COMPLETIONS_UPDATE_INTERVAL: 14 * 60 * 60 * 1000,
    M7_COMPLETIONS_UPDATE_INTERVAL: 16 * 60 * 60 * 1000,

    COMPLETIONS_BATCH_SIZE: 20,
    COMPLETIONS_BATCH_DELAY: 5000,
    COMPLETIONS_CACHE_VALID_MS: 12 * 60 * 60 * 1000,

    // ===== M7 S+ PB =====
    M7SP_CHANNEL_ID: process.env.M7SP_CHANNEL_ID,
    M7SP_UPDATE_INTERVAL: 12 * 60 * 60 * 1000,

    BATCH_SIZE: 20,
    BATCH_DELAY: 5000,
    CACHE_VALID_MS: 12 * 60 * 60 * 1000,

    // ===== F7 S+ PB =====
    F7SP_CHANNEL_ID: process.env.F7SP_CHANNEL_ID,
    F7SP_UPDATE_INTERVAL: 12 * 60 * 60 * 1000,

    F7_BATCH_SIZE: 20,
    F7_BATCH_DELAY: 5000,
    F7_CACHE_VALID_MS: 12 * 60 * 60 * 1000,

    // ===== Secrets Ranking =====
    SECRETS_RANK_CHANNEL_ID: process.env.SECRETS_RANK_CHANNEL_ID,
    SECRETS_UPDATE_INTERVAL: 8 * 60 * 60 * 1000,

    SECRETS_BATCH_SIZE: 20,
    SECRETS_BATCH_DELAY: 5000,
    SECRETS_CACHE_VALID_MS: 12 * 60 * 60 * 1000,

    // ===== Secrets Per Run =====
    SECRETS_PER_RUN_CHANNEL_ID: process.env.SECRETS_PER_RUN_CHANNEL_ID,
    SECRETS_PER_RUN_UPDATE_INTERVAL: 10 * 60 * 60 * 1000,

    SECRETS_PER_RUN_BATCH_SIZE: 20,
    SECRETS_PER_RUN_BATCH_DELAY: 5000,
    SECRETS_PER_RUN_CACHE_VALID_MS: 12 * 60 * 60 * 1000,

    // ===== Class Ranking =====
    CLASS_RANK_CHANNEL_ID: process.env.CLASS_RANK_CHANNEL_ID,
    CLASS_UPDATE_INTERVAL: 18 * 60 * 60 * 1000,

    CLASS_AVG_CHANNEL_ID: process.env.CLASS_AVG_CHANNEL_ID,
    CLASS_AVG_UPDATE_INTERVAL: 18 * 60 * 60 * 1000,

    CLASS_BATCH_SIZE: 20,
    CLASS_BATCH_DELAY: 5000,
    CLASS_CACHE_VALID_MS: 12 * 60 * 60 * 1000
};