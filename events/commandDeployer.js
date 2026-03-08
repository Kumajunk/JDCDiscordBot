import { REST, Routes, SlashCommandBuilder } from 'discord.js';
import { config } from '../config/config.js';

const commands = [
    new SlashCommandBuilder()
        .setName('register')
        .setDescription('あなたのMinecraft UUIDを登録します')
        .addStringOption(option => 
            option.setName('ign')
                .setDescription('あなたのMinecraft ID')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('dungeon_info')
        .setDescription('ユーザーのダンジョン情報を表示します')
        .addStringOption(option => 
            option.setName('username')
                .setDescription('検索するユーザーのMinecraft ID (未指定の場合は自身の情報)')
                .setRequired(false)
        ),
    new SlashCommandBuilder()
        .setName('kuudra_t5')
        .setDescription('ユーザーのKuudra T5クリア回数などを表示します')
        .addStringOption(option => 
            option.setName('ign')
                .setDescription('検索するプレイヤーのMinecraft ID')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('pf')
        .setDescription('Party Finderの募集パネルを作成します')
        .addStringOption(option => 
            option.setName('floor')
                .setDescription('募集するフロア (例: M7, F7)')
                .setRequired(true)
        )
        .addIntegerOption(option => 
            option.setName('member')
                .setDescription('募集人数 (1〜4)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(4)
        )
        .addStringOption(option =>
            option.setName('description')
                .setDescription('募集の説明や条件 (任意)')
                .setRequired(false)
        ),
    // Admin Commands
    new SlashCommandBuilder()
        .setName('force_cata_update')
        .setDescription('[Admin] 全登録ユーザーのデータを再取得して一括更新します(時間がかかります)'),
    new SlashCommandBuilder()
        .setName('list_registered')
        .setDescription('[Admin] MCIDを登録済みのDiscordメンバー一覧を表示します'),
    new SlashCommandBuilder()
        .setName('list_unregistered')
        .setDescription('[Admin] MCIDを登録していないDiscordメンバー一覧を表示します'),
    new SlashCommandBuilder()
        .setName('unregister_user')
        .setDescription('[Admin] 指定したユーザーのMCID登録情報を強制解除します')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('登録解除するユーザー')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('register_user')
        .setDescription('[Admin] 指定したユーザーのMCIDを強制的に登録します')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('登録するDiscordユーザー')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('ign')
                .setDescription('登録するMinecraft ID')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('force_unregister_mcid')
        .setDescription('[Admin] 指定したMCIDまたはIGNの登録を強制解除して解放します')
        .addStringOption(option => 
            option.setName('mcid_or_ign')
                .setDescription('解除したいMCID(UUID)またはIGN')
                .setRequired(true)
        ),
    new SlashCommandBuilder()
        .setName('fix_db_integrity')
        .setDescription('[Admin] データベース内のゴミデータ（持ち主のいないMCID情報など）をスキャンして削除します'),
    new SlashCommandBuilder()
        .setName('force_ranking_update')
        .setDescription('[Admin] キャッシュから指定したランキングを強制的に再生成・送出します')
        .addStringOption(option => 
            option.setName('type')
                .setDescription('送信するランキングの種類')
                .setRequired(true)
                .addChoices(
                    { name: 'Catacombs Lv', value: 'cata' },
                    { name: 'M7 S+ PB', value: 'm7sp' },
                    { name: 'F7 S+ PB', value: 'f7sp' },
                    { name: 'Secrets Found', value: 'secrets' },
                    { name: 'Secrets Per Run', value: 'secretspr' },
                    { name: 'Kuudra Infernal (T5)', value: 'kuudra' },
                    { name: 'M7 Completions', value: 'm7comps' },
                    { name: 'F7 Completions', value: 'f7comps' },
                    { name: 'All Master S+ PBs', value: 'all_msp' },
                    { name: 'All Master Comps', value: 'all_mcomps' },
                    { name: 'All Class Levels', value: 'all_classes' },
                    { name: 'Class Average', value: 'clsavg' },
                    { name: 'All Rankings', value: 'all' }
                )
        ),
    // Ranking Display Commands
    new SlashCommandBuilder()
        .setName('cata50_rank')
        .setDescription('Catacombs Lvのランキングを表示します'),
    new SlashCommandBuilder()
        .setName('cata_rank')
        .setDescription('Catacombs Lvのランキングを表示します'),
    new SlashCommandBuilder()
        .setName('m7sp_rank')
        .setDescription('M7 S+ PBランキングを表示します'),
    new SlashCommandBuilder()
        .setName('f7sp_rank')
        .setDescription('F7 S+ PBランキングを表示します'),
    new SlashCommandBuilder()
        .setName('secrets_rank')
        .setDescription('Secrets Foundランキングを表示します'),
    new SlashCommandBuilder()
        .setName('kuudra_rank')
        .setDescription('Kuudra T5クリア数ランキングを表示します'),
    new SlashCommandBuilder()
        .setName('f7comps_rank')
        .setDescription('F7クリア回数ランキングを表示します'),
    new SlashCommandBuilder()
        .setName('m7comps_rank')
        .setDescription('M7クリア回数ランキングを表示します')
];

export async function deployCommands() {
    if (!config.TOKEN || !config.CLIENT_ID || !config.GUILD_ID) {
        console.warn('⚠️ TOKEN, CLIENT_ID, or GUILD_ID is missing. Skipping command deployment.');
        return;
    }

    const rest = new REST({ version: '10' }).setToken(config.TOKEN);

    try {
        console.log(`⏳ Started refreshing ${commands.length} application (/) commands...`);
        
        // Use applicationGuildCommands for instant guild-specific deployment
        const data = await rest.put(
            Routes.applicationGuildCommands(config.CLIENT_ID, config.GUILD_ID),
            { body: commands.map(cmd => cmd.toJSON()) },
        );

        console.log(`✅ Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error('❌ Failed to deploy commands:', error);
    }
}
