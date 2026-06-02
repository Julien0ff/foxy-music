const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { getGuildConfig } = require('./utils/db');
const { updatePanel } = require('./utils/panelUpdater');
const { fetchLyrics } = require('./utils/lyrics');
const PlaylistParser = require('./utils/playlistParser');

function startServer(client) {
    const app = express();
    
    // Support SSL directly in Node.js
    const https = require('https');
    const fs = require('fs');
    const path = require('path');
    
    let server;
    const keyPath = path.join(__dirname, '../server.key');
    const certPath = path.join(__dirname, '../server.cert');
    const hasSSL = fs.existsSync(keyPath) && fs.existsSync(certPath);
    
    if (hasSSL) {
        try {
            const privateKey = fs.readFileSync(keyPath, 'utf8');
            const certificate = fs.readFileSync(certPath, 'utf8');
            server = https.createServer({ key: privateKey, cert: certificate }, app);
            console.log('🔒 HTTPS activé avec les certificats locaux.');
        } catch (err) {
            console.error('❌ Échec de la configuration HTTPS, repli sur HTTP:', err);
            server = http.createServer(app);
        }
    } else {
        server = http.createServer(app);
        console.log('🔓 HTTP simple activé (aucun certificat server.key / server.cert trouvé à la racine).');
    }

    const io = new Server(server, {
        cors: {
            origin: '*', // To be restricted to Vercel domain later
            methods: ['GET', 'POST']
        }
    });

    // We make io globally available to emit events from play.js later
    global.io = io;

    app.use(cors());
    app.use(express.json());

    app.get('/', (req, res) => {
        res.send({ status: 'API Online', bot: client.user?.tag });
    });

    // Get current queue for a specific guild
    app.get('/api/bot/info', (req, res) => {
        if (!client.user) return res.status(503).json({ error: 'Bot not ready' });
        const avatarHash = client.user.avatar;
        const avatarUrl = avatarHash 
            ? `https://cdn.discordapp.com/avatars/${client.user.id}/${avatarHash}.png?size=256`
            : `https://cdn.discordapp.com/embed/avatars/0.png`;
        res.json({
            id: client.user.id,
            username: client.user.username,
            avatar: avatarUrl
        });
    });

    app.get('/api/guilds/:id/queue', (req, res) => {
        const guildId = req.params.id;
        const queue = global.queues ? global.queues.get(guildId) : null;
        if (!queue) {
            return res.json({ currentTrack: null, tracks: [], isPlaying: false });
        }
        res.json({
            currentTrack: queue.currentTrack,
            tracks: queue.tracks,
            isPlaying: queue.player && !queue.player.paused,
            position: queue.player ? queue.player.position : 0,
            duration: queue.currentTrack ? queue.currentTrack.duration || 0 : 0,
            volume: queue.volume || 100,
            loop: queue.loop || false
        });
    });

    // Get server configuration
    app.get('/api/guilds/:id/config', (req, res) => {
        const guildId = req.params.id;
        const config = getGuildConfig(guildId);
        res.json(config);
    });

    // --- New API for Multi-session and Voice states ---
    app.post('/api/user/guilds', (req, res) => {
        const userGuilds = req.body.guilds || [];
        const sharedGuilds = userGuilds.filter(g => client.guilds.cache.has(g.id)).map(g => {
            const botGuild = client.guilds.cache.get(g.id);
            return {
                id: g.id,
                name: botGuild.name,
                icon: botGuild.iconURL({ extension: 'png' })
            };
        });
        res.json(sharedGuilds);
    });

    app.get('/api/guilds/:id/voice', (req, res) => {
        const guild = client.guilds.cache.get(req.params.id);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });
        
        const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
        const channelsData = voiceChannels.map(c => {
            return {
                id: c.id,
                name: c.name,
                members: c.members.map(m => ({
                    id: m.id,
                    name: m.user.globalName || m.user.username,
                    avatar: m.user.displayAvatarURL({ extension: 'png' })
                }))
            };
        });
        
        const botVoiceChannel = guild.members.me?.voice?.channelId || null;
        res.json({ channels: channelsData, botVoiceChannel });
    });

    app.post('/api/guilds/:id/connect', async (req, res) => {
        const guildId = req.params.id;
        const { channelId } = req.body;
        
        if (!global.queues) global.queues = new Map();
        let queue = global.queues.get(guildId);
        if (!queue) {
            queue = { tracks: [], currentTrack: null, player: null, loop: false, volume: 100 };
            global.queues.set(guildId, queue);
        }

        try {
            if (!queue.player) {
                try {
                    await client.shoukaku.leaveVoiceChannel(guildId);
                } catch (_) {}

                const player = await client.shoukaku.joinVoiceChannel({
                    guildId: guildId,
                    channelId: channelId,
                    shardId: 0
                });
                queue.player = player;
                
                player.on('start', () => {
                    console.log(`[Player Web API] Now streaming: ${queue.currentTrack?.title || 'Unknown Track'}`);
                    updatePanel(client, guildId);
                });

                player.on('end', (reason) => {
                    console.log(`[Player Web API] Track ended. Reason: ${reason.reason}`);
                    if (reason.reason === 'REPLACED') return;
                    const command = client.commands.get('play');
                    if (command && command.handleLoadFailed && reason.reason === 'loadFailed') {
                        command.handleLoadFailed(guildId, client, queue.currentTrack);
                    } else if (command && command.playNext) {
                        command.playNext(guildId, client);
                    }
                });

                player.on('exception', (exception) => {
                    console.error('[Player Web API Exception]', exception.exception?.message || exception.exception || exception);
                });

                player.on('stuck', (stuck) => {
                    console.warn('[Player Web API Stuck] Threshold exceeded (ms):', stuck.thresholdMs);
                    const command = client.commands.get('play');
                    if (command && command.playNext) command.playNext(guildId, client);
                });
                
                player.on('error', (error) => {
                    console.error('[Player Web API Error]', error);
                    const command = client.commands.get('play');
                    if (command && command.playNext) command.playNext(guildId, client);
                });
            }
            res.json({ success: true });
        } catch (e) {
            console.error('Error connecting:', e);
            res.status(500).json({ error: 'Failed to connect' });
        }
    });

    app.post('/api/guilds/:id/loop', (req, res) => {
        const queue = global.queues ? global.queues.get(req.params.id) : null;
        if (queue) {
            queue.loop = !queue.loop;
            if (global.io) {
                global.io.to(`queue_${req.params.id}`).emit('queue_update', {
                    currentTrack: queue.currentTrack,
                    tracks: queue.tracks,
                    isPlaying: queue.player && !queue.player.paused,
                    position: queue.player ? queue.player.position : 0,
                    duration: queue.currentTrack ? queue.currentTrack.duration || 0 : 0,
                    volume: queue.volume || 100,
                    loop: queue.loop
                });
            }
            return res.json({ success: true, loop: queue.loop });
        }
        res.status(400).json({ error: 'No active player' });
    });

    // --- Web Controls ---
    app.post('/api/guilds/:id/pause', (req, res) => {
        const queue = global.queues ? global.queues.get(req.params.id) : null;
        if (queue && queue.player) {
            queue.player.setPaused(true);
            if (global.io) {
                global.io.to(`queue_${req.params.id}`).emit('queue_update', {
                    currentTrack: queue.currentTrack,
                    tracks: queue.tracks,
                    isPlaying: false,
                    position: queue.player.position,
                    duration: queue.currentTrack ? queue.currentTrack.duration || 0 : 0,
                    volume: queue.volume || 100,
                    loop: queue.loop || false
                });
            }
            return res.json({ success: true, isPlaying: false });
        }
        res.status(400).json({ error: 'No active player' });
    });

    app.post('/api/guilds/:id/resume', (req, res) => {
        const queue = global.queues ? global.queues.get(req.params.id) : null;
        if (queue && queue.player) {
            queue.player.setPaused(false);
            if (global.io) {
                global.io.to(`queue_${req.params.id}`).emit('queue_update', {
                    currentTrack: queue.currentTrack,
                    tracks: queue.tracks,
                    isPlaying: true,
                    position: queue.player.position,
                    duration: queue.currentTrack ? queue.currentTrack.duration || 0 : 0,
                    volume: queue.volume || 100,
                    loop: queue.loop || false
                });
            }
            return res.json({ success: true, isPlaying: true });
        }
        res.status(400).json({ error: 'No active player' });
    });

    app.post('/api/guilds/:id/skip', (req, res) => {
        const queue = global.queues ? global.queues.get(req.params.id) : null;
        if (queue && queue.player) {
            // Stopping the player triggers the Idle event, which naturally calls playNext
            queue.player.stopTrack();
            return res.json({ success: true });
        }
        res.status(400).json({ error: 'No active player' });
    });

    app.post('/api/guilds/:id/play', async (req, res) => {
        const guildId = req.params.id;
        const { query } = req.body;
        if (!query) return res.status(400).json({ error: 'Missing query' });

        const nodes = Array.from(client.shoukaku.nodes.values());
        if (nodes.length === 0) return res.status(500).json({ error: 'No Lavalink node available' });

        try {
            // Helpers
            const getSpotifyTrackName = async (url) => {
                try { const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`); return res.ok ? (await res.json()).title : null; } catch { return null; }
            };
            const getAppleMusicTrackName = async (url) => {
                try { const res = await fetch(`https://music.apple.com/oembed?url=${encodeURIComponent(url)}`); if (res.ok) return (await res.json()).title; const match = url.match(/\/album\/([^/]+)/); return match ? match[1].replace(/-/g, ' ') : null; } catch { return null; }
            };
            const getDeezerTrackName = async (url) => {
                try { const res = await fetch(`https://deezer.com/oembed?url=${encodeURIComponent(url)}`); return res.ok ? (await res.json()).title : null; } catch { return null; }
            };

            let finalQuery = query;
            if (query.includes('open.spotify.com') || query.includes('spotify.link')) {
                const title = await getSpotifyTrackName(query);
                if (title) finalQuery = `scsearch:${title}`;
            } else if (query.includes('music.apple.com')) {
                const title = await getAppleMusicTrackName(query);
                if (title) finalQuery = `scsearch:${title}`;
            } else if (query.includes('deezer.com') || query.includes('deezer.page.link')) {
                const title = await getDeezerTrackName(query);
                if (title) finalQuery = `scsearch:${title}`;
            } else if (!query.includes('youtube.com/watch') && !query.includes('youtu.be/') && !query.includes('soundcloud.com/') && !query.startsWith('http')) {
                finalQuery = `scsearch:${query}`;
            }

            // Prioritize the player's own node to avoid track decode mismatches
            let queue = global.queues ? global.queues.get(guildId) : null;
            const playerNode = queue?.player?.node;
            
            // Order nodes: player's node first, then others as fallback
            const orderedNodes = playerNode 
                ? [playerNode, ...nodes.filter(n => n.name !== playerNode.name)]
                : nodes;

            let result = null;
            let resolvedNode = null;
            for (const node of orderedNodes) {
                try {
                    let tempResult = await node.rest.resolve(query);
                    if (!tempResult || tempResult.loadType === 'empty' || tempResult.loadType === 'error') {
                        if (finalQuery !== query) {
                            tempResult = await node.rest.resolve(finalQuery);
                        }
                    }
                    if (tempResult && tempResult.loadType !== 'empty' && tempResult.loadType !== 'error') {
                        result = tempResult;
                        resolvedNode = node;
                        break;
                    }
                } catch (e) {
                    console.log(`[Web Play Error] Node ${node.name} failed:`, e.message);
                }
            }

            if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                return res.status(404).json({ error: 'No results found' });
            }

            let track;
            if (result.loadType === 'playlist') track = result.data.tracks[0];
            else if (result.loadType === 'track') track = result.data;
            else if (result.loadType === 'search') track = result.data[0];

            if (!track) return res.status(404).json({ error: 'No tracks in result' });

            // Normalize track object
            const trackObj = {
                title: track.info.title,
                url: track.info.uri,
                encoded: track.encoded,
                duration: track.info.length,
                artworkUrl: track.info.artworkUrl || null,
                nodeName: resolvedNode?.name
            };

            // Add to queue
            if (!global.queues) global.queues = new Map();
            queue = global.queues.get(guildId);
            
            if (!queue) {
                queue = { tracks: [], currentTrack: null, player: null, loop: false, volume: 100 };
                global.queues.set(guildId, queue);
            }

            if (!queue.player) {
                let player = client.shoukaku.players.get(guildId);
                if (player) {
                    queue.player = player;
                } else {
                    // Try to find a voice channel to connect to automatically
                    const guild = client.guilds.cache.get(guildId);
                    if (guild) {
                        const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
                        // Find a channel with members first
                        let targetChannel = voiceChannels.find(c => c.members.filter(m => !m.user.bot).size > 0);
                        if (!targetChannel) {
                            // Fallback to the first voice channel
                            targetChannel = voiceChannels.first();
                        }

                        if (targetChannel) {
                            try {
                                try {
                                    await client.shoukaku.leaveVoiceChannel(guildId);
                                } catch (_) {}

                                player = await client.shoukaku.joinVoiceChannel({
                                    guildId: guildId,
                                    channelId: targetChannel.id,
                                    shardId: 0
                                });
                                queue.player = player;
                                
                                player.on('start', () => {
                                    console.log(`[Player Web API Auto] Now streaming: ${queue.currentTrack?.title || 'Unknown Track'}`);
                                    updatePanel(client, guildId);
                                });

                                player.on('end', (reason) => {
                                    console.log(`[Player Web API Auto] Track ended. Reason: ${reason.reason}`);
                                    if (reason.reason === 'REPLACED') return;
                                    const command = client.commands.get('play');
                                    if (command && command.handleLoadFailed && reason.reason === 'loadFailed') {
                                        command.handleLoadFailed(guildId, client, queue.currentTrack);
                                    } else if (command && command.playNext) {
                                        command.playNext(guildId, client);
                                    }
                                });

                                player.on('exception', (exception) => {
                                    console.error('[Player Web API Auto Exception]', exception.exception?.message || exception.exception || exception);
                                });

                                player.on('stuck', (stuck) => {
                                    console.warn('[Player Web API Auto Stuck] Threshold exceeded (ms):', stuck.thresholdMs);
                                    const command = client.commands.get('play');
                                    if (command && command.playNext) command.playNext(guildId, client);
                                });
                                
                                player.on('error', (error) => {
                                    console.error('[Player Web API Auto Error]', error);
                                    const command = client.commands.get('play');
                                    if (command && command.playNext) command.playNext(guildId, client);
                                });
                            } catch (err) {
                                console.error('Failed to auto-connect voice channel:', err);
                            }
                        }
                    }
                }
            }

            if (!queue.player) {
                return res.status(400).json({ error: 'Le bot doit d\'abord être connecté à un salon vocal.' });
            }

            queue.tracks.push(trackObj);

            // If not playing, play next immediately
            if (!queue.currentTrack) {
                const trackToPlay = queue.tracks.shift();
                queue.currentTrack = trackToPlay;

                try {
                    if (queue.player) {
                        if (trackToPlay.encoded) {
                            try {
                                await queue.player.playTrack({ track: { encoded: trackToPlay.encoded } });
                            } catch (encodedErr) {
                                console.warn(`[Player] Web Play failed encoded, falling back to identifier: ${encodedErr.message}`);
                                await queue.player.playTrack({ track: { identifier: trackToPlay.url } });
                            }
                        } else {
                            await queue.player.playTrack({ track: { identifier: trackToPlay.url } });
                        }
                    }
                } catch (e) {
                    console.error('Web Play Error:', e);
                }
            }
            
            if (global.io) {
                global.io.to(`queue_${guildId}`).emit('queue_update', {
                    currentTrack: queue.currentTrack,
                    tracks: queue.tracks,
                    isPlaying: queue.player && !queue.player.paused,
                    position: queue.player ? queue.player.position : 0,
                    duration: queue.currentTrack ? queue.currentTrack.duration || 0 : 0,
                    volume: queue.volume || 100,
                    loop: queue.loop || false
                });
            }

            return res.json({ success: true, track: trackObj });
        } catch (e) {
            console.error('Lavalink search error:', e);
            return res.status(500).json({ error: 'Search failed' });
        }
    });

    app.post('/api/guilds/:id/volume', (req, res) => {
        const queue = global.queues ? global.queues.get(req.params.id) : null;
        const volume = req.body.volume;
        if (queue && queue.player && volume !== undefined) {
            queue.volume = Math.max(10, Math.min(200, volume));
            queue.player.setGlobalVolume(queue.volume);
            
            if (global.io) {
                global.io.to(`queue_${req.params.id}`).emit('queue_update', {
                    currentTrack: queue.currentTrack,
                    tracks: queue.tracks,
                    isPlaying: !queue.player.paused,
                    position: queue.player.position,
                    duration: queue.currentTrack ? queue.currentTrack.duration || 0 : 0,
                    volume: queue.volume,
                    loop: queue.loop || false
                });
            }
            return res.json({ success: true, volume: queue.volume });
        }
        res.status(400).json({ error: 'No active player or invalid volume' });
    });

    // --- Lyrics ---
    app.get('/api/guilds/:id/lyrics', async (req, res) => {
        const guildId = req.params.id;
        const queue = global.queues ? global.queues.get(guildId) : null;
        if (!queue || !queue.currentTrack) {
            return res.status(404).json({ error: 'No track playing' });
        }
        const lyrics = await fetchLyrics(queue.currentTrack.title);
        if (!lyrics) {
            return res.status(404).json({ error: 'Lyrics not found' });
        }
        return res.json(lyrics);
    });

    // --- Seek ---
    app.post('/api/guilds/:id/seek', async (req, res) => {
        const queue = global.queues ? global.queues.get(req.params.id) : null;
        const position = parseInt(req.body.position);
        if (!queue || !queue.player || isNaN(position)) {
            return res.status(400).json({ error: 'No active player or invalid position' });
        }
        try {
            await queue.player.seekTo(position);
            return res.json({ success: true, position });
        } catch (e) {
            console.error('[Seek Error]', e);
            return res.status(500).json({ error: 'Seek failed' });
        }
    });

    // --- Playlist Import ---
    app.post('/api/guilds/:id/playlist-import', async (req, res) => {
        const guildId = req.params.id;
        const { url } = req.body;
        if (!url) return res.status(400).json({ error: 'Missing playlist URL' });

        try {
            const result = await PlaylistParser.parse(url);
            
            if (!global.queues) global.queues = new Map();
            let queue = global.queues.get(guildId);
            if (!queue) {
                queue = { tracks: [], currentTrack: null, player: null, loop: false, volume: 100 };
                global.queues.set(guildId, queue);
            }

            // Ensure player is connected
            if (!queue.player) {
                let player = client.shoukaku.players.get(guildId);
                if (player) {
                    queue.player = player;
                } else {
                    const guild = client.guilds.cache.get(guildId);
                    if (guild) {
                        const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
                        let targetChannel = voiceChannels.find(c => c.members.filter(m => !m.user.bot).size > 0);
                        if (!targetChannel) targetChannel = voiceChannels.first();

                        if (targetChannel) {
                            try {
                                try { await client.shoukaku.leaveVoiceChannel(guildId); } catch (_) {}
                                player = await client.shoukaku.joinVoiceChannel({
                                    guildId: guildId,
                                    channelId: targetChannel.id,
                                    shardId: 0
                                });
                                queue.player = player;
                                
                                player.on('start', () => {
                                    console.log(`[Player Web API Import] Now streaming: ${queue.currentTrack?.title || 'Unknown Track'}`);
                                    updatePanel(client, guildId);
                                });
                                player.on('end', (reason) => {
                                    console.log(`[Player Web API Import] Track ended. Reason: ${reason.reason}`);
                                    if (reason.reason === 'REPLACED') return;
                                    const command = client.commands.get('play');
                                    if (command && command.handleLoadFailed && reason.reason === 'loadFailed') {
                                        command.handleLoadFailed(guildId, client, queue.currentTrack);
                                    } else if (command && command.playNext) {
                                        command.playNext(guildId, client);
                                    }
                                });
                                player.on('exception', (exception) => {
                                    console.error('[Player Web API Import Exception]', exception.exception?.message || exception.exception || exception);
                                });
                                player.on('stuck', (stuck) => {
                                    console.warn('[Player Web API Import Stuck] Threshold exceeded (ms):', stuck.thresholdMs);
                                    const command = client.commands.get('play');
                                    if (command && command.playNext) command.playNext(guildId, client);
                                });
                                player.on('error', (err) => {
                                    console.error('[Player Web API Import Error]', err);
                                    const command = client.commands.get('play');
                                    if (command && command.playNext) command.playNext(guildId, client);
                                });
                            } catch (err) {
                                console.error('Failed to auto-connect voice channel:', err);
                            }
                        }
                    }
                }
            }

            if (!queue.player) {
                return res.status(400).json({ error: 'Le bot doit d\'abord être connecté à un salon vocal.' });
            }

            const isAlreadyPlaying = !!queue.currentTrack;
            
            // Map imported playlist tracks to queue items
            const tracksToAdd = result.tracks.map(t => ({
                title: t.title,
                artist: t.artist,
                url: null, // Background pre-resolve
                query: `${t.title} ${t.artist}`,
                artworkUrl: t.artworkUrl,
                duration: t.duration,
                isImported: true
            }));

            queue.tracks.push(...tracksToAdd);

            res.json({ success: true, name: result.name, count: tracksToAdd.length });

            // Start playing immediately if nothing is currently playing
            if (!isAlreadyPlaying) {
                const command = client.commands.get('play');
                if (command && command.playNext) {
                    await command.playNext(guildId, client);
                }
            } else {
                updatePanel(client, guildId);
            }

        } catch (e) {
            console.error('[Playlist Import Error]', e);
            return res.status(500).json({ error: e.message || 'Playlist import failed' });
        }
    });

    io.on('connection', (socket) => {
        console.log('[Web] Nouveau client connecté:', socket.id);
        
        // Client joins a room for a specific server to get real-time queue updates
        socket.on('subscribe_queue', (guildId) => {
            socket.join(`queue_${guildId}`);
            console.log(`[Web] Client ${socket.id} abonné à queue_${guildId}`);
        });

        socket.on('disconnect', () => {
            console.log('[Web] Client déconnecté:', socket.id);
        });
    });

    const PORT = process.env.PORT || process.env.SERVER_PORT || 3001;
    server.listen(PORT, () => {
        console.log(`🚀 Serveur Web (API/Sockets) démarré sur le port ${PORT}`);
    }).on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`⚠️ [WARNING] Le port ${PORT} est déjà utilisé par un processus fantôme sur l'hébergeur.`);
            console.warn(`Le bot Discord va quand même démarrer, mais l'API et le dashboard web seront inactifs tant que l'ancien processus n'est pas éteint.`);
        } else {
            console.error('❌ Erreur du serveur web:', err);
        }
    });

    return { app, server, io };
}

module.exports = { startServer };
