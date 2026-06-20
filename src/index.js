require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');

const Nodes = [
    // --- Reliable nodes (confirmed v4) ---
    {
        name: 'Mon Lavalink Privé',
        url: 'prem-eu3.bot-hosting.net:20626',
        auth: 'youshallnotpass',
        secure: false
    },
    {
        name: 'TriniumHost-4333',
        url: 'lavalink.triniumhost.com:4333',
        auth: 'free',
        secure: false
    },
    {
        name: 'NyxBot-SG',
        url: 'sg1-nodelink.nyxbot.app:3000',
        auth: 'nyxbot.app/support',
        secure: false
    },
    // --- SSL nodes ---
    {
        name: 'TriniumHost-SSL',
        url: 'lavalink-v4.triniumhost.com:443',
        auth: 'free',
        secure: true
    }
];
const fs = require('fs');
const path = require('path');
const { startServer } = require('./server');
const { getGuildConfig } = require('./utils/db');
const { updatePanel } = require('./utils/panelUpdater');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

client.commands = new Collection();

const shoukaku = new Shoukaku(new Connectors.DiscordJS(client), Nodes);
shoukaku.on('error', (name, error) => console.error(`[Lavalink Node ${name}] Error:`, error));
shoukaku.on('ready', (name) => console.log(`[Lavalink Node ${name}] Connected!`));
shoukaku.on('close', (name, code, reason) => console.warn(`[Lavalink Node ${name}] Connection closed (Code: ${code}, Reason: ${reason})`));
shoukaku.on('disconnect', (name, players, moved) => console.warn(`[Lavalink Node ${name}] Disconnected. Players: ${players.length}, Moved: ${moved}`));
client.shoukaku = shoukaku;

// Load Commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if (command.disabled) continue;
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
}

client.once('ready', () => {
    console.log(`🦊 Foxy is online! Logged in as ${client.user.tag}`);

    // Configuration de la présence du bot
    const serverCount = client.guilds.cache.size;
    client.user.setPresence({
        activities: [{
            name: `${serverCount} serveurs 🦊`,
            type: ActivityType.Listening
        }],
        status: 'idle'
    });

    // Démarrer l'API Web et WebSockets
    startServer(client);
});

// Discord panel listener disabled - Web Dashboard is now the primary control interface

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        const queue = global.queues ? global.queues.get(interaction.guild.id) : null;

        if (!queue || !queue.player) {
            return interaction.reply({ content: '❌ Aucune musique en cours.', ephemeral: true });
        }

        try {
            if (interaction.customId === 'foxy_play_pause') {
                if (queue.player.paused) {
                    await queue.player.setPaused(false);
                    await interaction.reply({ content: '▶️ Reprise de la lecture.', ephemeral: true });
                } else {
                    await queue.player.setPaused(true);
                    await interaction.reply({ content: '⏸️ Musique en pause.', ephemeral: true });
                }
            } else if (interaction.customId === 'foxy_skip') {
                await queue.player.stopTrack(); // Emits 'end' and triggers next track in our queue system
                await interaction.reply({ content: '⏭️ Musique ignorée.', ephemeral: true });
            } else if (interaction.customId === 'foxy_stop') {
                queue.tracks = [];
                queue.loop = false;
                await interaction.client.shoukaku.leaveVoiceChannel(interaction.guild.id);
                global.queues.delete(interaction.guild.id);
                await interaction.reply({ content: '⏹️ Lecture arrêtée et file d\'attente vidée.', ephemeral: true });
            } else if (interaction.customId === 'foxy_loop') {
                queue.loop = !queue.loop;
                await interaction.reply({ content: queue.loop ? '🔁 Mode boucle activé pour la musique actuelle.' : '🔁 Mode boucle désactivé.', ephemeral: true });
            } else if (interaction.customId === 'foxy_vol_down') {
                queue.volume = Math.max(10, (queue.volume || 100) - 10);
                await queue.player.setGlobalVolume(queue.volume);
                await interaction.reply({ content: `🔉 Volume baissé à ${queue.volume}%`, ephemeral: true });
            } else if (interaction.customId === 'foxy_vol_up') {
                queue.volume = Math.min(200, (queue.volume || 100) + 10);
                await queue.player.setGlobalVolume(queue.volume);
                await interaction.reply({ content: `🔊 Volume monté à ${queue.volume}%`, ephemeral: true });
            } else if (interaction.customId === 'foxy_queue') {
                if (queue.tracks.length === 0) {
                    await interaction.reply({ content: 'La file d\'attente est vide.', ephemeral: true });
                } else {
                    const tracksList = queue.tracks.slice(0, 10).map((t, i) => `\`${i + 1}.\` ${t.title}`).join('\n');
                    const extra = queue.tracks.length > 10 ? `\n*... et ${queue.tracks.length - 10} autres titres*` : '';
                    await interaction.reply({ content: `**File d'attente :**\n${tracksList}${extra}`, ephemeral: true });
                }
            } else if (interaction.customId === 'foxy_lyrics') {
                const lyricsCmd = client.commands.get('lyrics');
                if (lyricsCmd) {
                    await lyricsCmd.execute(interaction);
                } else {
                    await interaction.reply({ content: '❌ Commande paroles introuvable.', ephemeral: true });
                }
            } else if (interaction.customId === 'foxy_refresh_np') {
                const nowplayingCmd = client.commands.get('nowplaying');
                if (nowplayingCmd) {
                    await nowplayingCmd.execute(interaction);
                } else {
                    await interaction.reply({ content: '❌ Commande nowplaying introuvable.', ephemeral: true });
                }
            } else {
                await interaction.reply({ content: 'Bouton non géré pour le moment.', ephemeral: true });
            }
            updatePanel(client, interaction.guild.id);
        } catch (e) {
            console.error('Button error:', e);
        }
        return;
    }

    if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (command && command.autocomplete) {
            try {
                await command.autocomplete(interaction);
            } catch (err) {
                console.error('[Autocomplete Handling Error]', err);
            }
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        return;
    }

    try {
        await command.execute(interaction);
        updatePanel(client, interaction.guild.id); // Update panel after slash commands too
    } catch (error) {
        console.error(error);
        const msg = 'There was an error while executing this command!';
        try {
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: msg, ephemeral: true });
            } else {
                await interaction.reply({ content: msg, ephemeral: true });
            }
        } catch (_) {
            // interaction expired, ignore
        }
    }
});

// Global error logging
process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught Exception:', error);
    shutdown();
});

client.on('error', (error) => {
    console.error('❌ Discord Client Error:', error);
});

client.on('voiceStateUpdate', (oldState, newState) => {
    const guildId = oldState.guild.id || newState.guild.id;

    // Handle bot being manually disconnected by a user
    if (oldState.member.id === client.user.id && oldState.channelId && !newState.channelId) {
        console.log(`[Voice] Bot was manually disconnected from guild ${guildId}`);
        const queue = global.queues ? global.queues.get(guildId) : null;
        if (queue && queue.player) {
            try {
                // Destroy the player gracefully
                client.shoukaku.leaveVoiceChannel(guildId).catch(() => { });
                queue.player = null;
                queue.currentTrack = null;
                // Optional: clear the queue or keep tracks if they want to resume later
                queue.tracks = [];
            } catch (e) {
                console.error(`[Voice] Error handling bot disconnect:`, e);
            }
            const { updatePanel } = require('./utils/panelUpdater');
            updatePanel(client, guildId);
        }
    }

    if (global.io) {
        const guild = client.guilds.cache.get(guildId);
        if (guild) {
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
            global.io.to(`queue_${guildId}`).emit('voice_update', { channels: channelsData, botVoiceChannel });
        }
    }
});

// Graceful shutdown
const shutdown = async () => {
    console.log('🦊 Stopping bot gracefully...');
    try {
        if (client.shoukaku) {
            // Disconnect all players
            for (const [guildId, player] of client.shoukaku.players.entries()) {
                await client.shoukaku.leaveVoiceChannel(guildId);
            }
        }
    } catch (e) {
        console.error('Error leaving voice channels:', e);
    }
    client.destroy();
    process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

client.login(process.env.DISCORD_TOKEN);
