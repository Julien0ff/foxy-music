const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, '..', '..', 'data', 'db.json');
const DATA_DIR = path.dirname(DB_FILE);

// Ensure the data directory and db file exist
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ guilds: {}, users: {} }, null, 2));
}

function readDB() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(data);
        if (!parsed.users) parsed.users = {};
        return parsed;
    } catch (e) {
        console.error('Error reading db.json:', e);
        return { guilds: {}, users: {} };
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
            djRoleId: null,
            twentyFourSeven: false,
            defaultVolume: 100,
            autoplay: false,
            stats: {
                totalMessages: 0,
                totalMusicPlayed: 0
            }
        };
        writeDB(db);
    }
    // Assure defaults are present on existing configs
    if (db.guilds[guildId].djRoleId === undefined) db.guilds[guildId].djRoleId = null;
    if (db.guilds[guildId].twentyFourSeven === undefined) db.guilds[guildId].twentyFourSeven = false;
    if (db.guilds[guildId].defaultVolume === undefined) db.guilds[guildId].defaultVolume = 100;
    if (db.guilds[guildId].autoplay === undefined) db.guilds[guildId].autoplay = false;
    
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
            djRoleId: null,
            twentyFourSeven: false,
            defaultVolume: 100,
            autoplay: false,
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

// User Playlists
function getUserPlaylists(userId) {
    const db = readDB();
    if (!db.users[userId]) {
        db.users[userId] = { playlists: {} };
        writeDB(db);
    }
    return db.users[userId].playlists || {};
}

function updateUserPlaylist(userId, playlistName, tracks) {
    const db = readDB();
    if (!db.users[userId]) {
        db.users[userId] = { playlists: {} };
    }
    if (!db.users[userId].playlists) {
        db.users[userId].playlists = {};
    }
    db.users[userId].playlists[playlistName] = tracks;
    writeDB(db);
    return db.users[userId].playlists[playlistName];
}

function deleteUserPlaylist(userId, playlistName) {
    const db = readDB();
    if (db.users[userId] && db.users[userId].playlists && db.users[userId].playlists[playlistName]) {
        delete db.users[userId].playlists[playlistName];
        writeDB(db);
        return true;
    }
    return false;
}

module.exports = {
    getGuildConfig,
    updateGuildConfig,
    getUserPlaylists,
    updateUserPlaylist,
    deleteUserPlaylist
};
