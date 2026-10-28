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
    app.use(express.json({ limit: '10mb' }));

    // Configuration for file uploads (play-file) with graceful zero-dependency fallback
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
    }

    let multerUpload = null;
    try {
        const multer = require('multer');
        const storage = multer.diskStorage({
            destination: function (req, file, cb) {
                cb(null, uploadsDir);
            },
            filename: function (req, file, cb) {
                const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
                const ext = path.extname(file.originalname);
                cb(null, `${uniqueSuffix}${ext}`);
            }
        });

        const multerInstance = multer({
            storage: storage,
            limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
            fileFilter: (req, file, cb) => {
                const supported = ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.oga', '.aac', '.opus', '.webm', '.wma'];
                const ext = path.extname(file.originalname || '').toLowerCase();
                if (supported.includes(ext) || (file.mimetype && file.mimetype.startsWith('audio/'))) {
                    cb(null, true);
                } else {
                    cb(new Error('Format de fichier non supporté. Seuls les fichiers audio sont acceptés (.mp3, .m4a, .wav, .flac, .ogg, .aac).'));
                }
            }
        });
        multerUpload = multerInstance.single('file');
        console.log('📦 Module Multer chargé avec succès pour les uploads audio.');
    } catch (_) {
        console.warn('ℹ️ Module "multer" non installé sur l\'hébergeur. Utilisation du parseur audio natif Node.js.');
    }

    // Pure Node.js multipart fallback parser (zero external dependency)
    function nativeMultipartUpload(req, res, next) {
        const contentType = req.headers['content-type'] || '';
        if (!contentType.includes('multipart/form-data')) {
            return next();
        }

        const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
        if (!boundaryMatch) {
            return res.status(400).json({ error: 'Boundary multipart manquant.' });
        }
        const boundary = (boundaryMatch[1] || boundaryMatch[2]).trim();

        const chunks = [];
        let totalSize = 0;
        const maxSize = 50 * 1024 * 1024; // 50MB

        req.on('data', chunk => {
            totalSize += chunk.length;
            if (totalSize > maxSize) {
                req.destroy(new Error('Fichier trop volumineux (max 50 Mo)'));
            } else {
                chunks.push(chunk);
            }
        });

        req.on('error', err => {
            if (!res.headersSent) res.status(400).json({ error: err.message });
        });

        req.on('end', () => {
            try {
                const body = Buffer.concat(chunks);
                const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'));
                if (headerEnd === -1) {
                    return res.status(400).json({ error: 'Format multipart invalide.' });
                }

                const headerStr = body.slice(0, headerEnd).toString('utf8');
                const filenameMatch = headerStr.match(/filename="([^"]+)"/i);
                if (!filenameMatch) {
                    return res.status(400).json({ error: 'Aucun fichier détecté dans la requête.' });
                }

                const originalname = filenameMatch[1];
                const mimeMatch = headerStr.match(/Content-Type:\s*([^\r\n]+)/i);
                const mimetype = mimeMatch ? mimeMatch[1].trim() : 'audio/mpeg';

                const supportedExts = ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.oga', '.aac', '.opus', '.webm', '.wma'];
                const ext = path.extname(originalname).toLowerCase();
                if (!supportedExts.includes(ext) && !mimetype.startsWith('audio/')) {
                    return res.status(400).json({ error: 'Format de fichier non supporté. Seuls les fichiers audio sont acceptés.' });
                }

                const dataStart = headerEnd + 4;
                const closingBoundary = Buffer.from(`\r\n--${boundary}`);
                const dataEnd = body.indexOf(closingBoundary, dataStart);
                if (dataEnd === -1) {
                    return res.status(400).json({ error: 'Fin de fichier non trouvée.' });
                }

                const fileData = body.slice(dataStart, dataEnd);
                const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
                const filePath = path.join(uploadsDir, uniqueFilename);

                fs.writeFileSync(filePath, fileData);

                req.file = {
                    fieldname: 'file',
                    originalname: originalname,
                    filename: uniqueFilename,
                    path: filePath,
                    size: fileData.length,
                    mimetype: mimetype
                };

                next();
            } catch (err) {
                console.error('[Native Upload Parse Error]', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Erreur lors de la lecture du fichier: ' + err.message });
                }
            }
        });
    }

    const uploadFileMiddleware = (req, res, next) => {
        if (multerUpload) {
            multerUpload(req, res, (err) => {
                if (err) {
                    console.error('[Multer Error]', err.message);
                    return res.status(400).json({ error: err.message || 'Erreur lors de l\'upload du fichier' });
                }
                next();
            });
        } else {
            nativeMultipartUpload(req, res, next);
        }
    };

    app.use('/uploads', express.static(uploadsDir));

    // Helper: récupérer un node Lavalink connecté (en ligne)
    function getIdealNode(clientInstance) {
        if (!clientInstance?.shoukaku?.nodes) return null;
        const onlineNodes = Array.from(clientInstance.shoukaku.nodes.values()).filter(n => n.state === 1);
        if (onlineNodes.length === 0) return null;
        if (typeof clientInstance.shoukaku.options?.nodeResolver === 'function') {
            try {
                const resolved = clientInstance.shoukaku.options.nodeResolver(clientInstance.shoukaku.nodes);
                if (resolved && resolved.state === 1) return resolved;
            } catch (_) {}
        }
        return onlineNodes[0];
    }

    // Helper: configurer les écouteurs sur le player Shoukaku
    function setupPlayerListeners(playerInstance, queueInstance, gId, clientInstance) {
        playerInstance.removeAllListeners();

        playerInstance.on('start', () => {
            console.log(`[Player Web API] Now streaming: ${queueInstance.currentTrack?.title || 'Unknown Track'}`);
            updatePanel(clientInstance, gId);
        });

        playerInstance.on('end', (reason) => {
            console.log(`[Player Web API] Track ended. Reason: ${reason.reason}`);
            if (reason.reason === 'REPLACED') return;
            const command = clientInstance.commands.get('play');
            if (command && command.handleLoadFailed && reason.reason === 'loadFailed') {
                command.handleLoadFailed(gId, clientInstance, queueInstance.currentTrack);
            } else if (command && command.playNext) {
                command.playNext(gId, clientInstance);
            }
        });

        playerInstance.on('exception', (exception) => {
            console.error('[Player Web API Exception]', exception.exception?.message || exception.exception || exception);
            const command = clientInstance.commands.get('play');
            if (command && command.handleLoadFailed && queueInstance.currentTrack && !queueInstance.currentTrack.isFallback) {
                console.log(`[Player Web API Fallback] Déclenchement automatique du fallback SoundCloud suite à une exception audio...`);
                command.handleLoadFailed(gId, clientInstance, queueInstance.currentTrack);
            }
        });

        playerInstance.on('stuck', (stuck) => {
            console.warn('[Player Web API Stuck] Threshold exceeded (ms):', stuck.thresholdMs);
            const command = clientInstance.commands.get('play');
            if (command && command.playNext) command.playNext(gId, clientInstance);
        });

        playerInstance.on('error', (error) => {
            console.error('[Player Web API Error]', error);
            const command = clientInstance.commands.get('play');
            if (command && command.playNext) command.playNext(gId, clientInstance);
        });

        playerInstance.on('update', (packet) => {
            const rawPos = (packet?.state && typeof packet.state.position === 'number')
                ? packet.state.position
                : (typeof playerInstance.position === 'number' ? playerInstance.position : 0);
            if (global.io) {
                global.io.to(`queue_${gId}`).emit('player_position', {
                    position: rawPos,
                    isPlaying: !playerInstance.paused,
                    timestamp: Date.now()
                });
            }
        });

        playerInstance.on('closed', (reason) => {
            console.warn(`[Player Web API Closed] ${reason?.reason || 'Connection closed'}`);
            if (queueInstance.player === playerInstance) queueInstance.player = null;
        });
    }

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

        if (!channelId) {
            return res.status(400).json({ error: 'Identifiant du salon vocal manquant.' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Serveur Discord non trouvé.' });
        }

        const channel = guild.channels.cache.get(channelId);
        if (!channel || !channel.isVoiceBased()) {
            return res.status(400).json({ error: 'Salon vocal invalide ou introuvable.' });
        }

        // Vérifier si au moins un serveur Lavalink est en ligne
        const onlineNodes = Array.from(client.shoukaku?.nodes?.values() || []).filter(n => n.state === 1);
        if (onlineNodes.length === 0) {
            console.error(`[API /connect] Impossible de se connecter : aucun serveur Lavalink n'est connecté.`);
            return res.status(503).json({ error: 'Aucun serveur Lavalink n\'est en ligne pour le moment. Veuillez patienter ou vérifier la configuration.' });
        }

        if (!global.queues) global.queues = new Map();
        let queue = global.queues.get(guildId);
        if (!queue) {
            queue = { tracks: [], currentTrack: null, player: null, loop: false, volume: 100 };
            global.queues.set(guildId, queue);
        }

        try {
            let player = queue.player || client.shoukaku.players.get(guildId);

            // Si le bot est déjà connecté dans ce salon exact
            if (player && player.channelId === channelId) {
                queue.player = player;
                return res.json({ success: true, alreadyConnected: true });
            }

            // Déconnexion propre si on change de salon
            if (player && player.channelId !== channelId) {
                try {
                    await client.shoukaku.leaveVoiceChannel(guildId).catch(() => {});
                } catch (_) {}
            }

            player = await client.shoukaku.joinVoiceChannel({
                guildId: guildId,
                channelId: channelId,
                shardId: 0,
                deaf: true
            });
            queue.player = player;
            setupPlayerListeners(player, queue, guildId, client);

            res.json({ success: true, channelId });
        } catch (e) {
            console.error(`[API /connect] Erreur lors de la connexion au salon vocal ${channelId} (${guildId}):`, e);
            res.status(500).json({ error: e.message || 'Échec de la connexion au salon vocal' });
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
    app.post('/api/guilds/:id/pause', async (req, res) => {
        const queue = global.queues ? global.queues.get(req.params.id) : null;
        if (queue && queue.player) {
            try {
                await queue.player.setPaused(true);
            } catch (err) {
                console.error('[Pause Error]', err);
            }
            queue.player.paused = true;
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
                global.io.to(`queue_${req.params.id}`).emit('player_position', {
                    position: queue.player.position,
                    isPlaying: false,
                    timestamp: Date.now()
                });
            }
            return res.json({ success: true, isPlaying: false });
        }
        res.status(400).json({ error: 'No active player' });
    });

    app.post('/api/guilds/:id/resume', async (req, res) => {
        const queue = global.queues ? global.queues.get(req.params.id) : null;
        if (queue && queue.player) {
            try {
                await queue.player.setPaused(false);
            } catch (err) {
                console.error('[Resume Error]', err);
            }
            queue.player.paused = false;
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
                global.io.to(`queue_${req.params.id}`).emit('player_position', {
                    position: queue.player.position,
                    isPlaying: true,
                    timestamp: Date.now()
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

        const nodes = Array.from(client.shoukaku?.nodes?.values() || []).filter(n => n.state === 1);
        if (nodes.length === 0) return res.status(503).json({ error: 'Aucun serveur Lavalink disponible pour le moment' });

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

            if (!query.startsWith('http')) {
                finalQuery = `ytmsearch:${query}`;
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

            // Native Lavalink track resolution used instead of YouTube -> SoundCloud redirect hack.

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
                                setupPlayerListeners(player, queue, guildId, client);
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

    app.post('/api/guilds/:id/play-file', uploadFileMiddleware, async (req, res) => {
        const guildId = req.params.id;
        if (!req.file) {
            return res.status(400).json({ error: 'Aucun fichier fourni' });
        }

        const nodes = Array.from(client.shoukaku?.nodes?.values() || []).filter(n => n.state === 1);
        if (nodes.length === 0) {
            return res.status(503).json({ error: 'Aucun serveur Lavalink disponible pour le moment' });
        }

        const guild = client.guilds.cache.get(guildId);
        if (!guild) {
            return res.status(404).json({ error: 'Serveur Discord non trouvé' });
        }

        if (!global.queues) global.queues = new Map();
        let queue = global.queues.get(guildId);
        if (!queue) {
            queue = { tracks: [], currentTrack: null, player: null, loop: false, volume: 100 };
            global.queues.set(guildId, queue);
        }

        // Auto-connect to voice channel if not connected
        if (!queue.player) {
            let player = client.shoukaku.players.get(guildId);
            if (player) {
                queue.player = player;
            } else {
                const voiceChannels = guild.channels.cache.filter(c => c.isVoiceBased());
                let targetChannel = voiceChannels.find(c => c.members.filter(m => !m.user.bot).size > 0);
                if (!targetChannel) targetChannel = voiceChannels.first();

                if (targetChannel) {
                    try {
                        player = await client.shoukaku.joinVoiceChannel({
                            guildId: guildId,
                            channelId: targetChannel.id,
                            shardId: 0,
                            deaf: true
                        });
                        queue.player = player;
                        setupPlayerListeners(player, queue, guildId, client);
                    } catch (err) {
                        console.error('Failed to auto-connect voice channel for file play:', err);
                    }
                }
            }
        }

        if (!queue.player) {
            return res.status(400).json({ error: 'Le bot doit d\'abord être connecté à un salon vocal.' });
        }

        try {
            let playableUrl = null;

            // Strategy 1: Relay to Discord channel to get a globally accessible CDN URL (accessible by remote nodes like Nazha)
            try {
                const textChannel = guild.channels.cache.find(c => 
                    c.isTextBased() && 
                    !c.isThread() && 
                    c.permissionsFor(guild.members.me)?.has(['ViewChannel', 'SendMessages', 'AttachFiles'])
                );

                if (textChannel) {
                    const sent = await textChannel.send({
                        content: `📁 **Fichier audio uploadé depuis le Dashboard** : \`${req.file.originalname}\``,
                        files: [{
                            attachment: req.file.path,
                            name: req.file.originalname
                        }]
                    });
                    const discordAttachment = sent.attachments.first();
                    if (discordAttachment?.url) {
                        playableUrl = discordAttachment.url;
                        console.log('[PlayFile Web] Relayed to Discord CDN successfully:', playableUrl);
                    }
                }
            } catch (discordErr) {
                console.warn('[PlayFile Web] Discord relay failed, falling back to local server URL:', discordErr.message);
            }

            // Strategy 2: Fallback to Express public/local URL
            if (!playableUrl) {
                const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
                const host = req.headers['x-forwarded-host'] || req.get('host');
                const baseUrl = process.env.PUBLIC_URL || `${protocol}://${host}`;
                playableUrl = `${baseUrl}/uploads/${path.basename(req.file.path)}`;
                console.log('[PlayFile Web] Using Express static URL:', playableUrl);
            }

            // Prioritize the player's own node
            const playerNode = queue.player?.node;
            const orderedNodes = playerNode
                ? [playerNode, ...nodes.filter(n => n.name !== playerNode.name)]
                : nodes;

            let result = null;
            let resolvedNode = null;
            for (const node of orderedNodes) {
                try {
                    const res = await node.rest.resolve(playableUrl);
                    if (res && res.loadType !== 'empty' && res.loadType !== 'error' && res.data) {
                        result = res;
                        resolvedNode = node;
                        break;
                    }
                } catch (e) {
                    console.log(`[PlayFile Web] Node ${node.name} failed to resolve:`, e.message);
                }
            }

            if (!result || !result.data) {
                return res.status(400).json({ error: 'Lavalink n\'a pas pu décoder ce fichier audio.' });
            }

            let trackToPlay = null;
            if (result.loadType === 'track') {
                trackToPlay = result.data;
            } else if (result.loadType === 'search' && Array.isArray(result.data) && result.data.length > 0) {
                trackToPlay = result.data[0];
            } else if (result.loadType === 'playlist' && result.data.tracks?.length > 0) {
                trackToPlay = result.data.tracks[0];
            }

            if (!trackToPlay) {
                return res.status(400).json({ error: 'Aucun flux audio extrait du fichier.' });
            }

            // Format clean title
            const rawName = req.file.originalname || 'Fichier audio';
            const lastDot = rawName.lastIndexOf('.');
            const baseName = lastDot > 0 ? rawName.substring(0, lastDot) : rawName;
            const cleanTitle = baseName.replace(/[_]/g, ' ').trim();

            const finalTitle = (trackToPlay.info?.title && 
                                trackToPlay.info.title !== 'Unknown title' && 
                                !trackToPlay.info.title.startsWith('http')) 
                                ? trackToPlay.info.title 
                                : cleanTitle;

            const trackObj = {
                title: finalTitle,
                artist: (trackToPlay.info?.author && trackToPlay.info.author !== 'Unknown author')
                    ? trackToPlay.info.author
                    : 'Fichier Dashboard',
                url: playableUrl,
                encoded: trackToPlay.encoded,
                duration: trackToPlay.info?.length || 0,
                artworkUrl: trackToPlay.info?.artworkUrl || null,
                nodeName: resolvedNode?.name,
                isFile: true
            };

            queue.tracks.push(trackObj);

            // If not playing, play next immediately
            if (!queue.currentTrack) {
                const toPlay = queue.tracks.shift();
                queue.currentTrack = toPlay;

                try {
                    if (queue.player) {
                        if (toPlay.encoded) {
                            try {
                                await queue.player.playTrack({ track: { encoded: toPlay.encoded } });
                            } catch (encErr) {
                                await queue.player.playTrack({ track: { identifier: toPlay.url } });
                            }
                        } else {
                            await queue.player.playTrack({ track: { identifier: toPlay.url } });
                        }
                    }
                } catch (e) {
                    console.error('[PlayFile Web] Play Error:', e);
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
        } catch (err) {
            console.error('[PlayFile Web API Error]', err);
            return res.status(500).json({ error: 'Erreur lors du traitement du fichier: ' + err.message });
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
        const lyrics = await fetchLyrics(
            queue.currentTrack.title,
            queue.currentTrack.author || queue.currentTrack.artist || '',
            queue.currentTrack.length || queue.currentTrack.duration || 0
        );
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
            queue.player.position = position;
            if (global.io) {
                global.io.to(`queue_${req.params.id}`).emit('player_position', {
                    position,
                    isPlaying: !queue.player.paused,
                    timestamp: Date.now()
                });
            }
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

            const node = getIdealNode(client);
            if (!node) throw new Error('Aucun nœud Lavalink disponible pour le moment.');

            const lavalinkResult = await node.rest.resolve(url);
            const loadType = lavalinkResult?.loadType?.toLowerCase();

            if (!lavalinkResult || loadType === 'empty' || loadType === 'error') {
                throw new Error('Impossible de charger ce lien. Assure-toi que c\'est un lien valide (Spotify, Apple Music, etc.).');
            }

            // Handle both playlist (data.tracks) and single track (data) or search array (data)
            let rawTracks = [];
            let playlistName = 'Importation';

            if (loadType === 'playlist') {
                rawTracks = lavalinkResult.data.tracks || [];
                playlistName = lavalinkResult.data.info?.name || 'Playlist Importée';
            } else if (Array.isArray(lavalinkResult.data)) {
                rawTracks = lavalinkResult.data;
            } else if (lavalinkResult.data && lavalinkResult.data.info) {
                rawTracks = [lavalinkResult.data];
                playlistName = lavalinkResult.data.info.title || 'Titre Importé';
            }

            let result = {
                name: playlistName,
                tracks: rawTracks.map(t => ({
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
                                setupPlayerListeners(player, queue, guildId, client);
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

    // --- Desktop API: Auth & Deep Linking ---
    app.get('/api/auth/discord', (req, res) => {
        // Redirect to Discord OAuth
        const clientId = process.env.CLIENT_ID;
        const redirectUri = encodeURIComponent(`${req.protocol}://${req.get('host')}/api/auth/discord/callback`);
        res.redirect(`https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=identify%20guilds`);
    });

    app.get('/api/auth/discord/callback', (req, res) => {
        // Note: With response_type=token, the token is in the URL hash, which the server doesn't see.
        // We serve a simple HTML page that extracts the hash and redirects to the desktop app.
        res.send(`
            <html>
                <script>
                    const hash = window.location.hash.substring(1);
                    const params = new URLSearchParams(hash);
                    const token = params.get('access_token');
                    if (token) {
                        window.location.href = 'foxymusic://auth?token=' + token;
                        // Fallback message
                        setTimeout(() => {
                            document.body.innerHTML = '<h2>Authentification réussie. Vous pouvez fermer cette fenêtre.</h2><p>Si l\\'application ne s\\'est pas ouverte, <a href="foxymusic://auth?token=' + token + '">cliquez ici</a>.</p>';
                        }, 1000);
                    } else {
                        document.body.innerHTML = '<h2>Erreur d\\'authentification</h2>';
                    }
                </script>
            </html>
        `);
    });

    // --- Desktop API: Artists ---
    const { getUserProfile, updateUserProfile } = require('./utils/db');

    app.post('/api/users/:id/artist/apply', (req, res) => {
        const userId = req.params.id;
        const profile = getUserProfile(userId);
        updateUserProfile(userId, { isArtist: true });
        res.json({ success: true, message: 'Demande soumise' });
    });

    app.get('/api/artists', (req, res) => {
        const db = require('./utils/db').readDB ? require('./utils/db').readDB() : { users: {} };
        const artists = Object.values(db.users).filter(u => u.isVerifiedArtist).map(u => u.artistProfile);
        res.json(artists);
    });

    // --- Desktop API: User Library & Imports ---
    app.get('/api/users/:id/library', (req, res) => {
        const profile = getUserProfile(req.params.id);
        res.json({
            playlists: profile.playlists,
            importedPlaylists: profile.importedPlaylists
        });
    });

    app.post('/api/users/:id/import/spotify', async (req, res) => {
        const { url } = req.body;
        const userId = req.params.id;
        if (!url) return res.status(400).json({ error: 'Missing URL' });

        try {
            const node = getIdealNode(client);
            if (!node) throw new Error('Aucun nœud Lavalink disponible pour le moment');

            const result = await node.rest.resolve(url);
            if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                throw new Error('Playlist introuvable');
            }

            let rawTracks = [];
            let playlistName = 'Import Spotify';
            if (result.loadType === 'playlist') {
                rawTracks = result.data.tracks || [];
                playlistName = result.data.info?.name || playlistName;
            } else if (Array.isArray(result.data)) {
                rawTracks = result.data;
            }

            const tracksToAdd = rawTracks.map(t => ({
                title: t.info?.title,
                artist: t.info?.author,
                url: t.info?.uri,
                duration: t.info?.length,
                artworkUrl: t.info?.artworkUrl
            }));

            const profile = getUserProfile(userId);
            const updatedImports = { ...profile.importedPlaylists };
            updatedImports.spotify = updatedImports.spotify || [];
            updatedImports.spotify.push({ name: playlistName, tracks: tracksToAdd });

            updateUserProfile(userId, { importedPlaylists: updatedImports });

            res.json({ success: true, name: playlistName, count: tracksToAdd.length });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.post('/api/users/:id/import/apple-music', async (req, res) => {
        // Similar to Spotify import, uses the same Lavalink resolution process
        const { url } = req.body;
        const userId = req.params.id;
        if (!url) return res.status(400).json({ error: 'Missing URL' });

        try {
            const node = getIdealNode(client);
            if (!node) throw new Error('Aucun nœud Lavalink disponible pour le moment');

            const result = await node.rest.resolve(url);
            if (!result || result.loadType === 'empty' || result.loadType === 'error') {
                throw new Error('Playlist introuvable');
            }

            let rawTracks = [];
            let playlistName = 'Import Apple Music';
            if (result.loadType === 'playlist') {
                rawTracks = result.data.tracks || [];
                playlistName = result.data.info?.name || playlistName;
            } else if (Array.isArray(result.data)) {
                rawTracks = result.data;
            }

            const tracksToAdd = rawTracks.map(t => ({
                title: t.info?.title,
                artist: t.info?.author,
                url: t.info?.uri,
                duration: t.info?.length,
                artworkUrl: t.info?.artworkUrl
            }));

            const profile = getUserProfile(userId);
            const updatedImports = { ...profile.importedPlaylists };
            updatedImports.appleMusic = updatedImports.appleMusic || [];
            updatedImports.appleMusic.push({ name: playlistName, tracks: tracksToAdd });

            updateUserProfile(userId, { importedPlaylists: updatedImports });

            res.json({ success: true, name: playlistName, count: tracksToAdd.length });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    // --- Desktop API: Search & Streaming (Phase 4) ---
    app.get('/api/search', async (req, res) => {
        const { q } = req.query;
        if (!q) return res.status(400).json({ error: 'Missing query (q)' });

        try {
            const https = require('https');
            const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=15`;

            https.get(url, (response) => {
                let data = '';
                response.on('data', (chunk) => data += chunk);
                response.on('end', () => {
                    try {
                        const json = JSON.parse(data);
                        const tracks = (json.results || []).map(t => ({
                            title: t.trackName,
                            artist: t.artistName,
                            url: t.previewUrl, // Direct audio stream!
                            duration: t.trackTimeMillis || 30000,
                            artworkUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100', '600x600') : null
                        })).filter(t => t.url);
                        res.json(tracks);
                    } catch (e) {
                        res.status(500).json({ error: 'Parse error' });
                    }
                });
            }).on('error', (e) => {
                res.status(500).json({ error: e.message });
            });
        } catch (e) {
            console.error('[API Search Error]', e);
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/stream', async (req, res) => {
        const { q, fallback } = req.query;
        if (!q) return res.status(400).send('Missing q parameter');
        
        try {
            const play = require('play-dl');
            
            // 1. Try SoundCloud search for full song
            const searched = await play.search(q, { source: { soundcloud: 'tracks' }, limit: 1 });
            
            if (searched && searched.length > 0) {
                const stream = await play.stream(searched[0].url);
                res.setHeader('Content-Type', 'audio/mpeg');
                res.setHeader('Transfer-Encoding', 'chunked');
                stream.stream.pipe(res);
                
                stream.stream.on('error', () => {
                    if (!res.headersSent && fallback) res.redirect(fallback);
                });
                return;
            }
            
            // 2. If not found, use fallback (iTunes preview)
            if (fallback) {
                return res.redirect(fallback);
            }
            
            res.status(404).send('Not found');
        } catch (e) {
            console.error('[Stream Error]', e.message);
            if (fallback && !res.headersSent) {
                return res.redirect(fallback);
            }
            if (!res.headersSent) {
                res.status(500).send('Server Error');
            }
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
