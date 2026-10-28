const { SlashCommandBuilder } = require('discord.js');
const { updatePanel } = require('../utils/panelUpdater');
const { getQueue, playNext, handleLoadFailed } = require('./play');

const SUPPORTED_EXTENSIONS = ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.oga', '.aac', '.opus', '.webm', '.wma'];

function isAudioAttachment(attachment) {
    if (!attachment) return false;
    const name = (attachment.name || '').toLowerCase();
    const contentType = (attachment.contentType || '').toLowerCase();

    const hasAudioExt = SUPPORTED_EXTENSIONS.some(ext => name.endsWith(ext));
    const hasAudioMime = contentType.startsWith('audio/') || 
                         contentType === 'application/ogg' || 
                         contentType === 'video/mp4' || 
                         contentType === 'video/ogg';

    return hasAudioExt || hasAudioMime;
}

function cleanFileName(filename) {
    if (!filename) return 'Fichier audio';
    // Remove extension
    const lastDot = filename.lastIndexOf('.');
    const base = lastDot > 0 ? filename.substring(0, lastDot) : filename;
    // Replace underscores and extra hyphens
    return base.replace(/[_]/g, ' ').trim();
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playfile')
        .setDescription('Play an uploaded audio file (MP3, M4A, WAV, FLAC, OGG, AAC...)')
        .addAttachmentOption(option =>
            option.setName('file')
                .setDescription('The audio file to play')
                .setRequired(true)),

    async execute(interaction) {
        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.reply({ content: '❌ You need to be in a voice channel!', ephemeral: true });
        }

        const attachment = interaction.options.getAttachment('file', true);

        if (!isAudioAttachment(attachment)) {
            return interaction.reply({
                content: `❌ Format de fichier non supporté. Formats acceptés : \`${SUPPORTED_EXTENSIONS.join(', ')}\`.`,
                ephemeral: true
            });
        }

        await interaction.deferReply();

        const queue = getQueue(interaction.guild.id);

        // Ensure player is connected
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
                        if (queue.currentTrack && !queue.currentTrack.isFallback) {
                            handleLoadFailed(interaction.guild.id, interaction.client, queue.currentTrack);
                        }
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
                        if (state && typeof state.position === 'number' && global.io) {
                            global.io.to(`queue_${interaction.guild.id}`).emit('player_position', {
                                position: state.position,
                                isPlaying: !player.paused,
                                timestamp: Date.now()
                            });
                        }
                    });
                } catch (err) {
                    console.error('[Join Error]', err);
                    return interaction.followUp('❌ Impossible de rejoindre le salon vocal.');
                }
            }
        }

        const nodes = Array.from(interaction.client.shoukaku?.nodes?.values() || []).filter(n => n.state === 1);
        if (nodes.length === 0) {
            return interaction.followUp('❌ Aucun nœud Lavalink n\'est disponible pour le moment.');
        }

        const playerNode = (queue.player && queue.player.node) ? queue.player.node : null;
        const orderedNodes = playerNode 
            ? [playerNode, ...nodes.filter(n => n.name !== playerNode.name)]
            : nodes;

        try {
            let result = null;
            let resolvedNode = null;

            // Try resolving via URL (attachment.url or attachment.proxyURL)
            const urlsToTry = [attachment.url, attachment.proxyURL].filter(Boolean);

            for (const url of urlsToTry) {
                for (const node of orderedNodes) {
                    try {
                        const res = await node.rest.resolve(url);
                        if (res && res.loadType !== 'empty' && res.loadType !== 'error' && res.data) {
                            result = res;
                            resolvedNode = node;
                            break;
                        }
                    } catch (e) {
                        console.log(`[PlayFile] Node ${node.name} failed to resolve ${url}:`, e.message);
                    }
                }
                if (result) break;
            }

            if (!result || !result.data) {
                return interaction.followUp('❌ Impossible de charger ce fichier audio avec Lavalink. Assurez-vous qu\'il s\'agit d\'un fichier audio valide non corrompu.');
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
                return interaction.followUp('❌ Aucun flux audio n\'a pu être extrait de ce fichier.');
            }

            const cleanTitle = cleanFileName(attachment.name);
            const resolvedTitle = (trackToPlay.info?.title && 
                                   trackToPlay.info.title !== 'Unknown title' && 
                                   !trackToPlay.info.title.startsWith('http')) 
                                   ? trackToPlay.info.title 
                                   : cleanTitle;

            const uploaderName = interaction.member.displayName || interaction.user.username;
            const author = (trackToPlay.info?.author && trackToPlay.info.author !== 'Unknown author')
                ? trackToPlay.info.author
                : `Uploadé par ${uploaderName}`;

            const trackInfo = {
                title: resolvedTitle,
                artist: author,
                url: attachment.url,
                encoded: trackToPlay.encoded,
                duration: trackToPlay.info?.length || 0,
                artworkUrl: trackToPlay.info?.artworkUrl || null,
                nodeName: resolvedNode.name,
                isFile: true
            };

            const isAlreadyPlaying = !!queue.currentTrack;
            queue.tracks.push(trackInfo);

            if (!isAlreadyPlaying) {
                const nowPlaying = await playNext(interaction.guild.id, interaction.client);
                if (nowPlaying) {
                    return interaction.followUp(`🦊 Lecture en cours du fichier : **${trackInfo.title}** 📁`);
                } else {
                    return interaction.followUp('❌ Échec du lancement de la lecture.');
                }
            } else {
                updatePanel(interaction.client, interaction.guild.id);
                return interaction.followUp(`🦊 Fichier ajouté à la file d'attente : **${trackInfo.title}** 📁`);
            }
        } catch (e) {
            console.error('[PlayFile Error]', e);
            return interaction.followUp(`❌ Une erreur est survenue : ${e.message}`);
        }
    }
};
