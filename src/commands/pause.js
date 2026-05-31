const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current track'),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) {
            return interaction.reply({ content: 'There is no music playing right now!', ephemeral: true });
        }

        const queue = global.queues.get(interaction.guild.id);
        if (!queue.player) {
            return interaction.reply({ content: 'There is no music playing right now!', ephemeral: true });
        }

        await queue.player.setPaused(true);
        return interaction.reply('🦊 Music paused!');
    },
};
