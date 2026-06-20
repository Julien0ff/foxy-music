import { useState, useEffect, useRef, useCallback } from 'react';
import { Repeat, Music, Mic, MicOff, Search, Loader2 } from 'lucide-react';
import { API_URL } from '../config';

// Helper to extract YouTube video ID
const getYoutubeThumbnail = (url) => {
  if (!url) return null;
  const match = url.match(/(?:v=|youtu\.be\/)([^&?]+)/);
  if (match && match[1]) return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
  return null;
};

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

  // Expandable Search in Lyrics state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef(null);
  const volumeDebounceRef = useRef(null);

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

      fetch(`${API_URL}/api/guilds/${guildId}/lyrics`)
        .then(res => res.json())
        .then(data => {
          if (active) {
            if (!data.error) {
              setLyrics(data);
            } else {
              setLyrics(null);
            }
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

  const handleVolumeChange = (e) => {
    const newVol = parseInt(e.target.value);
    setQueueState(prev => ({ ...prev, volume: newVol }));
    
    if (volumeDebounceRef.current) {
      clearTimeout(volumeDebounceRef.current);
    }
    
    volumeDebounceRef.current = setTimeout(async () => {
      try {
        await fetch(`${API_URL}/api/guilds/${guildId}/volume`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ volume: newVol })
        });
      } catch (e) {
        console.error(e);
      }
    }, 250);
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
          
          <button 
            className="control-btn" 
            onClick={() => handleSeek(0)} 
            disabled={!currentTrack}
            title="Recommencer au début"
          >
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M12 2.5a9.5 9.5 0 1 0 9.5 9.5h-2a7.5 7.5 0 1 1-7.5-7.5v3l4.5-4-4.5-4v3Z"/></svg>
          </button>

          <button className="control-btn play-pause-btn" onClick={handlePauseResume} disabled={!currentTrack}>
            {isPlaying ? (
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="32" height="32" fill="currentColor" style={{ marginLeft: '2px' }}><path d="M8 5v14l11-7z"/></svg>
            )}
          </button>

          <button className="control-btn" onClick={handleSkip} disabled={!currentTrack}>
            <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
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
              <div className={`lyrics-search-wrapper ${searchExpanded ? 'expanded' : ''}`}>
                <form onSubmit={handleSearchSubmit} className="lyrics-search-form">
                  <input
                    type="text"
                    placeholder="Ex: Titre - Artiste..."
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
            currentTimeMs={localProgress}
            onSeek={handleSeek}
            isLoading={lyricsLoading}
          />
        </div>
      )}
    </div>
  );
}
