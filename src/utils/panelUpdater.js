const { EmbedBuilder, ActivityType } = require('discord.js');
const { getGuildConfig } = require('./db');

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

async function updatePanel(client, guildId) {
    const config = getGuildConfig(guildId);
    const queue = global.queues ? global.queues.get(guildId) : null;

    // 1. Synchroniser en temps réel avec le Dashboard Web via Socket.io (toujours actif)
    if (global.io) {
        global.io.to(`queue_${guildId}`).emit('queue_update', {
            currentTrack: queue?.currentTrack || null,
            tracks: queue?.tracks || [],
            isPlaying: queue?.player && !queue?.player.paused,
            position: queue?.player ? queue.player.position : 0,
            duration: queue?.currentTrack ? queue.currentTrack.duration || 0 : 0,
            volume: queue?.volume || 100,
            loop: queue?.loop || false
        });
    }

    // 2. Mettre à jour l'embed de contrôle Discord si configuré
    if (!config.panelChannelId || !config.panelMessageId) return;

    try {
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return;

        const channel = guild.channels.cache.get(config.panelChannelId);
        if (!channel) return;

        const message = await channel.messages.fetch(config.panelMessageId).catch(() => null);
        if (!message) return;

        let description = '';
        let title = '🦊 Foxy Music Panel';
        let color = '#ff9900';
        let thumbnail = null;

        if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
            description = '**Aucune musique en cours de lecture.**\n\nEnvoyez un lien ou un titre dans ce salon pour commencer la lecture !';
            color = '#36393f';
            // État par défaut quand rien ne joue
            const serverCount = client.guilds.cache.size;
            client.user.setPresence({
                activities: [{
                    name: `${serverCount} serveurs 🦊`,
                    type: ActivityType.Listening
                }],
                status: 'idle'
            });
        } else {
            if (queue.currentTrack) {
                const current = queue.player ? queue.player.position : 0;
                
                // Mettre à jour le statut du bot avec la musique en cours
                client.user.setPresence({
                    activities: [{
                        name: `${queue.currentTrack.title} 🎶`,
                        type: ActivityType.Listening
                    }],
                    status: 'idle'
                });
                const total = queue.currentTrack.duration || 0;
                const bar = createProgressBar(current, total, 20);
                const timeStr = `${formatTime(current)} / ${formatTime(total)}`;
                thumbnail = queue.currentTrack.artworkUrl || getYoutubeThumbnail(queue.currentTrack.url);
                
                description += `**Lecture en cours :**\n🎶 [${queue.currentTrack.title}](${queue.currentTrack.url})\n`;
                description += `\`${bar}\` \`${timeStr}\`\n\n`;
            }
            if (queue.tracks.length > 0) {
                description += `**File d'attente :**\n`;
                const nextTracks = queue.tracks.slice(0, 5);
                nextTracks.forEach((track, index) => {
                    description += `\`${index + 1}.\` ${track.title}\n`;
                });
                if (queue.tracks.length > 5) {
                    description += `\n*...et ${queue.tracks.length - 5} autres titres.*`;
                }
            } else {
                description += `\n*Aucune autre musique dans la file.*`;
            }
        }

        const embed = new EmbedBuilder()
            .setTitle(title)
            .setDescription(description)
            .setColor(color)
            .setImage('https://imgg.fr/r/p6fLtaqB.png')
            .setFooter({ text: 'Powered by Foxy Music Web Panel' });

        if (thumbnail) {
            embed.setThumbnail(thumbnail);
        }

        await message.edit({ embeds: [embed] }).catch(() => { });
    } catch (e) {
        console.error('Error updating panel:', e);
    }
}

module.exports = {
    updatePanel
};
