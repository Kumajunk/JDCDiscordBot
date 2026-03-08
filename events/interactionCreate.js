import { handleRegisterCommand, handleDungeonInfoCommand, handleKuudraT5Command } from '../commands/public/publicCommands.js';
import { handleForceCataUpdate, handleListRegistered, handleListUnregistered, handleUnregisterUser, handleForceRankingUpdate, handleForceUnregisterMCID, handleFixDBIntegrity, handleRegisterUser } from '../commands/admin/adminCommands.js';
import { handlePfCommand, handlePfButtonInteraction } from '../commands/public/partyFinder.js';

export async function onInteractionCreate(interaction, client) {
    if (interaction.isChatInputCommand()) {
        const cmd = interaction.commandName;
        
        // Defer response as early as possible for commands that call external APIs
        const ephemeralCommands = ['register', 'unregister_user', 'register_user', 'list_registered', 'list_unregistered', 'fix_db_integrity', 'force_unregister_mcid'];
        const publicDeferredCommands = ['dungeon_info', 'kuudra_t5'];

        try {
            if (ephemeralCommands.includes(cmd)) {
                await interaction.deferReply({ ephemeral: true }).catch(() => {});
            } else if (publicDeferredCommands.includes(cmd)) {
                await interaction.deferReply().catch(() => {});
            }

            if (cmd === 'register') await handleRegisterCommand(interaction);
            else if (cmd === 'dungeon_info') await handleDungeonInfoCommand(interaction);
            else if (cmd === 'kuudra_t5') await handleKuudraT5Command(interaction);
            else if (cmd === 'pf') await handlePfCommand(interaction);
            else if (cmd === 'force_cata_update') await handleForceCataUpdate(interaction, client);
            else if (cmd === 'list_registered') await handleListRegistered(interaction);
            else if (cmd === 'list_unregistered') await handleListUnregistered(interaction);
            else if (cmd === 'unregister_user') await handleUnregisterUser(interaction);
            else if (cmd === 'register_user') await handleRegisterUser(interaction);
            else if (cmd === 'force_unregister_mcid') await handleForceUnregisterMCID(interaction);
            else if (cmd === 'fix_db_integrity') await handleFixDBIntegrity(interaction);
            else if (cmd === 'force_ranking_update') await handleForceRankingUpdate(interaction, client);
        } catch (error) {
            console.error(`[Error executing /${cmd}]`, error);
            const content = '❌ コマンドの実行中にエラーが発生しました。';
            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ content }).catch(() => {});
            } else {
                await interaction.reply({ content, ephemeral: true }).catch(() => {});
            }
        }
    } else if (interaction.isButton()) {
        try {
            await handlePfButtonInteraction(interaction);
        } catch (error) {
            console.error('[Button Error]', error);
        }
    }
}
