import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { config } from './config/config.js';
import { db } from './core/database.js';
import { onInteractionCreate } from './events/interactionCreate.js';
import { onGuildMemberRemove } from './events/guildMemberRemove.js';
import { deployCommands } from './events/commandDeployer.js';
import { startIgnSyncTask } from './services/ignSyncService.js';
import { runFullUserDataUpdate } from './services/updateService.js';
import { 
    sendF7SPRanking, sendMasterSPRanking, sendSecretsRanking,
    sendSecretsPerRunRanking, sendClassRanking, sendClassAverageRanking,
    sendKuudraT5Ranking, sendCataRanking, 
    sendMasterCompletionsRanking, sendF7CompletionsRanking 
} from './services/rankingService.js';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.GuildMember]
});

client.once('ready', async () => {
    console.log(`✅ Logged in as ${client.user.tag}!`);
    console.log(`[DB Loaded] users (mcid): ${Object.keys(db.mcidData.users).length}`);
    console.log(`[DB Loaded] users (stats): ${Object.keys(db.statsData).length}`);

    // Slash Commandsの登録・展開
    await deployCommands();

    // 自動定期バックグラウンドタスクの開始
    startIgnSyncTask(client);

    // バッチ更新 (12時間おき)
    const HALF_DAY = 12 * 60 * 60 * 1000;
    setInterval(() => runFullUserDataUpdate(client), HALF_DAY);

    // ======== RANKING TIMERS ========
    const { 
        M7SP_UPDATE_INTERVAL, F7SP_UPDATE_INTERVAL, 
        SECRETS_UPDATE_INTERVAL, SECRETS_PER_RUN_UPDATE_INTERVAL,
        CLASS_UPDATE_INTERVAL, CLASS_AVG_UPDATE_INTERVAL,
        KUUDRA_UPDATE_INTERVAL,
        F7_COMPLETIONS_UPDATE_INTERVAL, M7_COMPLETIONS_UPDATE_INTERVAL
    } = config;

    setInterval(() => sendCataRanking(client), HALF_DAY); // 12h
    
    // SP
    if (F7SP_UPDATE_INTERVAL) setInterval(() => sendF7SPRanking(client), F7SP_UPDATE_INTERVAL);
    if (M7SP_UPDATE_INTERVAL) {
        for (let i = 1; i <= 7; i++) {
            setInterval(() => sendMasterSPRanking(client, i), M7SP_UPDATE_INTERVAL);
        }
    }
    
    // Secrets
    if (SECRETS_UPDATE_INTERVAL) setInterval(() => sendSecretsRanking(client), SECRETS_UPDATE_INTERVAL);
    if (SECRETS_PER_RUN_UPDATE_INTERVAL) setInterval(() => sendSecretsPerRunRanking(client), SECRETS_PER_RUN_UPDATE_INTERVAL);
    
    // Classes
    if (CLASS_UPDATE_INTERVAL) {
        ['healer', 'mage', 'berserk', 'archer', 'tank'].forEach(cls => {
            setInterval(() => sendClassRanking(client, cls), CLASS_UPDATE_INTERVAL);
        });
    }
    if (CLASS_AVG_UPDATE_INTERVAL) setInterval(() => sendClassAverageRanking(client), CLASS_AVG_UPDATE_INTERVAL);

    // Kuudra
    if (KUUDRA_UPDATE_INTERVAL) setInterval(() => sendKuudraT5Ranking(client), KUUDRA_UPDATE_INTERVAL);
    
    // Completions
    if (F7_COMPLETIONS_UPDATE_INTERVAL) setInterval(() => sendF7CompletionsRanking(client), F7_COMPLETIONS_UPDATE_INTERVAL);
    if (M7_COMPLETIONS_UPDATE_INTERVAL) {
        for (let i = 1; i <= 7; i++) {
            setInterval(() => sendMasterCompletionsRanking(client, i), M7_COMPLETIONS_UPDATE_INTERVAL);
        }
    }
    
    console.log("⏱️ 定期ランキング・バッチ更新タスクをスケジュールしました");
});

client.on('interactionCreate', (interaction) => onInteractionCreate(interaction, client));
client.on('guildMemberRemove', onGuildMemberRemove);

process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
});
process.on("unhandledRejection", (reason, promise) => {
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
});

// Start Client
if (!config.TOKEN) {
    console.error("❌ TOKEN is not defined in environment variables!");
    process.exit(1);
}

client.login(config.TOKEN);
