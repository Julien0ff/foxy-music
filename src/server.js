const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { getGuildConfig, updateGuildConfig } = require('./utils/db');
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

    // Update server configuration from dashboard
    app.post('/api/guilds/:id/config', (req, res) => {
        const guildId = req.params.id;
        const updates = req.body;
        
        // Only allow safe fields to be updated
        const allowedFields = ['twentyFourSeven', 'djRoleId', 'defaultVolume', 'autoplay'];
        const safeUpdates = {};
        for (const key of allowedFields) {
            if (updates[key] !== undefined) {
                safeUpdates[key] = updates[key];
            }
        }
        
        const config = updateGuildConfig(guildId, safeUpdates);
        
        // Apply autoplay to active queue if present
        if (safeUpdates.autoplay !== undefined && global.queues && global.queues.has(guildId)) {
            global.queues.get(guildId).autoplay = safeUpdates.autoplay;
        }
        
        res.json({ success: true, config });
    });

    // Get available roles for DJ selector
    app.get('/api/guilds/:id/roles', (req, res) => {
        const guild = client.guilds.cache.get(req.params.id);
        if (!guild) return res.status(404).json({ error: 'Guild not found' });
        
        const roles = guild.roles.cache
            .filter(r => r.id !== guild.id && !r.managed) // Exclude @everyone and bot-managed roles
            .sort((a, b) => b.position - a.position)
            .map(r => ({
                id: r.id,
                name: r.name,
                color: r.hexColor
            }));
        
        res.json(roles);
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
                position: c.position,
                rawPosition: c.rawPosition,
                parentPosition: c.parent ? c.parent.position : -1,
                parentName: c.parent ? c.parent.name : null,
                members: c.members.map(m => ({
                    id: m.id,
                    name: m.user.globalName || m.user.username,
                    avatar: m.user.displayAvatarURL({ extension: 'png' })
                }))
            };
        });
        
        // Sort channels like Discord: by parent category position, then by channel position within category
        channelsData.sort((a, b) => {
            if (a.parentPosition !== b.parentPosition) return a.parentPosition - b.parentPosition;
            return a.position - b.position;
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
                // Check if there's already a Shoukaku player for this guild (e.g. from a slash command)
                let player = client.shoukaku.players.get(guildId);
                if (!player) {
                    player = await client.shoukaku.joinVoiceChannel({
                        guildId: guildId,
                        channelId: channelId,
                        shardId: 0,
                        deaf: true
                    });
                }
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
                return PlaylistParser.getSpotifyTrackName(url);
            };
            const getAppleMusicTrackName = async (url) => {
                try { const res = await fetch(`https://music.apple.com/oembed?url=${encodeURIComponent(url)}`); if (res.ok) return (await res.json()).title; const match = url.match(/\/album\/([^/]+)/); return match ? match[1].replace(/-/g, ' ') : null; } catch { return null; }
            };
            const getDeezerTrackName = async (url) => {
                try { const res = await fetch(`https://deezer.com/oembed?url=${encodeURIComponent(url)}`); return res.ok ? (await res.json()).title : null; } catch { return null; }
            };
            const getYouTubeVideoTitle = async (url) => {
                try {
                    const res = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.title) return data.title;
                    }
                } catch (err) {
                    console.warn('[Web YouTube Title] Official oembed failed:', err.message);
                }
                try {
                    const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.title) return data.title;
                    }
                } catch (err) {
                    console.warn('[Web YouTube Title] Noembed fallback failed:', err.message);
                }
                return null;
            };

            let finalQuery = query;
            let shouldForceFinalQuery = false;
            
            if (query.includes('open.spotify.com') || query.includes('spotify.link')) {
                const title = await getSpotifyTrackName(query);
                if (title) {
                    finalQuery = `scsearch:${title}`;
                    shouldForceFinalQuery = true;
                }
            } else if (query.includes('music.apple.com')) {
                const title = await getAppleMusicTrackName(query);
                if (title) {
                    finalQuery = `scsearch:${title}`;
                    shouldForceFinalQuery = true;
                }
            } else if (query.includes('deezer.com') || query.includes('deezer.page.link')) {
                const title = await getDeezerTrackName(query);
                if (title) {
                    finalQuery = `scsearch:${title}`;
                    shouldForceFinalQuery = true;
                }
            } else if ((query.includes('youtube.com/watch') || query.includes('youtu.be/')) && !query.includes('playlist')) {
                const title = await getYouTubeVideoTitle(query);
                if (title) {
                    finalQuery = `scsearch:${title}`;
                    shouldForceFinalQuery = true;
                }
            } else if (!query.includes('youtube.com/watch') && !query.includes('youtu.be/') && !query.includes('soundcloud.com/') && !query.startsWith('http')) {
                finalQuery = `scsearch:${query}`;
                shouldForceFinalQuery = true;
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
                    if (shouldForceFinalQuery) {
                        result = await node.rest.resolve(finalQuery);
                    } else {
                        let tempResult = await node.rest.resolve(query);
                        if (!tempResult || tempResult.loadType === 'empty' || tempResult.loadType === 'error') {
                            if (finalQuery !== query) {
                                tempResult = await node.rest.resolve(finalQuery);
                            }
                        }
                        result = tempResult;
                    }
                    if (result && result.loadType !== 'empty' && result.loadType !== 'error') {
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

            // Redirect YouTube resolved tracks to SoundCloud to bypass geo-blocks/captchas
            if (track.info.uri && (track.info.uri.includes('youtube.com') || track.info.uri.includes('youtu.be'))) {
                console.log(`[Web Player] Intercepted YouTube track "${track.info.title}". Redirecting search to SoundCloud...`);
                const scSearchQuery = `scsearch:${track.info.title}`;
                let scResult = null;
                for (const node of orderedNodes) {
                    try {
                        scResult = await node.rest.resolve(scSearchQuery);
                        if (scResult && scResult.loadType === 'search' && scResult.data && scResult.data.length > 0) {
                            track = scResult.data[0];
                            resolvedNode = node;
                            console.log(`[Web Player] Successfully redirected YouTube track to SoundCloud: "${track.info.title}"`);
                            break;
                        }
                    } catch (err) {
                        console.log(`[Web Player] Node ${node.name} failed resolving redirected SoundCloud track:`, err.message);
                    }
                }
            }

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
                                player = await client.shoukaku.joinVoiceChannel({
                                    guildId: guildId,
                                    channelId: targetChannel.id,
                                    shardId: 0,
                                    deaf: true
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

    app.post('/api/guilds/:id/queue/remove', (req, res) => {
        const guildId = req.params.id;
        const { index } = req.body;
        const queue = global.queues ? global.queues.get(guildId) : null;
        if (!queue || index === undefined || index < 0 || index >= queue.tracks.length) {
            return res.status(400).json({ error: 'Index invalide ou file d\'attente introuvable' });
        }
        const removed = queue.tracks.splice(index, 1)[0];
        
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
        updatePanel(client, guildId);
        return res.json({ success: true, removed });
    });

    app.post('/api/guilds/:id/queue/clear', (req, res) => {
        const guildId = req.params.id;
        const queue = global.queues ? global.queues.get(guildId) : null;
        if (!queue) return res.status(400).json({ error: 'File d\'attente active introuvable' });
        
        queue.tracks = [];
        
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
        updatePanel(client, guildId);
        return res.json({ success: true });
    });

    app.post('/api/guilds/:id/queue/shuffle', (req, res) => {
        const guildId = req.params.id;
        const queue = global.queues ? global.queues.get(guildId) : null;
        if (!queue || queue.tracks.length === 0) {
            return res.status(400).json({ error: 'La file d\'attente est vide' });
        }
        
        // Fisher-Yates Shuffle
        for (let i = queue.tracks.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [queue.tracks[i], queue.tracks[j]] = [queue.tracks[j], queue.tracks[i]];
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
        updatePanel(client, guildId);
        return res.json({ success: true });
    });

    app.post('/api/guilds/:id/filter', async (req, res) => {
        const guildId = req.params.id;
        const queue = global.queues ? global.queues.get(guildId) : null;
        if (!queue || !queue.player) {
            return res.status(400).json({ error: 'Aucune musique en cours' });
        }

        const { filter } = req.body; // 'bassboost', 'nightcore', 'vaporwave', '8d', 'karaoke', 'clear'
        
        try {
            if (filter === 'clear') {
                await queue.player.clearFilters();
            } else if (filter === 'bassboost') {
                await queue.player.setFilters({
                    equalizer: [
                        { band: 0, gain: 0.65 }, { band: 1, gain: 0.45 }, { band: 2, gain: -0.45 },
                        { band: 3, gain: -0.65 }, { band: 4, gain: -0.35 }, { band: 5, gain: 0.45 },
                        { band: 6, gain: 0.55 }, { band: 7, gain: 0.6 }, { band: 8, gain: 0.6 },
                        { band: 9, gain: 0.6 }
                    ]
                });
            } else if (filter === 'nightcore') {
                await queue.player.setFilters({ timescale: { speed: 1.2, pitch: 1.2, rate: 1.0 } });
            } else if (filter === 'vaporwave') {
                await queue.player.setFilters({
                    timescale: { speed: 0.8, pitch: 0.8, rate: 1.0 },
                    tremolo: { depth: 0.3, frequency: 14.0 }
                });
            } else if (filter === '8d') {
                await queue.player.setFilters({ rotation: { rotationHz: 0.2 } });
            } else if (filter === 'karaoke') {
                await queue.player.setFilters({ karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 } });
            }
            return res.json({ success: true });
        } catch (err) {
            console.error(err);
            return res.status(500).json({ error: 'Erreur filtre' });
        }
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
        const { url, channelId } = req.body;
        if (!url) return res.status(400).json({ error: 'Missing playlist URL' });

        // Emit progress events via socket
        const emitProgress = (data) => {
            if (global.io) {
                global.io.to(`queue_${guildId}`).emit('import_progress', data);
            }
        };

        try {
            emitProgress({ status: 'parsing', message: 'Analyse de la playlist...' });

            emitProgress({ status: 'parsing', message: 'Analyse de la playlist via Lavalink...' });

            const node = client.shoukaku.nodes.values().next().value;
            if (!node) throw new Error('Aucun nœud Lavalink disponible.');
            
            const lavalinkResult = await node.rest.resolve(url);
            if (!lavalinkResult || lavalinkResult.loadType === 'empty' || lavalinkResult.loadType === 'error') {
                throw new Error('Impossible de charger cette playlist. As-tu bien installé le plugin LavaSrc sur ton Lavalink ?');
            }
            
            const tracks = (lavalinkResult.data?.tracks || lavalinkResult.data || []);
            let result = {
                name: lavalinkResult.data?.info?.name || 'Playlist Importée',
                tracks: tracks.map(t => ({
                    title: t.info?.title || 'Unknown',
                    artist: t.info?.author || 'Unknown',
                    duration: t.info?.length || 0,
                    artworkUrl: t.info?.artworkUrl || null,
                    url: t.info?.uri || null,
                    encoded: t.encoded || null,
                    isImported: true // Mark as imported to skip further search
                }))
            };

            if (!result || !result.tracks || result.tracks.length === 0) {
                throw new Error('Aucune piste trouvée dans cette playlist.');
            }

            emitProgress({ status: 'parsed', message: `${result.tracks.length} pistes trouvées`, total: result.tracks.length, name: result.name });

            if (!global.queues) global.queues = new Map();
            let queue = global.queues.get(guildId);
            if (!queue) {
                const { getGuildConfig } = require('./utils/db');
                const config = getGuildConfig(guildId);
                queue = { tracks: [], currentTrack: null, player: null, loop: false, volume: config.defaultVolume || 100, autoplay: config.autoplay || false };
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
                        // Use channelId from request body if provided, otherwise auto-detect
                        let targetChannelId = channelId;
                        if (!targetChannelId) {
                            const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
                            let targetChannel = voiceChannels.find(c => c.members.filter(m => !m.user.bot).size > 0);
                            if (!targetChannel) targetChannel = voiceChannels.first();
                            targetChannelId = targetChannel?.id;
                        }

                        if (targetChannelId) {
                            try {
                                player = await client.shoukaku.joinVoiceChannel({
                                    guildId: guildId,
                                    channelId: targetChannelId,
                                    shardId: 0,
                                    deaf: true
                                });
                                queue.player = player;
                                player.setGlobalVolume(queue.volume);
                                
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
                url: t.url || null,
                encoded: t.encoded || null,
                query: `${t.title} ${t.artist}`,
                artworkUrl: t.artworkUrl,
                duration: t.duration,
                isImported: true
            }));

            queue.tracks.push(...tracksToAdd);

            emitProgress({ status: 'done', message: `${tracksToAdd.length} pistes ajoutées à la file`, total: tracksToAdd.length, name: result.name });
            
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
            emitProgress({ status: 'error', message: e.message || 'Import échoué' });
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
