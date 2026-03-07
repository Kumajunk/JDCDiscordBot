import { handleRegisterCommand, handleDungeonInfoCommand, handleKuudraT5Command } from '../commands/public/publicCommands.js';
import { handleForceCataUpdate, handleListRegistered, handleListUnregistered, handleUnregisterUser, handleForceRankingUpdate } from '../commands/admin/adminCommands.js';
import { handlePfCommand, handlePfButtonInteraction } from '../commands/public/partyFinder.js';

export async function onInteractionCreate(interaction, client) {
    if (interaction.isChatInputCommand()) {
        const cmd = interaction.commandName;
        try {
            if (cmd === 'register') await handleRegisterCommand(interaction);
            else if (cmd === 'dungeon_info') await handleDungeonInfoCommand(interaction);
            else if (cmd === 'kuudra_t5') await handleKuudraT5Command(interaction);
            else if (cmd === 'pf') await handlePfCommand(interaction);
            else if (cmd === 'force_cata_update') await handleForceCataUpdate(interaction, client);
            else if (cmd === 'list_registered') await handleListRegistered(interaction);
            else if (cmd === 'list_unregistered') await handleListUnregistered(interaction);
            else if (cmd === 'unregister_user') await handleUnregisterUser(interaction);
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
