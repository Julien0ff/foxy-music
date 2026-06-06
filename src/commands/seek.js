const { SlashCommandBuilder } = require('discord.js');
const { checkDJ } = require('../utils/dj');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('seek')
        .setDescription('Avance à un moment précis (ex: 1:30)')
        .addStringOption(option => 
            option.setName('temps')
            .setDescription('Temps en minutes:secondes (ex: 1:30)')
            .setRequired(true)),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) return interaction.reply({ content: '❌ File d\'attente vide!', ephemeral: true });
        const queue = global.queues.get(interaction.guild.id);
        if (!checkDJ(interaction, queue)) return interaction.reply({ content: '❌ Vous devez être DJ pour utiliser cette commande.', ephemeral: true });
        if (!queue.player || !queue.currentTrack) return interaction.reply({ content: '❌ Aucune musique en cours.', ephemeral: true });

        const timeStr = interaction.options.getString('temps');
        const timeParts = timeStr.split(':');
        let ms = 0;
        if (timeParts.length === 2) {
            ms = (parseInt(timeParts[0]) * 60 + parseInt(timeParts[1])) * 1000;
        } else if (timeParts.length === 3) {
            ms = (parseInt(timeParts[0]) * 3600 + parseInt(timeParts[1]) * 60 + parseInt(timeParts[2])) * 1000;
        } else {
            ms = parseInt(timeStr) * 1000;
        }

        if (isNaN(ms) || ms < 0) return interaction.reply({ content: '❌ Format invalide. Utilisez mm:ss.', ephemeral: true });
        
        if (ms > queue.currentTrack.duration) ms = queue.currentTrack.duration;

        await queue.player.seekTo(ms);
        return interaction.reply(`⏩ Avancé à **${timeStr}**.`);
    }
};
