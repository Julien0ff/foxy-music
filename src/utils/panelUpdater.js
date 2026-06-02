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

    // 2. Mettre à jour la présence du bot Discord
    try {
        if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
            const serverCount = client.guilds.cache.size;
            client.user.setPresence({
                activities: [{
                    name: `${serverCount} serveurs 🦊`,
                    type: ActivityType.Listening
                }],
                status: 'idle'
            });
        } else if (queue.currentTrack) {
            client.user.setPresence({
                activities: [{
                    name: `${queue.currentTrack.title} 🎶`,
                    type: ActivityType.Listening
                }],
                status: 'idle'
            });
        }
    } catch (e) {
        console.error('Error updating bot presence:', e);
    }
}

module.exports = {
    updatePanel
};
