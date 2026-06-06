const { SlashCommandBuilder } = require('discord.js');
const { checkDJ } = require('../utils/dj');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('filter')
        .setDescription('Appliquer un filtre audio')
        .addStringOption(option => 
            option.setName('nom')
            .setDescription('Le filtre à appliquer')
            .setRequired(true)
            .addChoices(
                { name: 'Bassboost', value: 'bassboost' },
                { name: 'Nightcore', value: 'nightcore' },
                { name: 'Vaporwave', value: 'vaporwave' },
                { name: '8D', value: '8d' },
                { name: 'Karaoké', value: 'karaoke' },
                { name: 'Désactiver (Clear)', value: 'clear' }
            )),
    async execute(interaction) {
        if (!global.queues || !global.queues.has(interaction.guild.id)) return interaction.reply({ content: '❌ File d\'attente vide!', ephemeral: true });
        const queue = global.queues.get(interaction.guild.id);
        if (!checkDJ(interaction, queue)) return interaction.reply({ content: '❌ Vous devez être DJ pour utiliser cette commande.', ephemeral: true });
        if (!queue.player) return interaction.reply({ content: '❌ Aucune musique en cours.', ephemeral: true });

        const filter = interaction.options.getString('nom');

        try {
            if (filter === 'clear') {
                await queue.player.clearFilters();
                return interaction.reply('🎛️ Tous les filtres ont été désactivés.');
            }

            if (filter === 'bassboost') {
                await queue.player.setFilters({
                    equalizer: [
                        { band: 0, gain: 0.65 },
                        { band: 1, gain: 0.45 },
                        { band: 2, gain: -0.45 },
                        { band: 3, gain: -0.65 },
                        { band: 4, gain: -0.35 },
                        { band: 5, gain: 0.45 },
                        { band: 6, gain: 0.55 },
                        { band: 7, gain: 0.6 },
                        { band: 8, gain: 0.6 },
                        { band: 9, gain: 0.6 },
                        { band: 10, gain: 0 },
                        { band: 11, gain: 0 },
                        { band: 12, gain: 0 },
                        { band: 13, gain: 0 },
                        { band: 14, gain: 0 }
                    ]
                });
                return interaction.reply('🎛️ Filtre **Bassboost** activé !');
            }

            if (filter === 'nightcore') {
                await queue.player.setFilters({
                    timescale: { speed: 1.2, pitch: 1.2, rate: 1.0 }
                });
                return interaction.reply('🎛️ Filtre **Nightcore** activé !');
            }

            if (filter === 'vaporwave') {
                await queue.player.setFilters({
                    timescale: { speed: 0.8, pitch: 0.8, rate: 1.0 },
                    tremolo: { depth: 0.3, frequency: 14.0 }
                });
                return interaction.reply('🎛️ Filtre **Vaporwave** activé !');
            }

            if (filter === '8d') {
                await queue.player.setFilters({
                    rotation: { rotationHz: 0.2 }
                });
                return interaction.reply('🎛️ Filtre **8D Audio** activé !');
            }

            if (filter === 'karaoke') {
                await queue.player.setFilters({
                    karaoke: { level: 1.0, monoLevel: 1.0, filterBand: 220.0, filterWidth: 100.0 }
                });
                return interaction.reply('🎛️ Filtre **Karaoké** activé !');
            }
            
        } catch (err) {
            console.error(err);
            return interaction.reply({ content: '❌ Erreur lors de l\'application du filtre.', ephemeral: true });
        }
    }
};
