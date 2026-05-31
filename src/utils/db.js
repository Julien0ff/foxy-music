const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', '..', 'data', 'db.json');
const DATA_DIR = path.dirname(DB_FILE);

// Ensure the data directory and db file exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ guilds: {} }, null, 2));
}

function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (e) {
        console.error('Error reading db.json:', e);
        return { guilds: {} };
    }
}

function writeDB(data) {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
    } catch (e) {
        console.error('Error writing db.json:', e);
    }
}

function getGuildConfig(guildId) {
    const db = readDB();
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = {
            panelChannelId: null,
            panelMessageId: null,
            prefix: '/',
            language: 'fr',
            stats: {
                totalMessages: 0,
                totalMusicPlayed: 0
            }
        };
        writeDB(db);
    }
    return db.guilds[guildId];
}

function updateGuildConfig(guildId, updates) {
    const db = readDB();
    if (!db.guilds[guildId]) {
        db.guilds[guildId] = {
            panelChannelId: null,
            panelMessageId: null,
            prefix: '/',
            language: 'fr',
            stats: {
                totalMessages: 0,
                totalMusicPlayed: 0
            }
        };
    }
    db.guilds[guildId] = { ...db.guilds[guildId], ...updates };
    writeDB(db);
    return db.guilds[guildId];
}

module.exports = {
    getGuildConfig,
    updateGuildConfig
};
