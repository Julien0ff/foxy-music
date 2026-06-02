const dns = require('node:dns');

/**
 * Parses playlist URLs (Spotify, Apple Music) and extracts track names/artists 
 * using public HTML embed pages without requiring any API keys.
 */
class PlaylistParser {
    /**
     * Parse a Spotify playlist URL using the public embed page
     * @param {string} url Spotify playlist URL
     * @returns {Promise<{name: string, tracks: Array<{title: string, artist: string, duration: number, artworkUrl: string}>}>}
     */
    static async parseSpotify(url) {
        const match = url.match(/playlist\/([a-zA-Z0-9]+)/);
        if (!match) throw new Error('Format de lien Spotify invalide.');
        const playlistId = match[1];

        // Use official Spotify Web API if credentials are provided in env
        if (process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET) {
            console.log('[PlaylistParser] Spotify credentials found. Using official Web API...');
            try {
                return await this.parseSpotifyOfficial(playlistId);
            } catch (err) {
                console.error('[PlaylistParser] Official Spotify API failed, falling back to scraper:', err.message);
            }
        }

        const embedUrl = `https://open.spotify.com/embed/playlist/${playlistId}`;
        console.log(`[PlaylistParser] Fetching Spotify embed: ${embedUrl}`);

        const res = await fetch(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!res.ok) throw new Error(`Impossible de récupérer la playlist Spotify (${res.status})`);
        const html = await res.text();

        // 1. Essayer d'extraire la balise script contenant le JSON initial-state ou resource
        let tracks = [];
        let playlistName = 'Spotify Playlist';

        const resourceMatch = html.match(/<script[^>]*id="resource"[^>]*>([\s\S]*?)<\/script>/i);
        if (resourceMatch) {
            try {
                const data = JSON.parse(resourceMatch[1].trim());
                playlistName = data.name || playlistName;
                if (data.tracks && data.tracks.items) {
                    tracks = data.tracks.items.map(item => {
                        const t = item.track;
                        if (!t) return null;
                        return {
                            title: t.name,
                            artist: t.artists ? t.artists.map(a => a.name).join(', ') : 'Unknown Artist',
                            duration: t.duration_ms || 0,
                            artworkUrl: t.album && t.album.images && t.album.images[0] ? t.album.images[0].url : null,
                            isImported: true
                        };
                    }).filter(Boolean);
                }
            } catch (e) {
                console.error('[PlaylistParser] Failed to parse Spotify resource JSON:', e.message);
            }
        }

        // 2. Si vide, essayer initial-state
        if (tracks.length === 0) {
            const stateMatch = html.match(/<script[^>]*id="initial-state"[^>]*>([\s\S]*?)<\/script>/i);
            if (stateMatch) {
                try {
                    const decodedJson = Buffer.from(stateMatch[1].trim(), 'base64').toString('utf-8');
                    const data = JSON.parse(decodedJson);
                    // Search in initial-state structure
                    // Dependending on the embed version, it might be in different subkeys
                    console.log('[PlaylistParser] Parsed initial-state JSON successfully.');
                } catch (e) {
                    // Not base64, try simple parse
                    try {
                        const data = JSON.parse(stateMatch[1].trim());
                        // try to extract tracks
                    } catch (_) {}
                }
            }
        }

        // 3. Fallback d'extraction d'urgence par expression régulière des données de piste
        if (tracks.length === 0) {
            // Dans les versions récentes d'embed Spotify, les pistes sont souvent injectées dans un bloc JSON global
            const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
            if (nextDataMatch) {
                try {
                    const data = JSON.parse(nextDataMatch[1].trim());
                    const playlistData = data.props?.pageProps?.state?.playlist || data.props?.pageProps?.playlistData;
                    if (playlistData) {
                        playlistName = playlistData.name || playlistName;
                        const items = playlistData.tracks?.items || playlistData.tracks || [];
                        tracks = items.map(item => {
                            const t = item.track || item;
                            if (!t || !t.name) return null;
                            return {
                                title: t.name,
                                artist: t.artists ? t.artists.map(a => a.name).join(', ') : 'Unknown Artist',
                                duration: t.duration_ms || 0,
                                artworkUrl: t.album?.images?.[0]?.url || null,
                                isImported: true
                            };
                        }).filter(Boolean);
                    }
                } catch (e) {
                    console.error('[PlaylistParser] Failed to parse __NEXT_DATA__ JSON:', e.message);
                }
            }
        }

        // 4. Fallback d'extraction d'urgence par expression régulière des balises HTML directes
        if (tracks.length === 0) {
            console.log('[PlaylistParser] Using HTML tags regex fallback parser for Spotify embed...');
            
            // Extraction du nom de la playlist
            const playlistNameMatch = html.match(/class="[^"]*CondensedMetadata_title[^"]*"[^>]*>[\s\S]*?<span[^>]*>([^<]+)<\/span>/i) ||
                                      html.match(/class="[^"]*CondensedMetadata_title[^"]*"[^>]*>[\s\S]*?([^<]+)<\/span>/i) ||
                                      html.match(/class="[^"]*CondensedMetadata_title[^"]*"[^>]*>([^<]+)/i);
            if (playlistNameMatch) {
                playlistName = playlistNameMatch[1].trim();
            } else {
                const fallbackTitleMatch = html.match(/CondensedMetadata_title[^>]*>([\s\S]*?)<\/div>/i);
                if (fallbackTitleMatch) {
                    const stripped = fallbackTitleMatch[1].replace(/<[^>]*>/g, '').trim();
                    if (stripped) playlistName = stripped;
                }
            }

            // Découpage par ligne de file d'attente (TracklistRow)
            const rowSplit = html.split(/class="[^"]*TracklistRow_trackListRow[^"]*"/gi);
            if (rowSplit.length > 1) {
                for (let i = 1; i < rowSplit.length; i++) {
                    const rowHtml = rowSplit[i].split(/<li/i)[0]; // Isole la ligne courante
                    
                    const titleMatch = rowHtml.match(/class="[^"]*TracklistRow_title[^"]*"[^>]*>([\s\S]*?)<\/(?:h3|span|div)>/i);
                    const artistMatch = rowHtml.match(/class="[^"]*TracklistRow_subtitle[^"]*"[^>]*>([\s\S]*?)<\/(?:h4|span|div)>/i);
                    const durationMatch = rowHtml.match(/class="[^"]*TracklistRow_durationCell[^"]*"[^>]*>([\s\S]*?)<\/(?:div|span)>/i);

                    if (titleMatch) {
                        const title = titleMatch[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
                        const artist = artistMatch ? artistMatch[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim() : 'Unknown Artist';
                        
                        let durationMs = 180000;
                        if (durationMatch) {
                            const durStr = durationMatch[1].replace(/<[^>]*>/g, '').trim();
                            const parts = durStr.split(':');
                            if (parts.length === 2) {
                                durationMs = (parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10)) * 1000;
                            } else if (parts.length === 3) {
                                durationMs = (parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10)) * 1000;
                            }
                        }

                        tracks.push({
                            title,
                            artist,
                            duration: durationMs,
                            artworkUrl: null,
                            isImported: true
                        });
                    }
                }
            }
        }

        if (tracks.length === 0) {
            throw new Error('Aucune piste n\'a pu être extraite de la playlist Spotify publique.');
        }

        console.log(`[PlaylistParser] Spotify playlist "${playlistName}" parsed with ${tracks.length} tracks.`);
        return { name: playlistName, tracks };
    }

    /**
     * Parse a Spotify playlist using the official Web API
     */
    static async parseSpotifyOfficial(playlistId) {
        const clientId = process.env.SPOTIFY_CLIENT_ID;
        const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
        
        // 1. Get Client Credentials token
        const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(clientId + ':' + clientSecret).toString('base64')
            },
            body: 'grant_type=client_credentials'
        });

        if (!tokenRes.ok) {
            throw new Error(`Failed to get Spotify access token (status: ${tokenRes.status})`);
        }

        const tokenData = await tokenRes.json();
        const accessToken = tokenData.access_token;

        // 2. Fetch playlist details (with track paging)
        let tracks = [];
        let playlistName = 'Spotify Playlist';
        let nextUrl = `https://api.spotify.com/v1/playlists/${playlistId}`;

        // Retrieve the playlist name first
        const playlistRes = await fetch(nextUrl, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (!playlistRes.ok) {
            throw new Error(`Spotify API returned status ${playlistRes.status} for playlist fetch`);
        }

        const playlistData = await playlistRes.json();
        playlistName = playlistData.name || playlistName;

        // Paging tracks loop to get all songs (Spotify returns 100 tracks max per page)
        let tracksPage = playlistData.tracks;
        while (tracksPage) {
            const items = tracksPage.items || [];
            for (const item of items) {
                const t = item.track;
                if (!t || !t.name) continue;
                tracks.push({
                    title: t.name,
                    artist: t.artists ? t.artists.map(a => a.name).join(', ') : 'Unknown Artist',
                    duration: t.duration_ms || 0,
                    artworkUrl: t.album?.images?.[0]?.url || null,
                    isImported: true
                });
            }
            
            if (tracksPage.next) {
                const nextPageRes = await fetch(tracksPage.next, {
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (nextPageRes.ok) {
                    tracksPage = await nextPageRes.json();
                } else {
                    tracksPage = null;
                }
            } else {
                tracksPage = null;
            }
        }

        if (tracks.length === 0) {
            throw new Error('No tracks found in the Spotify playlist via Web API');
        }

        console.log(`[PlaylistParser] Spotify playlist "${playlistName}" parsed via Web API with ${tracks.length} tracks.`);
        return { name: playlistName, tracks };
    }

    /**
     * Parse an Apple Music playlist URL using the public embed page
     * @param {string} url Apple Music playlist URL
     * @returns {Promise<{name: string, tracks: Array<{title: string, artist: string, duration: number, artworkUrl: string}>}>}
     */
    static async parseAppleMusic(url) {
        // Match pl.[a-zA-Z0-9-]+
        const plMatch = url.match(/pl\.([a-zA-Z0-9-]+)/);
        if (!plMatch) throw new Error('Format de lien Apple Music invalide (ID pl. requis).');
        const playlistId = plMatch[0];

        // Format embed url: https://embed.music.apple.com/fr/playlist/pl.playlistId
        // We'll target /fr/ or /us/ but /us/ is universal
        const embedUrl = `https://embed.music.apple.com/us/playlist/${playlistId}`;
        console.log(`[PlaylistParser] Fetching Apple Music embed: ${embedUrl}`);

        const res = await fetch(embedUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        if (!res.ok) throw new Error(`Impossible de récupérer la playlist Apple Music (${res.status})`);
        const html = await res.text();

        let tracks = [];
        let playlistName = 'Apple Music Playlist';

        // 1. Rechercher bootstrap-data JSON
        const bootstrapMatch = html.match(/<script[^>]*id="bootstrap-data"[^>]*>([\s\S]*?)<\/script>/i);
        if (bootstrapMatch) {
            try {
                const data = JSON.parse(bootstrapMatch[1].trim());
                // In Apple Music Embed bootstrap-data:
                // Tracks are usually inside data.songList or data.relationships.tracks.data
                const songs = data.songs || [];
                if (songs.length > 0) {
                    tracks = songs.map(s => {
                        const attrs = s.attributes || {};
                        return {
                            title: attrs.name || 'Unknown Title',
                            artist: attrs.artistName || 'Unknown Artist',
                            duration: attrs.durationInMillis || 0,
                            artworkUrl: attrs.artwork?.url ? attrs.artwork.url.replace('{w}', '300').replace('{h}', '300') : null,
                            isImported: true
                        };
                    });
                }
            } catch (e) {
                console.error('[PlaylistParser] Failed to parse Apple Music bootstrap JSON:', e.message);
            }
        }

        // 2. Fallback: parse __NEXT_DATA__ or index-data
        if (tracks.length === 0) {
            const scriptDataMatch = html.match(/<script[^>]*id="index-data"[^>]*>([\s\S]*?)<\/script>/i);
            if (scriptDataMatch) {
                try {
                    const data = JSON.parse(scriptDataMatch[1].trim());
                    // Extract songs
                    const songs = data.songs || [];
                    if (songs.length > 0) {
                        tracks = songs.map(s => {
                            const attrs = s.attributes || {};
                            return {
                                title: attrs.name || 'Unknown Title',
                                artist: attrs.artistName || 'Unknown Artist',
                                duration: attrs.durationInMillis || 0,
                                artworkUrl: attrs.artwork?.url ? attrs.artwork.url.replace('{w}', '300').replace('{h}', '300') : null,
                                isImported: true
                            };
                        });
                    }
                } catch (_) {}
            }
        }

        // 3. Fallback direct regex matching on structured metadata if JSON scripts failed
        if (tracks.length === 0) {
            // Apple music songs often appear as JSON items inside the HTML content
            const schemaMatch = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi);
            if (schemaMatch) {
                for (const scriptTag of schemaMatch) {
                    try {
                        const content = scriptTag.replace(/<script[^>]*>/i, '').replace(/<\/script>/i, '').trim();
                        const schema = JSON.parse(content);
                        if (schema['@type'] == 'MusicPlaylist' || schema['@type'] == 'MusicAlbum') {
                            playlistName = schema.name || playlistName;
                            const items = schema.track?.itemListElement || schema.tracks || [];
                            tracks = items.map(item => {
                                const song = item.item || item;
                                if (!song || song['@type'] !== 'MusicRecording') return null;
                                return {
                                    title: song.name,
                                    artist: song.byArtist?.name || 'Unknown Artist',
                                    duration: 180000, // Default 3min if missing
                                    artworkUrl: song.image || null,
                                    isImported: true
                                };
                            }).filter(Boolean);
                        }
                    } catch (_) {}
                }
            }
        }

        if (tracks.length === 0) {
            throw new Error('Aucune piste n\'a pu être extraite de la playlist Apple Music publique.');
        }

        console.log(`[PlaylistParser] Apple Music playlist "${playlistName}" parsed with ${tracks.length} tracks.`);
        return { name: playlistName, tracks };
    }

    /**
     * Generic parser router based on URL
     * @param {string} url Playlist URL
     * @returns {Promise<{name: string, tracks: Array<{title: string, artist: string, duration: number, artworkUrl: string}>}>}
     */
    static async parse(url) {
        if (url.includes('spotify.com') || url.includes('spotify.link')) {
            return this.parseSpotify(url);
        } else if (url.includes('music.apple.com')) {
            return this.parseAppleMusic(url);
        } else {
            throw new Error('Type de playlist non supporté (Spotify et Apple Music uniquement).');
        }
    }
}

module.exports = PlaylistParser;
