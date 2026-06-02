import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, Music, Repeat, Mic, MicOff, Search, Loader2 } from 'lucide-react';
import { API_URL } from '../config';

// Helper to extract YouTube video ID
const getYoutubeThumbnail = (url) => {
  if (!url) return null;
  const match = url.match(/(?:v=|youtu\.be\/)([^&?]+)/);
  if (match && match[1]) return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
  return null;
};

/**
 * Nettoie un titre pour la recherche de paroles (retire les parasites YouTube)
 */
function cleanForSearch(str) {
  if (!str) return '';
  return str
    .replace(/\(.*?\)/g, '')   // (Official Video), (Lyrics), etc.
    .replace(/\[.*?\]/g, '')   // [HD], [4K], etc.
    .replace(/【.*?】/g, '')    // crochets japonais
    .replace(/official\s*(music)?\s*(video|audio|lyric)/gi, '')
    .replace(/\blyrics?\b/gi, '')
    .replace(/\bft\.?\s+|\bfeat\.?\s+/gi, '')
    .replace(/\bhq\b|\bhd\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Parse le format LRC en tableau [{ time (ms), text }]
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
    const ms = parseInt(match[3].padEnd(3, '0'), 10);
    const time = (minutes * 60 + seconds) * 1000 + ms;
    const text = match[4].trim();
    if (text) lines.push({ time, text });
  }
  return lines.sort((a, b) => a.time - b.time);
}

/**
 * Recherche les paroles directement depuis le navigateur via LrcLib
 * Essaie d'abord avec artiste+titre séparés, puis avec le titre complet.
 */
async function fetchLyricsClient(trackTitle) {
  if (!trackTitle) return null;
  const LRCLIB = 'https://lrclib.net/api';
  const HEADERS = { 'User-Agent': 'Foxy Music Dashboard (https://github.com/Julien0ff/foxy-music)' };

  // Sépare "Artiste - Titre" si le tiret est présent
  let artist = '';
  let title;
  const dashIdx = trackTitle.indexOf(' - ');
  if (dashIdx !== -1) {
    artist = cleanForSearch(trackTitle.slice(0, dashIdx));
    title  = cleanForSearch(trackTitle.slice(dashIdx + 3));
  } else {
    title = cleanForSearch(trackTitle);
  }

  // Tentative 1 : recherche structurée avec artiste séparé
  if (artist) {
    try {
      const r = await fetch(`${LRCLIB}/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`, { headers: HEADERS });
      if (r.ok) {
        const results = await r.json();
        const best = results.find(x => x.syncedLyrics) || results.find(x => x.plainLyrics);
        if (best) return {
          title: best.trackName || title,
          artist: best.artistName || artist,
          plain: best.plainLyrics || null,
          synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : []
        };
      }
    } catch { /* ignore */ }
  }

  // Tentative 2 : recherche texte libre avec titre nettoyé
  const query = artist ? `${artist} ${title}` : title;
  try {
    const r = await fetch(`${LRCLIB}/search?q=${encodeURIComponent(query)}`, { headers: HEADERS });
    if (r.ok) {
      const results = await r.json();
      const best = results.find(x => x.syncedLyrics) || results.find(x => x.plainLyrics);
      if (best) return {
        title: best.trackName || title,
        artist: best.artistName || artist,
        plain: best.plainLyrics || null,
        synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : []
      };
    }
  } catch { /* ignore */ }

  return null;
}

function formatTime(ms) {
  if (!ms || isNaN(ms)) return '0:00';
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Lyrics display component (Apple Music style)
function LyricsView({ lyrics, currentTimeMs, onSeek, isLoading }) {
  const containerRef = useRef(null);
  const activeLineRef = useRef(null);

  // Find the index of the currently active lyric line safely
  const activeIndex = (lyrics && lyrics.synced && lyrics.synced.length > 0)
    ? lyrics.synced.reduce((prev, line, i) => line.time <= currentTimeMs ? i : prev, -1)
    : -1;

  // Smooth auto-scroll to keep the active line centered
  useEffect(() => {
    if (activeLineRef.current && containerRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  if (isLoading) {
    return (
      <div className="lyrics-container lyrics-loading">
        <div className="lyrics-spinner" />
        <p>Recherche des paroles...</p>
      </div>
    );
  }

  const hasNoLyrics = !lyrics || (!lyrics.plain && (!lyrics.synced || lyrics.synced.length === 0));

  if (hasNoLyrics) {
    return (
      <div className="lyrics-container lyrics-empty">
        <Mic size={40} opacity={0.3} />
        <p>Aucune parole trouvée pour cette musique.</p>
      </div>
    );
  }

  // Synced lyrics view
  if (lyrics.synced && lyrics.synced.length > 0) {
    return (
      <div className="lyrics-container" ref={containerRef}>
        <div className="lyrics-padding-top" />
        {lyrics.synced.map((line, i) => {
          const isPast = i < activeIndex;
          const isActive = i === activeIndex;
          const isFuture = i > activeIndex;
          return (
            <div
              key={i}
              ref={isActive ? activeLineRef : null}
              className={`lyrics-line ${isActive ? 'lyrics-active' : ''} ${isPast ? 'lyrics-past' : ''} ${isFuture ? 'lyrics-future' : ''}`}
              onClick={() => onSeek && onSeek(line.time)}
            >
              {line.text}
            </div>
          );
        })}
        <div className="lyrics-padding-bottom" />
      </div>
    );
  }

  // Plain lyrics fallback
  return (
    <div className="lyrics-container lyrics-plain">
      {(lyrics.plain || '').split('\n').map((line, i) => (
        <div key={i} className={`lyrics-line ${!line.trim() ? 'lyrics-blank' : ''}`}>
          {line || '\u00A0'}
        </div>
      ))}
    </div>
  );
}

export default function Player({ guildId, currentTrack, isPlaying, serverPosition, duration, volume, loop, setQueueState, onLyricsToggle, tracks }) {
  const [localProgress, setLocalProgress] = useState(0);
  const [lastSyncPos, setLastSyncPos] = useState(serverPosition);
  const [lastTrackUrl, setLastTrackUrl] = useState(currentTrack?.url);
  const [animateCover, setAnimateCover] = useState(false);

  // Lyrics state
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsTrackUrl, setLyricsTrackUrl] = useState(null);
  const [lyricsOffset, setLyricsOffset] = useState(0); // Offset in seconds (+/-)

  // Expandable Search in Lyrics state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef(null);

  const handleSearchSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/guilds/${guildId}/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: searchQuery.trim() })
      });

      const data = await res.json();
      if (data.success) {
        setSearchQuery('');
        setSearchExpanded(false);
      } else {
        alert(data.error || 'Erreur lors de la recherche');
      }
    } catch (e) {
      console.error(e);
      alert('Erreur réseau');
    } finally {
      setSearchLoading(false);
    }
  };

  const toggleSearch = () => {
    if (searchExpanded) {
      if (searchQuery.trim()) {
        handleSearchSubmit();
      } else {
        setSearchExpanded(false);
      }
    } else {
      setSearchExpanded(true);
      setTimeout(() => {
        if (searchInputRef.current) searchInputRef.current.focus();
      }, 50);
    }
  };

  // Derive state from props during render (avoids cascading renders from useEffect)
  if (serverPosition !== lastSyncPos) {
    setLastSyncPos(serverPosition);
    setLocalProgress(serverPosition || 0);
  }

  // Réinitialiser la barre de progression instantanément lors d'un changement de musique
  if (currentTrack?.url !== lastTrackUrl) {
    setLastTrackUrl(currentTrack?.url);
    setLocalProgress(serverPosition || 0);
    setAnimateCover(true);
    setLyricsOffset(0); // Reset sync offset on song change
    // Invalide les paroles chargées si la piste change
    if (lyricsTrackUrl !== currentTrack?.url) {
      setLyrics(null);
      setLyricsTrackUrl(null);
    }
  }

  // Local timer to keep the progress bar smooth without polling the server every second
  useEffect(() => {
    let interval;
    if (isPlaying && currentTrack) {
      interval = setInterval(() => {
        setLocalProgress(p => {
            const next = p + 50;
            return duration > 0 ? Math.min(next, duration) : next;
        });
      }, 50);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentTrack, duration]);

  // Réinitialiser l'animation de transition de couverture
  useEffect(() => {
    if (animateCover) {
      const timer = setTimeout(() => setAnimateCover(false), 600);
      return () => clearTimeout(timer);
    }
  }, [animateCover]);

  // Charger les paroles quand on active le mode paroles
  useEffect(() => {
    if (showLyrics && currentTrack && lyricsTrackUrl !== currentTrack.url) {
      let active = true;

      // Planifier les mises à jour d'état de manière asynchrone pour éviter les rendus en cascade
      Promise.resolve().then(() => {
        if (active) {
          setLyricsLoading(true);
          setLyrics(null);
        }
      });

      fetchLyricsClient(currentTrack.title)
        .then(data => {
          if (active) {
            setLyrics(data);
            setLyricsTrackUrl(currentTrack.url);
          }
        })
        .catch(() => {
          if (active) setLyrics(null);
        })
        .finally(() => {
          if (active) setLyricsLoading(false);
        });

      return () => {
        active = false;
      };
    }
  }, [showLyrics, currentTrack, guildId, lyricsTrackUrl]);

  // Notifier App.jsx du changement de mode paroles
  useEffect(() => {
    if (onLyricsToggle) onLyricsToggle(showLyrics);
  }, [showLyrics, onLyricsToggle]);

  const handlePauseResume = async () => {
    if (!currentTrack) return;
    const action = isPlaying ? 'pause' : 'resume';
    try {
      const res = await fetch(`${API_URL}/api/guilds/${guildId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setQueueState(prev => ({ ...prev, isPlaying: data.isPlaying }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSkip = async () => {
    if (!currentTrack) return;
    try {
      await fetch(`${API_URL}/api/guilds/${guildId}/skip`, { method: 'POST' });
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoop = async () => {
    if (!currentTrack) return;
    try {
      const res = await fetch(`${API_URL}/api/guilds/${guildId}/loop`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setQueueState(prev => ({ ...prev, loop: data.loop }));
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleVolumeChange = async (e) => {
    const newVol = parseInt(e.target.value);
    setQueueState(prev => ({ ...prev, volume: newVol }));
    try {
      await fetch(`${API_URL}/api/guilds/${guildId}/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume: newVol })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSeek = useCallback(async (timeMs) => {
    try {
      await fetch(`${API_URL}/api/guilds/${guildId}/seek`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: timeMs })
      });
      setLocalProgress(timeMs);
    } catch (e) {
      console.error('[Seek]', e);
    }
  }, [guildId]);

  const handleLyricsToggle = () => {
    setShowLyrics(prev => !prev);
  };

  const thumbnail = currentTrack?.artworkUrl || getYoutubeThumbnail(currentTrack?.url);
  const progressPercent = duration > 0 ? Math.min(100, (localProgress / duration) * 100) : 0;

  return (
    <div className={`player-container ${showLyrics ? 'player-lyrics-mode' : ''}`}>
      {/* Left side: Player */}
      <div className="player-main">
        <div className="artwork-wrapper">
          {thumbnail ? (
            <img src={thumbnail} alt="Cover" className={`artwork ${currentTrack ? '' : 'idle'} ${animateCover ? 'track-transition' : ''}`} />
          ) : (
            <div className={`artwork ${currentTrack ? '' : 'idle'} ${animateCover ? 'track-transition' : ''}`} style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Music size={80} color="white" opacity={0.5} />
            </div>
          )}
        </div>

        <div className="track-info">
          <h2 className="track-title">{currentTrack ? currentTrack.title : 'Aucune musique'}</h2>
          <p className="track-artist">{currentTrack ? 'Foxy Music Bot' : 'En attente...'}</p>
        </div>

        <div className="progress-section" style={{ width: '100%', maxWidth: 'min(100%, 45vh)', marginTop: '12px' }}>
          <div className="progress-container">
            <div className="progress-bar" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <div className="time-info">
            <span>{currentTrack ? formatTime(localProgress) : '0:00'}</span>
            <span>{currentTrack && duration > 0 ? formatTime(duration) : '0:00'}</span>
          </div>
        </div>

        <div className="controls">
          <button
            className={`control-btn loop-btn ${loop ? 'active-loop' : ''}`}
            onClick={handleLoop}
            disabled={!currentTrack}
            title={loop ? "Désactiver la boucle" : "Activer la boucle"}
          >
             <Repeat size={24} />
          </button>
          <button className="control-btn play-pause-btn" onClick={handlePauseResume} disabled={!currentTrack}>
            {isPlaying ? <Pause size={32} /> : <Play size={32} style={{ marginLeft: '4px' }} />}
          </button>
          <button className="control-btn" onClick={handleSkip} disabled={!currentTrack}>
            <SkipForward size={28} />
          </button>
          <button
            className={`control-btn lyrics-btn ${showLyrics ? 'active-lyrics' : ''}`}
            onClick={handleLyricsToggle}
            disabled={!currentTrack}
            title={showLyrics ? "Masquer les paroles" : "Afficher les paroles"}
          >
            {showLyrics ? <MicOff size={22} /> : <Mic size={22} />}
          </button>
        </div>

        <div className="volume-control">
          <span style={{ fontSize: '12px', fontWeight: 'bold' }}>VOL</span>
          <input
            type="range"
            min="10"
            max="200"
            step="10"
            value={volume || 100}
            onChange={handleVolumeChange}
            className="volume-slider"
            disabled={!currentTrack}
          />
          <span style={{ fontSize: '12px', width: '30px' }}>{volume || 100}%</span>
        </div>
      </div>

      {/* Right side: Lyrics Panel */}
      {showLyrics && (
        <div className="lyrics-panel">
          <div className="lyrics-top-bar">
            {lyrics ? (
              <div className="lyrics-panel-header">
                <span className="lyrics-panel-track">{lyrics.title}</span>
                {lyrics.artist && <span className="lyrics-panel-artist">{lyrics.artist}</span>}
              </div>
            ) : (
              <div className="lyrics-panel-header-empty" />
            )}

            <div className="lyrics-top-controls">
              {/* Lyrics Offset timing tuner */}
              {lyrics && lyrics.synced && lyrics.synced.length > 0 && (
                <div className="lyrics-sync-tuner">
                  <button 
                    className="lyrics-sync-btn"
                    onClick={() => setLyricsOffset(prev => prev - 0.5)}
                    title="Avancer les paroles (-0.5s)"
                  >
                    -
                  </button>
                  <span className="lyrics-sync-value">
                    {lyricsOffset === 0 ? 'Synchro : 0s' : `Synchro : ${lyricsOffset > 0 ? '+' : ''}${lyricsOffset}s`}
                  </span>
                  <button 
                    className="lyrics-sync-btn"
                    onClick={() => setLyricsOffset(prev => prev + 0.5)}
                    title="Retarder les paroles (+0.5s)"
                  >
                    +
                  </button>
                </div>
              )}

              {/* Expandable Search Button */}
              <div className={`lyrics-search-wrapper ${searchExpanded ? 'expanded' : ''}`}>
                <form onSubmit={handleSearchSubmit} className="lyrics-search-form">
                  <input
                    type="text"
                    placeholder="Rechercher ou coller un lien..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    disabled={searchLoading}
                    className="lyrics-search-input"
                    ref={searchInputRef}
                  />
                  <button type="button" onClick={toggleSearch} className="lyrics-search-btn" disabled={searchLoading}>
                    {searchLoading ? <Loader2 size={18} className="search-spinner" /> : <Search size={18} />}
                  </button>
                </form>
              </div>

              {/* Next Track in Queue */}
              {tracks && tracks[0] && (
                <div className="lyrics-next-track" title={`Suivant : ${tracks[0].title}`}>
                  <span className="next-label">SUIVANT</span>
                  <span className="next-title">{tracks[0].title}</span>
                </div>
              )}
            </div>
          </div>
          <LyricsView
            lyrics={lyrics}
            currentTimeMs={localProgress + (lyricsOffset * 1000)}
            onSeek={handleSeek}
            isLoading={lyricsLoading}
          />
        </div>
      )}
    </div>
  );
}
