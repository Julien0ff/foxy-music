const { SlashCommandBuilder } = require('discord.js');
const { checkDJ } = require('../utils/dj');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip the current track'),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) {
            return interaction.reply({ content: 'There is no music playing right now!', ephemeral: true });
        }

        const queue = global.queues.get(interaction.guild.id);
        if (!checkDJ(interaction, queue)) return interaction.reply({ content: '❌ Vous devez être DJ pour utiliser cette commande.', ephemeral: true });
        
        if (!queue.player) {
            return interaction.reply({ content: 'There is no music playing right now!', ephemeral: true });
        }

        await queue.player.stopTrack();
        return interaction.reply('🦊 Music skipped!');
    },
};
