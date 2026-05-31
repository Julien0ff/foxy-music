const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { fetchLyrics } = require('../utils/lyrics');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('lyrics')
        .setDescription('Affiche les paroles de la musique en cours ou d\'une musique recherchée')
        .addStringOption(option =>
            option.setName('titre')
                .setDescription('Titre à rechercher (optionnel, par défaut la musique en cours)')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const query = interaction.options?.getString('titre') || null;
        let searchTitle = query;

        // Si pas de titre fourni, prendre la musique en cours
        if (!searchTitle) {
            const queue = global.queues ? global.queues.get(interaction.guild.id) : null;
            if (!queue || !queue.currentTrack) {
                return interaction.editReply({ content: '❌ Aucune musique en cours de lecture.' });
            }
            searchTitle = queue.currentTrack.title;
        }

        const lyrics = await fetchLyrics(searchTitle);

        if (!lyrics || (!lyrics.plain && lyrics.synced.length === 0)) {
            return interaction.editReply({
                content: `❌ Aucune parole trouvée pour **${searchTitle}**.`
            });
        }

        // Choisir le texte à afficher (plain ou synced dépouillé des timestamps)
        let lyricsText = '';
        if (lyrics.synced && lyrics.synced.length > 0) {
            lyricsText = lyrics.synced.map(l => l.text).join('\n');
        } else {
            lyricsText = lyrics.plain || '';
        }

        // Découper en plusieurs embeds si trop long (limite Discord: 4096 chars par description)
        const MAX_CHARS = 3800;
        const chunks = [];
        const lines = lyricsText.split('\n');
        let current = '';

        for (const line of lines) {
            if ((current + '\n' + line).length > MAX_CHARS) {
                chunks.push(current.trim());
                current = line;
            } else {
                current += (current ? '\n' : '') + line;
            }
        }
        if (current.trim()) chunks.push(current.trim());

        // Envoyer le premier embed en réponse éphémère
        const embeds = chunks.map((chunk, i) => {
            const embed = new EmbedBuilder()
                .setColor('#ff416c')
                .setDescription(chunk);

            if (i === 0) {
                embed
                    .setTitle(`🎤 ${lyrics.title}${lyrics.artist ? ` — ${lyrics.artist}` : ''}`)
                    .setFooter({ text: `Paroles fournies par LrcLib${lyrics.synced?.length > 0 ? ' • Synchronisées ✓' : ''}` });
            }
            return embed;
        });

        // Discord permet jusqu'à 10 embeds par message
        await interaction.editReply({ embeds: embeds.slice(0, 10) });
    }
};
