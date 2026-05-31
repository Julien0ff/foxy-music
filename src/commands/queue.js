const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('View the current song queue'),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) {
            return interaction.reply({ content: 'There is no music playing right now!', flags: 64 });
        }

        const queue = global.queues.get(interaction.guild.id);
        const current = queue.currentTrack;
        const tracks = queue.tracks;

        if (!current) {
            return interaction.reply({ content: 'There is no music playing right now!', flags: 64 });
        }

        const upcoming = tracks.length > 0
            ? tracks.slice(0, 10).map((t, i) => `**${i + 1}.** ${t.title}`).join('\n')
            : 'No more tracks in queue.';

        const embed = new EmbedBuilder()
            .setTitle('🦊 Foxy Queue')
            .setColor('#ff9900')
            .setDescription(`**Now Playing:** ${current.title}\n\n**Up Next:**\n${upcoming}`);

        return interaction.reply({ embeds: [embed] });
    },
};
