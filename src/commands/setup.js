const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');
const { updateGuildConfig, getGuildConfig } = require('../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Créer le salon de contrôle pour le bot de musique')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const guild = interaction.guild;
        
        try {
            // Check if there is already a setup channel
            const config = getGuildConfig(guild.id);
            if (config.panelChannelId) {
                const existingChannel = guild.channels.cache.get(config.panelChannelId);
                if (existingChannel) {
                    return interaction.editReply(`Le salon de contrôle existe déjà : <#${existingChannel.id}>`);
                }
            }

            // Create new channel
            const channel = await guild.channels.create({
                name: 'foxy-panel',
                type: ChannelType.GuildText,
                topic: 'Envoyez un lien ou le nom d\'une musique ici pour l\'ajouter à la file d\'attente !',
                reason: 'Création du panel Foxy Music',
            });

            // Create default embed
            const embed = new EmbedBuilder()
                .setTitle('🦊 Foxy Music Panel')
                .setDescription('**Aucune musique en cours de lecture.**\n\nEnvoyez un lien ou un titre dans ce salon pour commencer la lecture !')
                .setColor('#ff9900')
                .setImage('https://imgg.fr/r/p6fLtaqB.png') // Foxy placeholder image (can be changed)
                .setFooter({ text: 'Powered by Foxy Music Web Panel' });

            // Create buttons
            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('foxy_play_pause').setEmoji('⏯️').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('foxy_skip').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('foxy_stop').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('foxy_loop').setEmoji('🔁').setStyle(ButtonStyle.Secondary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('foxy_vol_down').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('foxy_vol_up').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('foxy_queue').setLabel('File d\'attente').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('foxy_lyrics').setEmoji('🎤').setLabel('Paroles').setStyle(ButtonStyle.Secondary)
            );

            // Send message in the new channel
            const panelMessage = await channel.send({ embeds: [embed], components: [row1, row2] });

            // Save configuration
            updateGuildConfig(guild.id, {
                panelChannelId: channel.id,
                panelMessageId: panelMessage.id
            });

            return interaction.editReply(`✅ Salon de contrôle créé avec succès dans <#${channel.id}>`);
        } catch (error) {
            console.error('Error in setup command:', error);
            return interaction.editReply('❌ Une erreur est survenue lors de la création du salon.');
        }
    },
};
