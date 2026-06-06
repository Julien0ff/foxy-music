const { SlashCommandBuilder } = require('discord.js');
const { checkDJ } = require('../utils/dj');
const { updatePanel } = require('../utils/panelUpdater');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('remove')
        .setDescription('Supprime une musique de la file d\'attente')
        .addIntegerOption(option => 
            option.setName('position')
            .setDescription('Position de la musique dans la file')
            .setRequired(true)),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) return interaction.reply({ content: '❌ File d\'attente vide!', ephemeral: true });
        const queue = global.queues.get(interaction.guild.id);
        if (!checkDJ(interaction, queue)) return interaction.reply({ content: '❌ Vous devez être DJ pour utiliser cette commande.', ephemeral: true });

        const pos = interaction.options.getInteger('position');
        if (pos < 1 || pos > queue.tracks.length) return interaction.reply({ content: '❌ Position invalide.', ephemeral: true });

        const removed = queue.tracks.splice(pos - 1, 1)[0];
        updatePanel(interaction.client, interaction.guild.id);
        return interaction.reply(`🗑️ **${removed.title}** a été supprimé de la file.`);
    }
};
