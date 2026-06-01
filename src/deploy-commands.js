require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        if ('data' in command && 'execute' in command) {
            commands.push(command.data.toJSON());
        }
    }
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Fetching existing application commands to check for Activities Entry Point...');
        let existingCommands = [];
        try {
            existingCommands = await rest.get(
                Routes.applicationCommands(process.env.CLIENT_ID)
            );
        } catch (fetchError) {
            console.warn('Could not fetch existing commands, proceeding anyway:', fetchError.message);
        }

        // Find the Primary Entry Point command (type 4)
        const entryPoint = existingCommands.find(cmd => cmd.type === 4);
        if (entryPoint) {
            console.log(`📌 Found Entry Point command: "${entryPoint.name}". Preserving it in bulk update.`);
            commands.push(entryPoint);
        }

        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        const data = await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();
