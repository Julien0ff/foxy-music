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
    let cleaned = title
        .replace(/\(.*?\)/g, '')           // Retire les parenthèses
        .replace(/\[.*?\]/g, '')           // Retire les crochets
        .replace(/【.*?】/g, '')           // Retire les crochets japonais
        .replace(/official\s*(music|lyric)?\s*(video|audio)?/gi, '')
        .replace(/lyrics?/gi, '')
        .replace(/audio/gi, '')
        .replace(/hq|hd|4k|8k/gi, '')
        .replace(/ft\.|feat\./gi, '')
        .replace(/[-_|]/g, ' ')            // Remplace les séparateurs par des espaces
        .replace(/\s{2,}/g, ' ')           // Normalise les espaces multiples
        .trim();
    return cleaned;
}

function extractArtistAndTitle(rawTitle) {
    // Essaie d'extraire "Artiste - Titre" ou "Titre - Artiste"
    const match = rawTitle.match(/^(.+?)\s*[-|–—]\s*(.+)$/);
    if (match) {
        return { artist: cleanTitle(match[1]), track: cleanTitle(match[2]) };
    }
    return { artist: '', track: cleanTitle(rawTitle) };
}

/**
 * Parse le format LRC en un tableau d'objets { time (ms), text }
 * Format LRC : [mm:ss.xx] Texte de la ligne
 */
function parseLrc(lrcText) {
    if (!lrcText) return [];
    const lines = [];
    let globalOffset = 0;

    // Check for [offset:+/-ms] tag
    const offsetMatch = lrcText.match(/\[offset:\s*([+-]?\d+)\]/i);
    if (offsetMatch) {
        globalOffset = parseInt(offsetMatch[1], 10) || 0;
    }

    const timestampRegex = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

    for (const rawLine of lrcText.split(/\r?\n/)) {
        const trimmed = rawLine.trim();
        if (!trimmed) continue;

        // Skip metadata tags like [ti:], [ar:], [al:], [by:], [offset:], [length:], etc.
        if (/^\[(ti|ar|al|by|offset|length|re|ve):/i.test(trimmed)) {
            continue;
        }

        const timestamps = [];
        let match;
        // Collect all timestamps on this line (supports repeated lines like [00:10.50][00:20.50]Chorus)
        while ((match = timestampRegex.exec(trimmed)) !== null) {
            const minutes = parseInt(match[1], 10);
            const seconds = parseInt(match[2], 10);
            let ms = 0;
            if (match[3]) {
                if (match[3].length === 1) ms = parseInt(match[3], 10) * 100;
                else if (match[3].length === 2) ms = parseInt(match[3], 10) * 10;
                else ms = parseInt(match[3].slice(0, 3), 10);
            }
            const time = (minutes * 60 + seconds) * 1000 + ms + globalOffset;
            timestamps.push(time);
        }
        timestampRegex.lastIndex = 0;

        const text = trimmed.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g, '').trim();

        if (text && timestamps.length > 0) {
            for (const t of timestamps) {
                if (t >= 0) {
                    lines.push({ time: t, text });
                }
            }
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
async function fetchLyrics(trackTitle, artistName = '', durationMs = 0) {
    let finalArtist = artistName;
    let finalTrack = trackTitle;

    if (!finalArtist) {
        const extracted = extractArtistAndTitle(trackTitle);
        if (extracted.artist) {
            finalArtist = extracted.artist;
            finalTrack = extracted.track;
        } else {
            finalTrack = cleanTitle(trackTitle);
        }
    } else {
        finalTrack = cleanTitle(trackTitle);
        finalArtist = cleanTitle(artistName);
    }

    const query = finalArtist ? `${finalTrack} ${finalArtist}` : finalTrack;
    
    // Timeout function to avoid hanging requests
    const fetchWithTimeout = (url, options, timeout = 3000) => {
        return Promise.race([
            fetch(url, options),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
        ]);
    };

    const headers = { 'User-Agent': 'Foxy Music Bot/2.1 (https://github.com/Julien0ff/foxy-music)' };

    try {
        let best = null;

        // 1. Essayer /api/get si on a l'artiste et le titre pour un match exact très rapide
        if (finalArtist && finalTrack) {
            // Try both orders: Artist - Track and Track - Artist
            for (const [a, t] of [[finalArtist, finalTrack], [finalTrack, finalArtist]]) {
                let getUrl = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(a)}&track_name=${encodeURIComponent(t)}`;
                if (durationMs > 0) getUrl += `&duration=${Math.round(durationMs / 1000)}`;
                try {
                    const getRes = await fetchWithTimeout(getUrl, { headers }, 1500);
                    if (getRes.ok) {
                        best = await getRes.json();
                        break;
                    }
                } catch (err) {}
            }
        }

        // 2. Si pas de match exact, utiliser la recherche libre
        if (!best) {
            const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
            const searchRes = await fetchWithTimeout(searchUrl, { headers }, 3000);
            
            if (searchRes.ok) {
                const results = await searchRes.json();
                if (results && results.length > 0) {
                    const targetSec = durationMs > 0 ? Math.round(durationMs / 1000) : 0;
                    const syncedResults = results.filter(r => !!r.syncedLyrics);

                    if (syncedResults.length > 0) {
                        if (targetSec > 0) {
                            syncedResults.sort((a, b) => Math.abs((a.duration || 0) - targetSec) - Math.abs((b.duration || 0) - targetSec));
                        }
                        best = syncedResults.find(r => r.trackName && r.trackName.toLowerCase().includes(finalTrack.toLowerCase()))
                            || syncedResults[0];
                    } else {
                        best = results.find(r => r.plainLyrics) || results[0];
                    }
                }
            }
        }

        if (!best) return null;

        return {
            title: best.trackName || finalTrack,
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

module.exports = { fetchLyrics, parseLrc, cleanTitle, extractArtistAndTitle };
