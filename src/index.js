require('dotenv').config();
const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');
const { Client, GatewayIntentBits, Collection, ActivityType } = require('discord.js');
const { Shoukaku, Connectors } = require('shoukaku');

const Nodes = [
    {
        name: 'Jirayu',
        url: 'lavalink.jirayu.net:443',
        auth: 'youshallnotpass',
        secure: true
    },
    {
        name: 'Serenetia',
        url: 'lavalinkv4.serenetia.com:443',
        auth: 'https://seretia.link/discord',
        secure: true
    },
    {
        name: 'NexCloud',
        url: 'n3.nexcloud.in:2026',
        auth: 'nexcloud',
        secure: false
    },
    {
        name: 'TriniumHost',
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
shoukaku.on('error', (_, error) => console.error('Shoukaku Error:', error));
shoukaku.on('ready', (name) => console.log(`Lavalink Node: ${name} is now connected`));
client.shoukaku = shoukaku;

// Load Commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
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

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const channel = message.channel;
    const config = getGuildConfig(message.guild.id);
    if (config.panelChannelId === channel.id) {
        message.delete().catch(() => {});
        
        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) {
            const reply = await channel.send(`❌ <@${message.author.id}>, tu dois être dans un salon vocal !`);
            setTimeout(() => reply.delete().catch(() => {}), 5000);
            return;
        }

        const command = client.commands.get('play');
        if (command) {
            // Mock interaction for the play command
            const mockInteraction = {
                client: client,
                guild: message.guild,
                member: message.member,
                channel: channel,
                options: { getString: () => message.content },
                deferReply: async () => {},
                reply: async (data) => {
                    const reply = await channel.send(data);
                    setTimeout(() => reply.delete().catch(() => {}), 5000);
                },
                followUp: async (data) => {
                    const reply = await channel.send(data);
                    setTimeout(() => reply.delete().catch(() => {}), 5000);
                }
            };
            try {
                await command.execute(mockInteraction);
                updatePanel(client, message.guild.id);
            } catch (e) {
                console.error('Error executing play via panel:', e);
            }
        }
    }
});

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
            } else {
                await interaction.reply({ content: 'Bouton non géré pour le moment.', ephemeral: true });
            }
            updatePanel(client, interaction.guild.id);
        } catch (e) {
            console.error('Button error:', e);
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
