const { SlashCommandBuilder } = require('discord.js');
const { updatePanel } = require('../utils/panelUpdater');
const PlaylistParser = require('../utils/playlistParser');

// Store queues per guild
if (!global.queues) global.queues = new Map();

// Per-guild connection locks to prevent concurrent joinVoiceChannel race conditions
const connectionLocks = new Map();

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
            leaveTimeout: null,
            isSkipping: false
        });
    }
    return global.queues.get(guildId);
}

/**
 * Extract the first playable track from a Lavalink v4 resolve response
 */
function extractTrackFromResult(res) {
    if (!res || !res.data || res.loadType === 'empty' || res.loadType === 'error') return null;
    if (res.loadType === 'track') return res.data;
    if (res.loadType === 'search' && Array.isArray(res.data) && res.data.length > 0) return res.data[0];
    if (res.loadType === 'playlist' && Array.isArray(res.data.tracks) && res.data.tracks.length > 0) return res.data.tracks[0];
    return null;
}

/**
 * Safely plays a track on the given Shoukaku player.
 * Handles cross-node encoding incompatibilities (e.g. Spotify resolved on Kasawa played on Nazha)
 * by re-resolving on the player's own node before calling playTrack, avoiding 400 Bad Request RestErrors.
 */
async function safePlayTrack(player, track, client, guildId) {
    if (!player || !track) return false;
    const playerNode = player.node;

    // 1. If we have an encoded track from the SAME node (or unknown origin), try it first
    const sameNodeOrigin = !track.nodeName || !playerNode?.name || track.nodeName === playerNode.name;
    if (track.encoded && sameNodeOrigin) {
        try {
            await player.playTrack({ track: { encoded: track.encoded } });
            return true;
        } catch (encodedErr) {
            console.warn(`[Player] Encoded playback failed on node ${playerNode?.name || 'unknown'} (${encodedErr.message}), re-resolving on player node...`);
        }
    }

    // 2. Re-resolve directly on the player's own node (or any online node if playerNode fails) so we get a valid encoded string for this node
    const nodes = Array.from(client?.shoukaku?.nodes?.values() || []).filter(n => n.state === 1);
    const orderedNodes = playerNode
        ? [playerNode, ...nodes.filter(n => n.name !== playerNode.name)]
        : nodes;

    const queriesToTry = [];
    // If it's a direct audio file or YouTube/SoundCloud URL, try resolving the URL first
    if (track.url && (track.isFile || track.url.includes('youtube.com') || track.url.includes('youtu.be') || track.url.includes('soundcloud.com') || track.url.includes('discordapp.com'))) {
        queriesToTry.push(track.url);
    }
    const searchBase = `${track.title || ''} ${track.artist || track.author || ''}`.trim() || track.query;
    if (searchBase && !track.isFile) {
        queriesToTry.push(`ytmsearch:${searchBase}`);
        queriesToTry.push(`ytsearch:${searchBase}`);
        queriesToTry.push(`scsearch:${searchBase}`);
    }
    if (track.url && !queriesToTry.includes(track.url)) {
        queriesToTry.push(track.url);
    }

    for (const q of queriesToTry) {
        for (const node of orderedNodes) {
            try {
                const res = await node.rest.resolve(q);
                const resolvedTrack = extractTrackFromResult(res);
                if (resolvedTrack && resolvedTrack.encoded) {
                    track.encoded = resolvedTrack.encoded;
                    track.url = resolvedTrack.info?.uri || track.url;
                    track.duration = resolvedTrack.info?.length || track.duration;
                    track.artworkUrl = track.artworkUrl || resolvedTrack.info?.artworkUrl || null;
                    track.nodeName = node.name;
                    await player.playTrack({ track: { encoded: resolvedTrack.encoded } });
                    return true;
                }
            } catch (_) {}
        }
    }

    // 3. Final fallback if track.encoded was from another node and re-resolve failed
    if (track.encoded && !sameNodeOrigin) {
        await player.playTrack({ track: { encoded: track.encoded } });
        return true;
    }

    throw new Error(`Unable to resolve or play track "${track.title || track.url}" on active Lavalink node`);
}

function setupPlayerListeners(player, queue, guildId, client) {
    if (!player) return;
    player.removeAllListeners();

    player.on('start', () => {
        console.log(`[Player] Now streaming: ${queue.currentTrack?.title || 'Unknown Track'}`);
        updatePanel(client, guildId);
    });

    player.on('end', (reason) => {
        const endReason = (reason?.reason || '').toLowerCase();
        console.log(`[Player] Track ended. Reason: ${reason?.reason}`);

        if (endReason === 'replaced' || endReason === 'cleanup') return;

        // If the bot was disconnected from voice and this wasn't an explicit skip, do not trigger playNext/autoplay
        const wasSkipping = queue.isSkipping;
        queue.isSkipping = false;

        if (!queue.player || !client.shoukaku.players.has(guildId)) {
            return;
        }

        if (endReason === 'stopped' && !wasSkipping) {
            const guild = client.guilds?.cache?.get(guildId);
            const botChannelId = client.shoukaku.connections.get(guildId)?.channelId || guild?.members?.me?.voice?.channelId;
            if (!botChannelId) return;
        }

        if (endReason === 'loadfailed') {
            handleLoadFailed(guildId, client, queue.currentTrack);
        } else {
            playNext(guildId, client);
        }
    });

    player.on('exception', (exception) => {
        console.error('[Player Exception]', exception.exception?.message || exception.exception || exception);
        if (queue.currentTrack && !queue.currentTrack.isFallback) {
            console.log(`[Player Exception Fallback] Déclenchement automatique du fallback SoundCloud suite à une exception audio...`);
            handleLoadFailed(guildId, client, queue.currentTrack);
        }
    });

    player.on('stuck', (stuck) => {
        console.warn('[Player Stuck] Threshold exceeded (ms):', stuck.thresholdMs);
        playNext(guildId, client);
    });

    player.on('error', (error) => {
        console.error('[Player Error]', error);
        playNext(guildId, client);
    });

    player.on('update', async (packet) => {
        const rawPos = (packet?.state && typeof packet.state.position === 'number')
            ? packet.state.position
            : (typeof player.position === 'number' ? player.position : 0);
        if (global.io) {
            global.io.to(`queue_${guildId}`).emit('player_position', {
                position: rawPos,
                isPlaying: !player.paused,
                timestamp: Date.now()
            });
        }

        const currentQueue = getQueue(guildId);
        if (!currentQueue || currentQueue.tracks.length === 0 || currentQueue.prefetchedNext) return;

        const track = currentQueue.currentTrack;
        if (!track || !track.duration) return;

        const timeRemaining = track.duration - rawPos;
        if (timeRemaining <= 15000) {
            currentQueue.prefetchedNext = true;
            const nextTrack = currentQueue.tracks[0];
            if (nextTrack && !nextTrack.encoded) {
                console.log(`[Prefetch] Pre-resolving next track in background: ${nextTrack.title || nextTrack.url}`);
                try {
                    const nodes = Array.from(client.shoukaku?.nodes?.values() || []).filter(n => n.state === 1);
                    const pNode = currentQueue.player?.node;
                    const ordered = pNode ? [pNode, ...nodes.filter(n => n.name !== pNode.name)] : nodes;
                    for (const node of ordered) {
                        let finalQuery = nextTrack.url || nextTrack.query;
                        if (nextTrack.isImported) {
                            finalQuery = `ytmsearch:${nextTrack.title} ${nextTrack.artist || ''}`.trim();
                        }
                        const result = await node.rest.resolve(finalQuery);
                        const trackToPlay = extractTrackFromResult(result);
                        if (trackToPlay) {
                            nextTrack.encoded = trackToPlay.encoded;
                            nextTrack.url = trackToPlay.info.uri;
                            nextTrack.duration = trackToPlay.info.length;
                            nextTrack.artworkUrl = trackToPlay.info.artworkUrl || nextTrack.artworkUrl;
                            nextTrack.title = trackToPlay.info.title;
                            nextTrack.nodeName = node.name;
                            console.log(`[Prefetch] Successfully pre-resolved next track: ${nextTrack.title}`);
                            break;
                        }
                    }
                } catch (err) {
                    console.error('[Prefetch Error]', err.message);
                }
            }
        }
    });

    player.on('closed', (reason) => {
        console.warn(`[Player Closed] ${reason?.reason || 'Connection closed'}`);
        if (queue.player === player) queue.player = null;
    });

    player._foxyListenersAttached = true;
}

/**
 * Ensures the bot is connected to the target voice channel (or moves it seamlessly if already connected),
 * serialized per-guild so concurrent API/command requests never trigger "This guild already have an existing connection".
 */
async function ensureVoiceConnection(client, guildId, targetChannelId = null) {
    if (connectionLocks.has(guildId)) {
        try {
            await connectionLocks.get(guildId);
        } catch (_) {}
    }

    const connectTask = (async () => {
        const queue = getQueue(guildId);
        const guild = client.guilds.cache.get(guildId);
        if (!guild) throw new Error('Serveur Discord non trouvé.');

        let channelId = targetChannelId;
        const existingConn = client.shoukaku.connections.get(guildId);
        const existingPlayer = queue.player || client.shoukaku.players.get(guildId);
        const currentChannelId = existingConn?.channelId || guild.members.me?.voice?.channelId || null;

        // Auto-select a voice channel if none was specified
        if (!channelId) {
            if (currentChannelId) {
                channelId = currentChannelId;
            } else {
                const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
                let targetChannel = voiceChannels.find(c => c.members.filter(m => !m.user.bot).size > 0);
                if (!targetChannel) targetChannel = voiceChannels.first();
                channelId = targetChannel?.id || null;
            }
        }

        if (!channelId) {
            return null;
        }

        // Case 1: Already connected with an active player & healthy node
        if (existingConn && existingConn.state === 1 && existingPlayer && existingPlayer.node?.state === 1) {
            queue.player = existingPlayer;
            if (!existingPlayer._foxyListenersAttached) {
                setupPlayerListeners(existingPlayer, queue, guildId, client);
            }
            if (!targetChannelId || currentChannelId === targetChannelId) {
                return existingPlayer;
            }
            // Move voice channel directly without disconnecting/destroying the player
            existingConn.channelId = targetChannelId;
            existingConn.sendVoiceUpdate();
            return existingPlayer;
        }

        // Case 2: Need a fresh connection — clean up any stale Shoukaku connection/player first
        if (!client.reconnectingGuilds) client.reconnectingGuilds = new Set();
        client.reconnectingGuilds.add(guildId);

        try {
            if (client.shoukaku.connections.has(guildId) || client.shoukaku.players.has(guildId)) {
                try {
                    await client.shoukaku.leaveVoiceChannel(guildId);
                } catch (_) {}
            }

            const player = await client.shoukaku.joinVoiceChannel({
                guildId: guildId,
                channelId: channelId,
                shardId: 0,
                deaf: true
            });

            queue.player = player;
            if (queue.volume && queue.volume !== 100) {
                player.setGlobalVolume(queue.volume).catch(() => {});
            }
            setupPlayerListeners(player, queue, guildId, client);
            return player;
        } finally {
            setTimeout(() => {
                client.reconnectingGuilds?.delete(guildId);
            }, 1000);
        }
    })();

    connectionLocks.set(guildId, connectTask);
    try {
        return await connectTask;
    } finally {
        if (connectionLocks.get(guildId) === connectTask) {
            connectionLocks.delete(guildId);
        }
    }
}

async function playNext(guildId, client) {
    const queue = getQueue(guildId);
    queue.prefetchedNext = false; // Reset background prefetch flag

    if (!queue.player) {
        const existingPlayer = client?.shoukaku?.players?.get(guildId);
        if (existingPlayer) {
            queue.player = existingPlayer;
        } else {
            queue.currentTrack = null;
            return null;
        }
    }

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
        
        if (queue.autoplay && queue.history && queue.history.length > 0 && queue.player) {
            console.log(`[Autoplay] Queue empty, fetching related track for guild: ${guildId}`);
            const lastTrack = queue.history[queue.history.length - 1];
            const searchQuery = `ytmsearch:${lastTrack.artist || lastTrack.title}`;
            
            try {
                const nodes = Array.from(client.shoukaku?.nodes?.values() || []).filter(n => n.state === 1);
                const playerNode = queue.player?.node;
                const orderedNodes = playerNode
                    ? [playerNode, ...nodes.filter(n => n.name !== playerNode.name)]
                    : nodes;
                let autoplayTrack = null;
                let resolvedNode = null;
                for (const node of orderedNodes) {
                    const result = await node.rest.resolve(searchQuery);
                    if (result && result.loadType === 'search' && result.data && result.data.length > 0) {
                        for (const t of result.data) {
                            if (!queue.history.find(h => h.title === t.info.title)) {
                                autoplayTrack = t;
                                break;
                            }
                        }
                        if (!autoplayTrack) autoplayTrack = result.data[0];
                        if (autoplayTrack) {
                            resolvedNode = node;
                            break;
                        }
                    }
                }

                // Abort if the bot was disconnected while fetching autoplay
                if (!queue.player || !client.shoukaku.players.has(guildId)) {
                    queue.currentTrack = null;
                    return null;
                }

                if (autoplayTrack) {
                    queue.tracks.push({
                        title: autoplayTrack.info.title,
                        artist: autoplayTrack.info.author || '',
                        url: autoplayTrack.info.uri,
                        encoded: autoplayTrack.encoded,
                        duration: autoplayTrack.info.length,
                        artworkUrl: autoplayTrack.info.artworkUrl || null,
                        nodeName: resolvedNode?.name || orderedNodes[0]?.name
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
            const nodes = Array.from(client.shoukaku?.nodes?.values() || []).filter(n => n.state === 1);
            const playerNode = queue.player?.node;
            const orderedNodes = playerNode
                ? [playerNode, ...nodes.filter(n => n.name !== playerNode.name)]
                : nodes;
            let resolved = false;
            for (const node of orderedNodes) {
                try {
                    let resolveQuery = track.query || track.title;
                    if (track.isImported) {
                        resolveQuery = `ytmsearch:${track.title} ${track.artist || ''}`.trim();
                    }
                    const res = await node.rest.resolve(resolveQuery);
                    const trackToPlay = extractTrackFromResult(res);
                    if (trackToPlay) {
                        track.encoded = trackToPlay.encoded;
                        track.url = trackToPlay.info.uri;
                        track.duration = trackToPlay.info.length;
                        track.artworkUrl = trackToPlay.info.artworkUrl || track.artworkUrl;
                        track.title = trackToPlay.info.title;
                        track.artist = track.artist || trackToPlay.info.author || '';
                        track.nodeName = node.name;
                        resolved = true;
                        break;
                    }
                } catch (_) {}
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
        if (queue.player && client.shoukaku.players.has(guildId)) {
            await safePlayTrack(queue.player, track, client, guildId);
            console.log(`[Player] Now streaming: ${track.title}`);
            if (client) updatePanel(client, guildId);
            return track;
        } else {
            queue.currentTrack = null;
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
        const nodes = Array.from(client.shoukaku?.nodes?.values() || []).filter(n => n.state === 1);
        const playerNode = queue.player?.node;
        const orderedNodes = playerNode
            ? [playerNode, ...nodes.filter(n => n.name !== playerNode.name)]
            : nodes;
        const scQuery = `scsearch:${failedTrack.title} ${failedTrack.artist || ''}`.trim();
        
        let result = null;
        let resolvedNode = null;
        for (const node of orderedNodes) {
            try {
                result = await node.rest.resolve(scQuery);
                if (result && result.loadType === 'search' && result.data && result.data.length > 0) {
                    resolvedNode = node;
                    break;
                }
            } catch (err) {
                console.log(`[Fallback Node Error] Node ${node.name} failed resolving scsearch:`, err.message);
            }
        }

        // Si SoundCloud ne donne rien, tenter ytmsearch
        if (!result || result.loadType !== 'search' || !result.data || result.data.length === 0) {
            for (const node of orderedNodes) {
                try {
                    result = await node.rest.resolve(`ytmsearch:${failedTrack.title} ${failedTrack.artist || ''}`.trim());
                    if (result && result.loadType === 'search' && result.data && result.data.length > 0) {
                        resolvedNode = node;
                        break;
                    }
                } catch (_) {}
            }
        }

        if (result && result.loadType === 'search' && result.data && result.data.length > 0) {
            const fallbackTrack = result.data[0];
            const newTrackInfo = {
                title: fallbackTrack.info.title,
                artist: fallbackTrack.info.author || failedTrack.artist || '',
                url: fallbackTrack.info.uri,
                encoded: fallbackTrack.encoded,
                duration: fallbackTrack.info.length,
                artworkUrl: fallbackTrack.info.artworkUrl || failedTrack.artworkUrl,
                nodeName: resolvedNode.name,
                isFallback: true
            };

            queue.currentTrack = newTrackInfo;
            console.log(`[Player Fallback] Successfully resolved SoundCloud fallback: ${newTrackInfo.title}`);
            
            await safePlayTrack(queue.player, newTrackInfo, client, guildId);
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

        const nodes = Array.from(interaction.client.shoukaku?.nodes?.values() || []).filter(n => n.state === 1);
        if (nodes.length === 0) {
            return interaction.followUp('❌ Aucun nœud Lavalink n\'est disponible pour le moment.');
        }

        try {
            await ensureVoiceConnection(interaction.client, interaction.guild.id, channel.id);
        } catch (err) {
            console.error('[Join Error]', err);
            return interaction.followUp('❌ Impossible de rejoindre le salon vocal.');
        }

        const playerNode = (queue.player && queue.player.node) ? queue.player.node : null;
        const orderedNodes = playerNode 
            ? [playerNode, ...nodes.filter(n => n.name !== playerNode.name)]
            : nodes;

        try {
            let finalQuery = query;
            let shouldForceFinalQuery = false;
            
            if (!query.startsWith('http')) {
                finalQuery = `ytmsearch:${query}`;
                shouldForceFinalQuery = true;
            }
            
            let result = null;
            let resolvedNode = null;
            const searchPromises = orderedNodes.map(async (node) => {
                let res;
                if (shouldForceFinalQuery) {
                    res = await node.rest.resolve(finalQuery);
                } else {
                    res = await node.rest.resolve(query);
                    if (!res || res.loadType === 'empty' || res.loadType === 'error') {
                        if (finalQuery !== query) {
                            res = await node.rest.resolve(finalQuery);
                        }
                    }
                }
                if (res && res.loadType !== 'empty' && res.loadType !== 'error') {
                    return { result: res, node };
                }
                throw new Error('Not found or error');
            });

            try {
                const fastest = await Promise.any(searchPromises);
                result = fastest.result;
                resolvedNode = fastest.node;
            } catch (e) {
                console.log(`[Lavalink Error] All nodes failed to resolve query.`);
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
                artist: trackToPlay.info.author || '',
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
    handleLoadFailed: handleLoadFailed,
    getQueue: getQueue,
    ensureVoiceConnection: ensureVoiceConnection,
    setupPlayerListeners: setupPlayerListeners,
    safePlayTrack: safePlayTrack
};
