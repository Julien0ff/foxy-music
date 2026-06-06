const { getGuildConfig } = require('./db');

function checkDJ(interaction, queue) {
    // Admins always bypass
    if (interaction.member.permissions.has('Administrator')) return true;

    // Check if DJ role is configured and user has it
    const config = getGuildConfig(interaction.guild.id);
    if (config.djRoleId && interaction.member.roles.cache.has(config.djRoleId)) {
        return true;
    }

    // Check if user is the requester of the current track
    // Note: We need to ensure we save the requester ID in the track object when playing
    if (queue && queue.currentTrack && queue.currentTrack.requester === interaction.user.id) {
        return true;
    }

    // If no DJ role is set, anyone can use commands, OR if it's strictly enforced, only requester/admin.
    // Standard behavior: if DJ role exists but user doesn't have it (and isn't requester), block.
    // If DJ role doesn't exist, allow everyone.
    if (config.djRoleId) {
        return false;
    }

    return true;
}

module.exports = {
    checkDJ
};
