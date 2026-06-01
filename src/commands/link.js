const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Affiche le lien d\'invitation et le site web de Foxy Music'),
    async execute(interaction) {
        const botAvatar = interaction.client.user.displayAvatarURL();

        const embed = new EmbedBuilder()
            .setTitle('🦊 Foxy Music — Liens Officiels')
            .setDescription(
                `Découvrez et partagez l'univers de **Foxy Music** !\n\n` +
                `🌐 **[Site Web / Dashboard](https://foxymusic.lunaverse.fr)**\n` +
                `*Accédez à votre espace membre, visualisez la file d'attente en temps réel et contrôlez votre musique depuis votre navigateur.*\n\n` +
                `🔗 **[Inviter Foxy sur un serveur](https://discord.com/oauth2/authorize?client_id=1509947523949662380&permissions=8584986789675007&scope=bot+applications.commands)**\n` +
                `*Ajoutez Foxy Music sur vos autres serveurs pour profiter d'une qualité audio exceptionnelle avec vos amis.*`
            )
            .setColor('#ff9900')
            .setThumbnail(botAvatar)
            .setFooter({ text: 'Foxy Music Bot — Fait avec 🧡', iconURL: botAvatar });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('Inviter Foxy')
                .setEmoji('🦊')
                .setStyle(ButtonStyle.Link)
                .setURL('https://discord.com/oauth2/authorize?client_id=1509947523949662380&permissions=8584986789675007&scope=bot+applications.commands'),
            new ButtonBuilder()
                .setLabel('Dashboard Web')
                .setEmoji('🌐')
                .setStyle(ButtonStyle.Link)
                .setURL('https://foxymusic.lunaverse.fr')
        );

        return interaction.reply({ embeds: [embed], components: [row] });
    },
};
