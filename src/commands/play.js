const { SlashCommandBuilder } = require('discord.js');
const { updatePanel } = require('../utils/panelUpdater');
const PlaylistParser = require('../utils/playlistParser');

// Store queues per guild
if (!global.queues) global.queues = new Map();

function getQueue(guildId) {
    if (!global.queues.has(guildId)) {
        const { getGuildConfig } = require('../utils/db');
        const config = getGuildConfig(guildId);
        
        global.queues.set(guildId, {
            tracks: [],
            currentTrack: null,
            player: null,
            history: [],
            autoplay: config.autoplay || false,
            volume: config.defaultVolume || 100,
            leaveTimeout: null
        });
    }
    return global.queues.get(guildId);
}

async function playNext(guildId, client) {
    const queue = getQueue(guildId);
    queue.prefetchedNext = false; // Reset background prefetch flag

    if (queue.currentTrack && !queue.loop) {
        if (!queue.history) queue.history = [];
        queue.history.push(queue.currentTrack);
        if (queue.history.length > 15) queue.history.shift();
    }

    if (queue.loop && queue.currentTrack) {
        // If loop is enabled, put the current track at the beginning of the queue to play it again
        queue.tracks.unshift(queue.currentTrack);
    }

    if (queue.tracks.length === 0) {
        const config = require('../utils/db').getGuildConfig(guildId);
        
        if (queue.autoplay && queue.history && queue.history.length > 0) {
            console.log(`[Autoplay] Queue empty, fetching related track for guild: ${guildId}`);
            const lastTrack = queue.history[queue.history.length - 1];
            const searchQuery = `scsearch:${lastTrack.artist || lastTrack.title}`;
            
            try {
                const nodes = Array.from(client.shoukaku.nodes.values());
                let autoplayTrack = null;
                for (const node of nodes) {
                    const result = await node.rest.resolve(searchQuery);
                    if (result && result.loadType === 'search' && result.data && result.data.length > 0) {
                        // Find a track that isn't already in history
                        for (const t of result.data) {
                            if (!queue.history.find(h => h.title === t.info.title)) {
                                autoplayTrack = t;
                                break;
                            }
                        }
                        // Fallback to first if all played
                        if (!autoplayTrack) autoplayTrack = result.data[0];
                        if (autoplayTrack) break;
                    }
                }

                if (autoplayTrack) {
                    queue.tracks.push({
                        title: autoplayTrack.info.title,
                        url: autoplayTrack.info.uri,
                        encoded: autoplayTrack.encoded,
                        duration: autoplayTrack.info.length,
                        artworkUrl: autoplayTrack.info.artworkUrl || null,
                        nodeName: nodes[0].name
                    });
                    console.log(`[Autoplay] Added: ${autoplayTrack.info.title}`);
                }
            } catch (err) {
                console.error('[Autoplay Error]', err);
            }
        }
        
        // Check again if tracks are still empty after attempting autoplay
        if (queue.tracks.length === 0) {
            queue.currentTrack = null;
            console.log(`[Player] Queue is empty for guild: ${guildId}. Waiting for new tracks.`);
            if (client) updatePanel(client, guildId);
            
            if (!config.twentyFourSeven) {
                if (queue.leaveTimeout) clearTimeout(queue.leaveTimeout);
                queue.leaveTimeout = setTimeout(() => {
                    const checkQueue = global.queues.get(guildId);
                    if (checkQueue && checkQueue.tracks.length === 0 && !checkQueue.currentTrack && checkQueue.player) {
                        console.log(`[Player] Inactivity timeout reached. Leaving voice channel for guild: ${guildId}`);
                        try {
                            client.shoukaku.leaveVoiceChannel(guildId);
                            checkQueue.player = null;
                            global.queues.delete(guildId);
                            updatePanel(client, guildId);
                        } catch (e) {}
                    }
                }, 5 * 60 * 1000); // 5 minutes timeout
            }
            return null;
        }
    }
    
    if (queue.leaveTimeout) {
        clearTimeout(queue.leaveTimeout);
        queue.leaveTimeout = null;
    }

    const track = queue.tracks.shift();
    queue.currentTrack = track;

    // Resolve track if it's imported and doesn't have an encoded track or URL yet
    if (!track.encoded && !track.url) {
        console.log(`[Player] Resolving unresolved track in playNext: ${track.title}`);
        try {
            const nodes = Array.from(client.shoukaku.nodes.values());
            let resolved = false;
            for (const node of nodes) {
                let resolveQuery = track.query || track.title;
                if (track.isImported) {
                    resolveQuery = `ytmsearch:${track.title} ${track.artist || ''}`.trim();
                }
                const result = await node.rest.resolve(resolveQuery);
                if (result && result.data) {
                    let trackToPlay = null;
                    if (result.loadType === 'playlist') {
                        trackToPlay = result.data.tracks[0];
                    } else if (result.loadType === 'track') {
                        trackToPlay = result.data;
                    } else if (result.loadType === 'search') {
                        trackToPlay = result.data[0];
                    }
                    
                    if (trackToPlay) {
                        
                        track.encoded = trackToPlay.encoded;
                        track.url = trackToPlay.info.uri;
                        track.duration = trackToPlay.info.length;
                        track.artworkUrl = trackToPlay.info.artworkUrl || track.artworkUrl;
                        track.title = trackToPlay.info.title;
                        resolved = true;
                        break;
                    }
                }
            }
            if (!resolved) {
                console.warn(`[Player] Could not resolve track "${track.title}". Skipping to next.`);
                return playNext(guildId, client);
            }
        } catch (resolveErr) {
            console.error(`[Player] Error resolving track in playNext:`, resolveErr.message);
            return playNext(guildId, client);
        }
    }

    try {
        if (queue.player) {
            if (track.encoded) {
                try {
                    await queue.player.playTrack({ track: { encoded: track.encoded } });
                } catch (encodedErr) {
                    console.warn(`[Player] Failed to play encoded track, falling back to identifier: ${encodedErr.message}`);
                    await queue.player.playTrack({ track: { identifier: track.url } });
                }
            } else {
                await queue.player.playTrack({ track: { identifier: track.url } });
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

async function handleLoadFailed(guildId, client, failedTrack) {
    const queue = getQueue(guildId);
    if (!queue || !queue.player || !failedTrack) return playNext(guildId, client);

    // Prevent infinite loop if the fallback itself fails
    if (failedTrack.isFallback) {
        console.warn(`[Player] Fallback track failed to load as well: ${failedTrack.title}`);
        return playNext(guildId, client);
    }

    console.log(`[Player Fallback] Track "${failedTrack.title}" failed to load. Attempting SoundCloud fallback...`);

    try {
        const nodes = Array.from(client.shoukaku.nodes.values());
        const searchQuery = `ytmsearch:${failedTrack.title} ${failedTrack.artist || ''}`.trim();
        
        let result = null;
        let resolvedNode = null;
        for (const node of nodes) {
            try {
                result = await node.rest.resolve(searchQuery);
                if (result && result.loadType === 'search' && result.data && result.data.length > 0) {
                    resolvedNode = node;
                    break;
                }
            } catch (err) {
                console.log(`[Fallback Node Error] Node ${node.name} failed resolving fallback:`, err.message);
            }
        }

        if (result && result.loadType === 'search' && result.data && result.data.length > 0) {
            const fallbackTrack = result.data[0];
            const newTrackInfo = {
                title: fallbackTrack.info.title,
                url: fallbackTrack.info.uri,
                encoded: fallbackTrack.encoded,
                duration: fallbackTrack.info.length,
                artworkUrl: fallbackTrack.info.artworkUrl || failedTrack.artworkUrl,
                nodeName: resolvedNode.name,
                isFallback: true
            };

            queue.currentTrack = newTrackInfo;
            console.log(`[Player Fallback] Successfully resolved SoundCloud fallback: ${newTrackInfo.title}`);
            
            if (newTrackInfo.encoded) {
                await queue.player.playTrack({ track: { encoded: newTrackInfo.encoded } });
            } else {
                await queue.player.playTrack({ track: { identifier: newTrackInfo.url } });
            }
            updatePanel(client, guildId);
            return;
        }
    } catch (e) {
        console.error('[Player Fallback Error]', e.message);
    }

    // If fallback fails to resolve or play, move to next song
    console.log('[Player Fallback] SoundCloud fallback failed. Moving to next track.');
    playNext(guildId, client);
}

// --- Spotify / Apple Music helpers ---

async function getSpotifyTrackName(url) {
    return PlaylistParser.getSpotifyTrackName(url);
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
async function getYouTubeVideoTitle(url) {
    try {
        const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (res.ok) {
            const data = await res.json();
            if (data.title) return data.title;
        }
    } catch (err) {
        console.warn('[YouTube Title] Official oembed failed:', err.message);
    }
    // Try noembed fallback (less restrictive for datacenter IPs)
    try {
        const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
        if (res.ok) {
            const data = await res.json();
            if (data.title) return data.title;
        }
    } catch (err) {
        console.warn('[YouTube Title] Noembed fallback failed:', err.message);
    }
    return null;
}

// --- Main command ---

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play a song from YouTube, Spotify, Apple Music, SoundCloud...')
        .addStringOption(option =>
            option.setName('query')
                .setDescription('The song URL or search query')
                .setRequired(true)
                .setAutocomplete(true)),

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
                    try {
                        await interaction.client.shoukaku.leaveVoiceChannel(interaction.guild.id);
                    } catch (_) {}

                    player = await interaction.client.shoukaku.joinVoiceChannel({
                        guildId: interaction.guild.id,
                        channelId: channel.id,
                        shardId: 0,
                        deaf: true
                    });

                    queue.player = player;

                    player.on('start', () => {
                        console.log(`[Player] Now streaming: ${queue.currentTrack?.title || 'Unknown Track'}`);
                        updatePanel(interaction.client, interaction.guild.id);
                    });

                    player.on('end', (reason) => {
                        console.log(`[Player] Track ended. Reason: ${reason.reason}`);
                        if (reason.reason === 'REPLACED') return;
                        if (reason.reason === 'loadFailed') {
                            handleLoadFailed(interaction.guild.id, interaction.client, queue.currentTrack);
                        } else {
                            playNext(interaction.guild.id, interaction.client);
                        }
                    });

                    player.on('exception', (exception) => {
                        console.error('[Player Exception]', exception.exception?.message || exception.exception || exception);
                    });

                    player.on('stuck', (stuck) => {
                        console.warn('[Player Stuck] Threshold exceeded (ms):', stuck.thresholdMs);
                        playNext(interaction.guild.id, interaction.client);
                    });

                    player.on('error', (error) => {
                        console.error('[Player Error]', error);
                        playNext(interaction.guild.id, interaction.client);
                    });

                    player.on('update', async (state) => {
                        const queue = getQueue(interaction.guild.id);
                        if (!queue || queue.tracks.length === 0 || queue.prefetchedNext) return;

                        const track = queue.currentTrack;
                        if (!track || !track.duration) return;

                        const timeRemaining = track.duration - state.position;
                        if (timeRemaining <= 15000) { // 15 seconds or less remaining
                            queue.prefetchedNext = true;
                            const nextTrack = queue.tracks[0];
                            if (nextTrack && !nextTrack.encoded) {
                                console.log(`[Prefetch] Pre-resolving next track in background: ${nextTrack.title || nextTrack.url}`);
                                try {
                                    const nodes = Array.from(interaction.client.shoukaku.nodes.values());
                                    for (const node of nodes) {
                                        let finalQuery = nextTrack.url || nextTrack.query;
                                        if (nextTrack.isImported) {
                                            finalQuery = `ytmsearch:${nextTrack.title} ${nextTrack.artist || ''}`.trim();
                                        }
                                        const result = await node.rest.resolve(finalQuery);
                                        if (result && result.data) {
                                            let trackToPlay = null;
                                            if (result.loadType === 'playlist') {
                                                trackToPlay = result.data.tracks[0];
                                            } else if (result.loadType === 'track') {
                                                trackToPlay = result.data;
                                            } else if (result.loadType === 'search') {
                                                trackToPlay = result.data[0];
                                            }
                                            if (trackToPlay) {
                                                nextTrack.encoded = trackToPlay.encoded;
                                                nextTrack.url = trackToPlay.info.uri;
                                                nextTrack.duration = trackToPlay.info.length;
                                                nextTrack.artworkUrl = trackToPlay.info.artworkUrl || nextTrack.artworkUrl;
                                                nextTrack.title = trackToPlay.info.title;
                                                console.log(`[Prefetch] Successfully pre-resolved next track: ${nextTrack.title}`);
                                                break;
                                            }
                                        }
                                    }
                                } catch (err) {
                                    console.error('[Prefetch Error]', err.message);
                                }
                            }
                        }
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
            let shouldForceFinalQuery = false;
            
            if (!query.startsWith('http')) {
                finalQuery = `scsearch:${query}`;
                shouldForceFinalQuery = true;
            }
            
            let result = null;
            let resolvedNode = null;
            for (const node of orderedNodes) {
                try {
                    if (shouldForceFinalQuery) {
                        result = await node.rest.resolve(finalQuery);
                    } else {
                        result = await node.rest.resolve(query);
                        if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                            if (finalQuery !== query) {
                                result = await node.rest.resolve(finalQuery);
                            }
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

            if (result.loadType === 'playlist') {
                const tracks = result.data.tracks;
                if (!tracks || tracks.length === 0) {
                    return interaction.followUp('❌ No tracks found in the playlist!');
                }

                const tracksInfo = tracks.map(t => {
                    const isYT = t.info.uri && (t.info.uri.includes('youtube.com') || t.info.uri.includes('youtu.be'));
                    return {
                        title: t.info.title,
                        artist: t.info.author || '',
                        url: isYT ? null : t.info.uri,
                        query: isYT ? `${t.info.title} ${t.info.author || ''}` : null,
                        encoded: isYT ? null : t.encoded,
                        duration: t.info.length,
                        artworkUrl: t.info.artworkUrl || null,
                        isImported: isYT, // Forces resolving via SoundCloud in playNext/prefetch
                        nodeName: resolvedNode.name
                    };
                });

                const isAlreadyPlaying = !!queue.currentTrack;
                queue.tracks.push(...tracksInfo);

                if (!isAlreadyPlaying) {
                    const nowPlaying = await playNext(interaction.guild.id, interaction.client);
                    if (nowPlaying) {
                        return interaction.followUp(`🦊 Now playing playlist: **${result.data.info.name || 'Playlist'}** (${tracksInfo.length} tracks). Current: **${nowPlaying.title}**`);
                    } else {
                        return interaction.followUp('❌ Failed to play the track.');
                    }
                } else {
                    updatePanel(interaction.client, interaction.guild.id);
                    return interaction.followUp(`🦊 Added playlist **${result.data.info.name || 'Playlist'}** to queue (${tracksInfo.length} tracks).`);
                }
            }

            let trackToPlay = null;
            if (result.loadType === 'track') {
                trackToPlay = result.data;
            } else if (result.loadType === 'search') {
                trackToPlay = result.data[0];
            } else {
                return interaction.followUp('❌ No results found!');
            }

            if (!trackToPlay) {
                return interaction.followUp('❌ No results found!');
            }

            // Native Lavalink track resolution used.

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
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        if (!focusedValue || !focusedValue.trim() || focusedValue.startsWith('http')) {
            try {
                return await interaction.respond([]);
            } catch (_) {}
            return;
        }

        try {
            const response = await fetch(
                `https://itunes.apple.com/search?term=${encodeURIComponent(focusedValue)}&media=music&limit=10&entity=song`
            );
            if (response.ok) {
                const data = await response.json();
                const results = data.results || [];
                const choices = results.map(track => {
                    const name = `${track.trackName} - ${track.artistName}`;
                    const displayName = name.length > 100 ? name.substring(0, 97) + '...' : name;
                    return {
                        name: displayName,
                        value: `${track.trackName} ${track.artistName}`
                    };
                });
                try {
                    await interaction.respond(choices);
                } catch (_) {}
            } else {
                try {
                    await interaction.respond([]);
                } catch (_) {}
            }
        } catch (error) {
            console.error('[Autocomplete Error]', error);
            try {
                await interaction.respond([]);
            } catch (_) {}
        }
    },
    playNext: playNext,
    handleLoadFailed: handleLoadFailed
};
