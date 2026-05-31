const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

function formatTime(ms) {
    if (!ms || isNaN(ms)) return '0:00';
    const seconds = Math.floor(ms / 1000);
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function createProgressBar(current, total, length = 15) {
    if (!total || total === 0) return '🔘' + '▬'.repeat(length - 1);
    const progress = Math.min(length - 1, Math.max(0, Math.round((current / total) * length)));
    const emptyProgress = Math.max(0, length - progress - 1);
    return '▬'.repeat(progress) + '🔘' + '▬'.repeat(emptyProgress);
}

function getYoutubeThumbnail(url) {
    if (!url) return null;
    const match = url.match(/(?:v=|youtu\.be\/)([^&?]+)/);
    if (match && match[1]) return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
    return null;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('View the currently playing song'),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) {
            return interaction.reply({ content: 'There is no music playing right now!', ephemeral: true });
        }

        const queue = global.queues.get(interaction.guild.id);
        const track = queue.currentTrack;

        if (!track) {
            return interaction.reply({ content: 'There is no music playing right now!', ephemeral: true });
        }

        const current = queue.player ? queue.player.position : 0;
        const total = track.duration || 0;
        const bar = createProgressBar(current, total, 20);
        const timeStr = `${formatTime(current)} / ${formatTime(total)}`;
        const thumbnail = track.artworkUrl || getYoutubeThumbnail(track.url);

        const embed = new EmbedBuilder()
            .setTitle('🦊 Now Playing')
            .setDescription(`**[${track.title}](${track.url})**\n\n\`${bar}\` \`${timeStr}\``)
            .setColor('#ff9900');

        if (thumbnail) embed.setThumbnail(thumbnail);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('foxy_refresh_np')
                .setLabel('Rafraîchir')
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Secondary)
        );

        if (interaction.isButton && interaction.isButton()) {
            return interaction.update({ embeds: [embed], components: [row] });
        }

        return interaction.reply({ embeds: [embed], components: [row] });
    },
};
