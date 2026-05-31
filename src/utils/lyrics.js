/**
 * Utilitaire de récupération de paroles via LrcLib.net (API gratuite, sans clé)
 * Supporte les paroles synchronisées (LRC) et plain-text.
 */

/**
 * Nettoie le titre d'une musique YouTube pour améliorer la recherche
 * Ex: "SOLEIL - Charlie Winston (Official Video)" -> "SOLEIL Charlie Winston"
 */
function cleanTitle(title) {
    if (!title) return '';
    return title
        .replace(/\(.*?\)/g, '')           // Retire les parenthèses
        .replace(/\[.*?\]/g, '')           // Retire les crochets
        .replace(/【.*?】/g, '')           // Retire les crochets japonais
        .replace(/official\s*(music)?\s*video/gi, '')
        .replace(/lyrics?/gi, '')
        .replace(/audio/gi, '')
        .replace(/hq|hd/gi, '')
        .replace(/ft\.|feat\./gi, '')
        .replace(/[-_|]/g, ' ')            // Remplace les séparateurs par des espaces
        .replace(/\s{2,}/g, ' ')           // Normalise les espaces multiples
        .trim();
}

/**
 * Parse le format LRC en un tableau d'objets { time (ms), text }
 * Format LRC : [mm:ss.xx] Texte de la ligne
 */
function parseLrc(lrcText) {
    if (!lrcText) return [];
    const lines = [];
    const lineRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

    for (const rawLine of lrcText.split('\n')) {
        const match = rawLine.match(lineRegex);
        if (!match) continue;
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const centiseconds = parseInt(match[3].padEnd(3, '0'), 10); // Normalise 2 ou 3 chiffres en ms
        const time = (minutes * 60 + seconds) * 1000 + centiseconds;
        const text = match[4].trim();
        if (text) {
            lines.push({ time, text });
        }
    }
    return lines.sort((a, b) => a.time - b.time);
}

/**
 * Recherche des paroles pour un titre donné.
 * Retourne un objet { title, artist, plain, synced }
 * - plain: string de paroles brutes (non synchronisées)
 * - synced: tableau [{ time: ms, text: string }] (vide si non dispo)
 */
async function fetchLyrics(trackTitle, artistName = '') {
    const cleanedTitle = cleanTitle(trackTitle);
    const query = artistName ? `${cleanedTitle} ${artistName}` : cleanedTitle;

    try {
        // 1. Essayer la recherche par texte libre
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
        const searchRes = await fetch(searchUrl, {
            headers: { 'User-Agent': 'Foxy Music Bot/2.1 (https://github.com/Julien0ff/foxy-music)' }
        });

        if (!searchRes.ok) return null;
        const results = await searchRes.json();
        if (!results || results.length === 0) return null;

        // Prendre le premier résultat avec les paroles les plus longues
        const best = results.find(r => r.syncedLyrics) || results.find(r => r.plainLyrics) || results[0];
        if (!best) return null;

        return {
            title: best.trackName || cleanedTitle,
            artist: best.artistName || '',
            album: best.albumName || '',
            duration: best.duration || 0,
            plain: best.plainLyrics || null,
            synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : []
        };

    } catch (e) {
        console.error('[Lyrics] Erreur lors de la récupération des paroles:', e.message);
        return null;
    }
}

module.exports = { fetchLyrics, parseLrc, cleanTitle };
