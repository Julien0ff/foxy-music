const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { getGuildConfig, updateGuildConfig } = require('../utils/db');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('dj')
        .setDescription('Gérer les paramètres DJ')
        .addSubcommand(subcommand =>
            subcommand
                .setName('set')
                .setDescription('Définit le rôle DJ')
                .addRoleOption(option => option.setName('role').setDescription('Le rôle DJ').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Supprime le rôle DJ requis')
        )
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction) {
        const subcommand = interaction.options.getSubcommand();
        
        if (subcommand === 'set') {
            const role = interaction.options.getRole('role');
            updateGuildConfig(interaction.guild.id, { djRoleId: role.id });
            return interaction.reply(`👑 Le rôle DJ a été défini sur ${role}.`);
        } else if (subcommand === 'clear') {
            updateGuildConfig(interaction.guild.id, { djRoleId: null });
            return interaction.reply(`👑 Le système DJ a été désactivé. Tout le monde peut utiliser les commandes.`);
        }
    }
};
