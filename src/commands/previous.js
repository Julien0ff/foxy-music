const { SlashCommandBuilder } = require('discord.js');
const { checkDJ } = require('../utils/dj');
const { updatePanel } = require('../utils/panelUpdater');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('previous')
        .setDescription('Rejoue la musique précédente'),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) return interaction.reply({ content: '❌ File d\'attente vide!', ephemeral: true });
        const queue = global.queues.get(interaction.guild.id);
        if (!checkDJ(interaction, queue)) return interaction.reply({ content: '❌ Vous devez être DJ pour utiliser cette commande.', ephemeral: true });

        if (!queue.history || queue.history.length === 0) {
            return interaction.reply({ content: '❌ Il n\'y a pas de musique précédente dans l\'historique.', ephemeral: true });
        }

        // Pop the last played track
        const previousTrack = queue.history.pop();
        
        // If something is currently playing, push it to the FRONT of the queue so it plays after
        if (queue.currentTrack) {
            queue.tracks.unshift(queue.currentTrack);
        }
        
        // Put the previous track at the very front
        queue.tracks.unshift(previousTrack);
        
        // Stop the player, which will trigger 'end' and playNext() automatically
        if (queue.player) {
            await queue.player.stopTrack();
        }

        return interaction.reply(`⏪ Retour à la musique précédente : **${previousTrack.title}**`);
    }
};
