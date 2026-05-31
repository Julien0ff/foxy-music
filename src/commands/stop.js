const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop the music and clear the queue'),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) {
            return interaction.reply({ content: 'There is no music playing right now!', ephemeral: true });
        }

        const queue = global.queues.get(interaction.guild.id);
        if (queue) {
            queue.tracks = [];
            queue.loop = false;
            await interaction.client.shoukaku.leaveVoiceChannel(interaction.guild.id);
            global.queues.delete(interaction.guild.id);
        }

        return interaction.reply('🦊 Music stopped and queue cleared!');
    },
};
