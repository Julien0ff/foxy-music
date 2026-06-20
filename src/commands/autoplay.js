const { SlashCommandBuilder } = require('discord.js');
const { checkDJ } = require('../utils/dj');
const { updatePanel } = require('../utils/panelUpdater');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('autoplay')
        .setDescription('Active ou désactive la lecture automatique'),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) return interaction.reply({ content: '❌ File d\'attente vide!', ephemeral: true });
        const queue = global.queues.get(interaction.guild.id);
        if (!checkDJ(interaction, queue)) return interaction.reply({ content: '❌ Vous devez être DJ pour utiliser cette commande.', ephemeral: true });

        queue.autoplay = !queue.autoplay;
        
        // Also save to guild config so it persists
        const { updateGuildConfig } = require('../utils/db');
        updateGuildConfig(interaction.guild.id, { autoplay: queue.autoplay });
        
        updatePanel(interaction.client, interaction.guild.id);
        
        return interaction.reply(queue.autoplay ? '📻 Lecture automatique **Activée** !' : '📻 Lecture automatique **Désactivée** !');
    }
};
