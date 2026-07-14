const { SlashCommandBuilder } = require('discord.js');
const { getUserPlaylists, updateUserPlaylist, deleteUserPlaylist } = require('../utils/db');
const { updatePanel } = require('../utils/panelUpdater');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('playlist')
        .setDescription('Gérer vos playlists personnalisées')
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Créer une nouvelle playlist vide')
                .addStringOption(option => option.setName('nom').setDescription('Nom de la playlist').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Ajouter une musique à une playlist existante')
                .addStringOption(option => option.setName('nom').setDescription('Nom de la playlist').setRequired(true))
                .addStringOption(option => option.setName('recherche').setDescription('URL ou titre de la musique').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('play')
                .setDescription('Jouer une de vos playlists')
                .addStringOption(option => option.setName('nom').setDescription('Nom de la playlist').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Afficher vos playlists')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('delete')
                .setDescription('Supprimer une playlist')
                .addStringOption(option => option.setName('nom').setDescription('Nom de la playlist').setRequired(true))
        ),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        const userId = interaction.user.id;
        const playlists = getUserPlaylists(userId);

        if (subcommand === 'create') {
            const name = interaction.options.getString('nom');
            if (playlists[name]) return interaction.reply({ content: '❌ Cette playlist existe déjà.', ephemeral: true });
            updateUserPlaylist(userId, name, []);
            return interaction.reply(`📂 Playlist **${name}** créée avec succès !`);
        }

        if (subcommand === 'list') {
            const names = Object.keys(playlists);
            if (names.length === 0) return interaction.reply({ content: '📂 Vous n\'avez aucune playlist.', ephemeral: true });
            const list = names.map(n => `- **${n}** (${playlists[n].length} pistes)`).join('\n');
            return interaction.reply(`📂 **Vos Playlists :**\n${list}`);
        }

        if (subcommand === 'delete') {
            const name = interaction.options.getString('nom');
            if (!playlists[name]) return interaction.reply({ content: '❌ Cette playlist n\'existe pas.', ephemeral: true });
            deleteUserPlaylist(userId, name);
            return interaction.reply(`🗑️ Playlist **${name}** supprimée.`);
        }

        if (subcommand === 'add') {
            await interaction.deferReply({ ephemeral: true });
            const name = interaction.options.getString('nom');
            const query = interaction.options.getString('recherche');
            if (!playlists[name]) return interaction.followUp('❌ Cette playlist n\'existe pas.');

            const nodes = Array.from(interaction.client.shoukaku.nodes.values());
            if (nodes.length === 0) return interaction.followUp('❌ Aucun nœud Lavalink disponible.');

            let trackToPlay = null;
            let finalQuery = query;
            if (!query.startsWith('http')) finalQuery = `ytmsearch:${query}`;

            for (const node of nodes) {
                try {
                    const result = await node.rest.resolve(finalQuery);
                    if (result && result.loadType === 'search' && result.data && result.data.length > 0) {
                        trackToPlay = result.data[0];
                        break;
                    } else if (result && result.loadType === 'track' && result.data) {
                        trackToPlay = result.data;
                        break;
                    }
                } catch (e) {}
            }

            if (!trackToPlay) return interaction.followUp('❌ Impossible de trouver cette musique.');

            const trackInfo = {
                title: trackToPlay.info.title,
                url: trackToPlay.info.uri,
                encoded: trackToPlay.encoded,
                duration: trackToPlay.info.length,
                artworkUrl: trackToPlay.info.artworkUrl || null,
                nodeName: nodes[0].name
            };

            const tracks = playlists[name];
            tracks.push(trackInfo);
            updateUserPlaylist(userId, name, tracks);

            return interaction.followUp(`✅ **${trackInfo.title}** ajoutée à la playlist **${name}** !`);
        }

        if (subcommand === 'play') {
            const name = interaction.options.getString('nom');
            if (!playlists[name]) return interaction.reply({ content: '❌ Cette playlist n\'existe pas.', ephemeral: true });
            const tracks = playlists[name];
            if (tracks.length === 0) return interaction.reply({ content: '❌ Cette playlist est vide.', ephemeral: true });

            const channel = interaction.member.voice.channel;
            if (!channel) return interaction.reply({ content: '❌ Vous devez être dans un salon vocal!', ephemeral: true });

            await interaction.deferReply();
            const { playNext } = require('./play');
            
            if (!global.queues) global.queues = new Map();
            if (!global.queues.has(interaction.guild.id)) {
                const { getGuildConfig } = require('../utils/db');
                const config = getGuildConfig(interaction.guild.id);
                global.queues.set(interaction.guild.id, {
                    tracks: [],
                    currentTrack: null,
                    player: null,
                    history: [],
                    autoplay: config.autoplay || false,
                    volume: config.defaultVolume || 100,
                    leaveTimeout: null
                });
            }
            const queue = global.queues.get(interaction.guild.id);

            if (!queue.player) {
                let player = interaction.client.shoukaku.players.get(interaction.guild.id);
                if (player) {
                    queue.player = player;
                } else {
                    try {
                        try { await interaction.client.shoukaku.leaveVoiceChannel(interaction.guild.id); } catch (_) {}
                        player = await interaction.client.shoukaku.joinVoiceChannel({
                            guildId: interaction.guild.id,
                            channelId: channel.id,
                            shardId: 0,
                            deaf: true
                        });
                        queue.player = player;
                        player.setGlobalVolume(queue.volume);
                        
                        player.on('start', () => updatePanel(interaction.client, interaction.guild.id));
                        player.on('end', (reason) => {
                            if (reason.reason === 'REPLACED') return;
                            playNext(interaction.guild.id, interaction.client);
                        });
                    } catch (err) {
                        return interaction.followUp('❌ Impossible de rejoindre le salon vocal.');
                    }
                }
            }

            const isAlreadyPlaying = !!queue.currentTrack;
            // clone tracks so modifying queue doesn't modify playlist
            queue.tracks.push(...JSON.parse(JSON.stringify(tracks)));

            if (!isAlreadyPlaying) {
                await playNext(interaction.guild.id, interaction.client);
            } else {
                updatePanel(interaction.client, interaction.guild.id);
            }
            return interaction.followUp(`📂 Playlist **${name}** (${tracks.length} pistes) ajoutée à la file d'attente !`);
        }
    }
};
