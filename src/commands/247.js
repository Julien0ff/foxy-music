const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('24-7')
        .setDescription('Active ou désactive le mode 24/7 pour que le bot reste connecté H24')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const config = getGuildConfig(interaction.guild.id);
        const newState = !config.twentyFourSeven;
        updateGuildConfig(interaction.guild.id, { twentyFourSeven: newState });

        return interaction.reply(newState ? '🕒 Mode 24/7 **Activé**. Le bot restera connecté dans le salon vocal.' : '🕒 Mode 24/7 **Désactivé**. Le bot se déconnectera après inactivité.');
    }
};
