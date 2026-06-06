const { SlashCommandBuilder } = require('discord.js');
const { checkDJ } = require('../utils/dj');
const { updatePanel } = require('../utils/panelUpdater');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Vide la file d\'attente sans arrêter la musique en cours'),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) return interaction.reply({ content: '❌ File d\'attente vide!', ephemeral: true });
        const queue = global.queues.get(interaction.guild.id);
        if (!checkDJ(interaction, queue)) return interaction.reply({ content: '❌ Vous devez être DJ pour utiliser cette commande.', ephemeral: true });

        queue.tracks = [];
        updatePanel(interaction.client, interaction.guild.id);
        return interaction.reply('🗑️ La file d\'attente a été vidée.');
    }
};
