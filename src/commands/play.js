const { SlashCommandBuilder } = require('discord.js');
const { updatePanel } = require('../utils/panelUpdater');

// Store queues per guild
if (!global.queues) global.queues = new Map();

function getQueue(guildId) {
    if (!global.queues.has(guildId)) {
        global.queues.set(guildId, {
            tracks: [],
            currentTrack: null,
            player: null
        });
    }
    return global.queues.get(guildId);
}

async function playNext(guildId, client) {
    const queue = getQueue(guildId);

    if (queue.loop && queue.currentTrack) {
        // If loop is enabled, put the current track at the beginning of the queue to play it again
        queue.tracks.unshift(queue.currentTrack);
    }

    if (queue.tracks.length === 0) {
        queue.currentTrack = null;
        if (queue.player) {
            client.shoukaku.leaveVoiceChannel(guildId);
            queue.player = null;
        }
        global.queues.delete(guildId);
        if (client) updatePanel(client, guildId);
        return null;
    }

    const track = queue.tracks.shift();
    queue.currentTrack = track;

    let useIdentifier = false;
    if (track.nodeName && queue.player && queue.player.node.name !== track.nodeName) {
        try {
            const connection = client.shoukaku.connections.get(guildId);
            if (connection && connection.serverUpdate) {
                console.log(`[Player] Moving player to ${track.nodeName} to match track resolution node`);
                await queue.player.move(track.nodeName);
            } else {
                console.log(`[Player] Connection not ready for move, will play via identifier`);
                useIdentifier = true;
            }
        } catch (err) {
            console.error('Failed to move player for next track, falling back to identifier:', err.message);
            useIdentifier = true;
        }
    }

    try {
        if (queue.player) {
            if (useIdentifier) {
                await queue.player.playTrack({ track: { identifier: track.url } });
            } else {
                await queue.player.playTrack({ track: { encoded: track.encoded } });
            }
            console.log(`[Player] Now streaming: ${track.title}`);
            if (client) updatePanel(client, guildId);
            return track;
        } else {
            console.warn('[Player Warning] queue.player was null right before playTrack');
            return null;
        }
    } catch (err) {
        console.error('[Play Error]', err.message);
        return playNext(guildId, client);
    }
}

// --- Spotify / Apple Music helpers ---

async function getSpotifyTrackName(url) {
    try {
        const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.title || null;
    } catch {
        return null;
    }
}

async function getAppleMusicTrackName(url) {
    try {
        const res = await fetch(`https://music.apple.com/oembed?url=${encodeURIComponent(url)}`);
        if (res.ok) {
            const data = await res.json();
            return data.title || null;
        }
        const match = url.match(/\/album\/([^/]+)/);
        if (match) return match[1].replace(/-/g, ' ');
        return null;
    } catch {
        return null;
    }
}

function isSpotifyUrl(query) {
    return query.includes('open.spotify.com') || query.includes('spotify.link');
}

function isAppleMusicUrl(query) {
    return query.includes('music.apple.com');
}

function isYouTubeUrl(query) {
    return query.includes('youtube.com/watch') || query.includes('youtu.be/');
}

function isSoundCloudUrl(query) {
    return query.includes('soundcloud.com/');
}

function isDeezerUrl(query) {
    return query.includes('deezer.com') || query.includes('deezer.page.link');
}

async function getDeezerTrackName(url) {
    try {
        const res = await fetch(`https://deezer.com/oembed?url=${encodeURIComponent(url)}`);
        if (res.ok) {
            const data = await res.json();
            return data.title || null;
        }
        return null;
    } catch {
        return null;
    }
}

// --- Main command ---

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from YouTube, Spotify, Apple Music, SoundCloud...')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song URL or search query')
                .setRequired(true)),

    async execute(interaction) {
        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true });
        }

        const query = interaction.options.getString('query', true);
        await interaction.deferReply();

        const queue = getQueue(interaction.guild.id);

        // If no player exists, create one and connect first to know the target node
        if (!queue.player) {
            let player = interaction.client.shoukaku.players.get(interaction.guild.id);
            if (player) {
                queue.player = player;
            } else {
                try {
                    player = await interaction.client.shoukaku.joinVoiceChannel({
                        guildId: interaction.guild.id,
                        channelId: channel.id,
                        shardId: 0
                    });

                    queue.player = player;

                    player.on('start', () => {
                        updatePanel(interaction.client, interaction.guild.id);
                    });

                    player.on('end', (reason) => {
                        if (reason.reason === 'REPLACED') return;
                        playNext(interaction.guild.id, interaction.client);
                    });

                    player.on('error', (error) => {
                        console.error('[Player Error]', error);
                        playNext(interaction.guild.id, interaction.client);
                    });
                } catch (err) {
                    console.error('[Join Error]', err);
                    return interaction.followUp('❌ Impossible de rejoindre le salon vocal.');
                }
            }
        }

        const nodes = Array.from(interaction.client.shoukaku.nodes.values());
        if (nodes.length === 0) {
            return interaction.followUp('❌ Aucun nœud Lavalink n\'est disponible pour le moment.');
        }

        const playerNode = (queue.player && queue.player.node) ? queue.player.node : null;
        const orderedNodes = playerNode 
            ? [playerNode, ...nodes.filter(n => n.name !== playerNode.name)]
            : nodes;

        try {
            let finalQuery = query;
            if (isSpotifyUrl(query)) {
                const title = await getSpotifyTrackName(query);
                if (title) finalQuery = `ytsearch:${title}`;
            } else if (isAppleMusicUrl(query)) {
                const title = await getAppleMusicTrackName(query);
                if (title) finalQuery = `ytsearch:${title}`;
            } else if (isDeezerUrl(query)) {
                const title = await getDeezerTrackName(query);
                if (title) finalQuery = `ytsearch:${title}`;
            } else if (!isYouTubeUrl(query) && !isSoundCloudUrl(query) && !query.startsWith('http')) {
                finalQuery = `ytsearch:${query}`;
            }

            let result = null;
            let resolvedNode = null;
            for (const node of orderedNodes) {
                try {
                    result = await node.rest.resolve(query);
                    if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                        if (finalQuery !== query) {
                            result = await node.rest.resolve(finalQuery);
                        }
                    }
                    if (result && result.loadType !== 'empty' && result.loadType !== 'error') {
                        resolvedNode = node;
                        break;
                    }
                } catch (e) {
                    console.log(`[Lavalink Error] Node ${node.name} failed to resolve:`, e.message);
                }
            }

            if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                return interaction.followUp('❌ No results found!');
            }

            let trackToPlay = null;
            if (result.loadType === 'playlist') {
                trackToPlay = result.data.tracks[0];
            } else if (result.loadType === 'track') {
                trackToPlay = result.data;
            } else if (result.loadType === 'search') {
                trackToPlay = result.data[0];
            } else {
                return interaction.followUp('❌ No results found!');
            }

            if (!trackToPlay) {
                return interaction.followUp('❌ No results found!');
            }

            // Move the player to the resolved node if it is different
            if (resolvedNode && queue.player && queue.player.node && queue.player.node.name !== resolvedNode.name) {
                try {
                    console.log(`[Player] Moving player from ${queue.player.node.name} to ${resolvedNode.name} to match resolved track node`);
                    await queue.player.move(resolvedNode.name);
                } catch (err) {
                    console.error('Failed to move player to resolved node:', err);
                }
            }

            const trackInfo = { 
                title: trackToPlay.info.title, 
                url: trackToPlay.info.uri, 
                encoded: trackToPlay.encoded,
                duration: trackToPlay.info.length,
                artworkUrl: trackToPlay.info.artworkUrl || null,
                nodeName: resolvedNode.name
            };

            const isAlreadyPlaying = !!queue.currentTrack;
            queue.tracks.push(trackInfo);

            if (!isAlreadyPlaying) {
                const nowPlaying = await playNext(interaction.guild.id, interaction.client);
                if (nowPlaying) {
                    return interaction.followUp(`🦊 Now playing: **${nowPlaying.title}**`);
                } else {
                    return interaction.followUp('❌ Failed to play the track.');
                }
            } else {
                updatePanel(interaction.client, interaction.guild.id);
                return interaction.followUp(`🦊 Added to queue: **${trackInfo.title}**`);
            }
        } catch (e) {
            console.error('[Command Error]', e);
            return interaction.followUp(`❌ Something went wrong: ${e.message}`);
        }
    },
    playNext: playNext
};
