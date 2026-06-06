const { SlashCommandBuilder } = require('discord.js');
const { checkDJ } = require('../utils/dj');
const { updatePanel } = require('../utils/panelUpdater');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Mélange la file d\'attente'),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) return interaction.reply({ content: '❌ File d\'attente vide!', ephemeral: true });
        const queue = global.queues.get(interaction.guild.id);
        if (!checkDJ(interaction, queue)) return interaction.reply({ content: '❌ Vous devez être DJ pour utiliser cette commande.', ephemeral: true });
        
        if (queue.tracks.length < 2) return interaction.reply({ content: '❌ Pas assez de musiques pour mélanger.', ephemeral: true });
        
        for (let i = queue.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
        }
        
        updatePanel(interaction.client, interaction.guild.id);
        return interaction.reply('🔀 File d\'attente mélangée !');
    }
};
