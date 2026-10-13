import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, 
  Pause, 
  SkipForward, 
  SkipBack, 
  Repeat, 
  Music, 
  Mic, 
  MicOff, 
  Search, 
  Loader2,
  Sparkles
} from 'lucide-react';
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

// Lyrics display component (Cider / Apple Music Sing visual aesthetics & kinetics)
function LyricsView({ lyrics, currentTimeMs, onSeek, isLoading, artworkUrl }) {
  const containerRef = useRef(null);
  const activeLineRef = useRef(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const isAutoScrolling = useRef(false);
  const userScrollTimeoutRef = useRef(null);

  // Find the index of currently active lyric line
  const activeIndex = (lyrics && lyrics.synced && lyrics.synced.length > 0)
    ? lyrics.synced.reduce((prev, line, i) => line.time <= currentTimeMs ? i : prev, -1)
    : -1;

  // Progressive Karaoke line fill (sweeps across words like Apple Music / Cider)
  let activeLineProgress = 0;
  if (activeIndex >= 0 && lyrics?.synced?.[activeIndex]) {
    const curTime = lyrics.synced[activeIndex].time;
    const nextLine = lyrics.synced[activeIndex + 1];
    const endTime = nextLine ? nextLine.time : (curTime + 4500);
    const lineDuration = Math.max(500, endTime - curTime);
    activeLineProgress = Math.min(1, Math.max(0, (currentTimeMs - curTime) / lineDuration));
  }

  // Smooth spring auto-scroll centering active line at ~38% viewport height (golden ratio)
  const scrollToActive = useCallback((smooth = true) => {
    if (!containerRef.current || !activeLineRef.current) return;
    const container = containerRef.current;
    const activeEl = activeLineRef.current;
    const containerHeight = container.clientHeight;
    const targetScroll = activeEl.offsetTop - (containerHeight * 0.38) + (activeEl.clientHeight / 2);

    isAutoScrolling.current = true;
    container.scrollTo({
      top: Math.max(0, targetScroll),
      behavior: smooth ? 'smooth' : 'auto',
    });
    setTimeout(() => {
      isAutoScrolling.current = false;
    }, 450);
  }, []);

  // When activeIndex changes, center smoothly if user isn't exploring lyrics
  useEffect(() => {
    if (!isUserScrolling && activeIndex >= 0) {
      scrollToActive(true);
    }
  }, [activeIndex, isUserScrolling, scrollToActive]);

  // Handle user manual scroll: temporarily detach auto-sync and show floating resume button
  const handleScroll = () => {
    if (isAutoScrolling.current) return;
    setIsUserScrolling(true);
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    userScrollTimeoutRef.current = setTimeout(() => {
      setIsUserScrolling(false);
    }, 4500);
  };

  const handleManualResync = () => {
    setIsUserScrolling(false);
    if (userScrollTimeoutRef.current) clearTimeout(userScrollTimeoutRef.current);
    scrollToActive(true);
  };

  if (isLoading) {
    return (
      <div className="lyrics-container lyrics-loading">
        <div className="cider-aura-wrapper" aria-hidden="true">
          <div className="cider-aura-blob blob-1" style={artworkUrl ? { backgroundImage: `url(${artworkUrl})` } : undefined} />
          <div className="cider-aura-blob blob-2" style={artworkUrl ? { backgroundImage: `url(${artworkUrl})` } : undefined} />
          <div className="cider-aura-blob blob-3" />
        </div>
        <div className="lyrics-spinner" />
        <p>Recherche des paroles synchronisées...</p>
      </div>
    );
  }

  const hasNoLyrics = !lyrics || (!lyrics.plain && (!lyrics.synced || lyrics.synced.length === 0));

  if (hasNoLyrics) {
    return (
      <div className="lyrics-container lyrics-empty">
        <div className="cider-aura-wrapper" aria-hidden="true">
          <div className="cider-aura-blob blob-1" style={artworkUrl ? { backgroundImage: `url(${artworkUrl})` } : undefined} />
          <div className="cider-aura-blob blob-2" style={artworkUrl ? { backgroundImage: `url(${artworkUrl})` } : undefined} />
          <div className="cider-aura-blob blob-3" />
        </div>
        <Mic size={48} opacity={0.25} />
        <p>Aucune parole disponible pour ce titre.</p>
      </div>
    );
  }

  // Synced lyrics view (Cider dynamic kinetic blur effect)
  if (lyrics.synced && lyrics.synced.length > 0) {
    return (
      <div className="lyrics-container" ref={containerRef} onScroll={handleScroll}>
        {/* Dynamic Cider Fluid Aurora Backdrop */}
        <div className="cider-aura-wrapper" aria-hidden="true">
          <div className="cider-aura-blob blob-1" style={artworkUrl ? { backgroundImage: `url(${artworkUrl})` } : undefined} />
          <div className="cider-aura-blob blob-2" style={artworkUrl ? { backgroundImage: `url(${artworkUrl})` } : undefined} />
          <div className="cider-aura-blob blob-3" />
          <div className="cider-aura-glass" />
        </div>

        <div className="lyrics-padding-top" />

        {lyrics.synced.map((line, i) => {
          const isPast = i < activeIndex;
          const isActive = i === activeIndex;
          const isFuture = i > activeIndex;
          const dist = activeIndex >= 0 ? Math.abs(i - activeIndex) : 99;
          const distClass = dist <= 4 ? `dist-${dist}` : 'dist-far';

          return (
            <div
              key={i}
              ref={isActive ? activeLineRef : null}
              className={`lyrics-line ${isActive ? 'lyrics-active' : ''} ${isPast ? 'lyrics-past' : ''} ${isFuture ? 'lyrics-future' : ''} ${distClass}`}
              style={isActive ? { '--line-fill': `${(activeLineProgress * 100).toFixed(1)}%` } : undefined}
              onClick={() => onSeek && onSeek(line.time)}
              title="Cliquer pour écouter à partir d'ici"
            >
              <span className="lyrics-seek-hint">{formatTime(line.time)}</span>
              <span className="lyrics-text">{line.text}</span>
            </div>
          );
        })}

        <div className="lyrics-padding-bottom" />

        {/* Floating Resync Pill button when manually scrolled */}
        {isUserScrolling && activeIndex >= 0 && (
          <button
            className="cider-resync-pill"
            onClick={handleManualResync}
            title="Revenir et synchroniser les paroles"
          >
            <Sparkles size={14} className="resync-icon" />
            <span>Reprendre la synchro</span>
          </button>
        )}
      </div>
    );
  }

  // Plain lyrics fallback (Atmospheric frosted glass layout)
  return (
    <div className="lyrics-container lyrics-plain">
      <div className="cider-aura-wrapper" aria-hidden="true">
        <div className="cider-aura-blob blob-1" style={artworkUrl ? { backgroundImage: `url(${artworkUrl})` } : undefined} />
        <div className="cider-aura-blob blob-2" style={artworkUrl ? { backgroundImage: `url(${artworkUrl})` } : undefined} />
        <div className="cider-aura-blob blob-3" />
        <div className="cider-aura-glass" />
      </div>
      <div className="lyrics-padding-top" style={{ height: '14vh' }} />
      <div className="lyrics-plain-badge">Paroles textuelles (non synchronisées)</div>
      {(lyrics.plain || '').split('\n').map((line, i) => (
        <div key={i} className={`lyrics-line ${!line.trim() ? 'lyrics-blank' : ''}`}>
          {line || '\u00A0'}
        </div>
      ))}
      <div className="lyrics-padding-bottom" style={{ height: '14vh' }} />
    </div>
  );
}

export default function Player({ guildId, currentTrack, isPlaying, serverPosition, duration, volume, loop, setQueueState, onLyricsToggle, tracks }) {
  const [localProgress, setLocalProgress] = useState(serverPosition || 0);
  const [lastTrackUrl, setLastTrackUrl] = useState(currentTrack?.url);
  const [animateCover, setAnimateCover] = useState(false);

  // Sync Offset (Fine-tuning in milliseconds)
  const [syncOffset, setSyncOffset] = useState(0);

  // Lyrics state
  const [showLyrics, setShowLyrics] = useState(false);
  const [isClosingLyrics, setIsClosingLyrics] = useState(false);
  const closingTimerRef = useRef(null);
  const [lyrics, setLyrics] = useState(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsTrackUrl, setLyricsTrackUrl] = useState(null);

  // High precision client clock references (prevents setInterval drift & server update glitches)
  const clockRef = useRef({
    basePos: serverPosition || 0,
    baseTimestamp: performance.now(),
    isPlaying: isPlaying
  });

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

  // Track change detection
  if (currentTrack?.url !== lastTrackUrl) {
    setLastTrackUrl(currentTrack?.url);
    setAnimateCover(true);
    setSyncOffset(0);
    clockRef.current.basePos = serverPosition || 0;
    clockRef.current.baseTimestamp = performance.now();
    setLocalProgress(serverPosition || 0);
    if (lyricsTrackUrl !== currentTrack?.url) {
      setLyrics(null);
      setLyricsTrackUrl(null);
    }
  }

  // Smooth calibration with serverPosition ticks without jerky teleportation
  useEffect(() => {
    const isCurrentlyPlaying = isPlaying;
    clockRef.current.isPlaying = isCurrentlyPlaying;
    const now = performance.now();
    const elapsed = isCurrentlyPlaying ? (now - clockRef.current.baseTimestamp) : 0;
    const estimated = clockRef.current.basePos + elapsed;
    const delta = Math.abs(estimated - (serverPosition || 0));

    if (delta > 1500) {
      // Large jump (seek or initial start) -> immediate snap
      clockRef.current.basePos = serverPosition || 0;
      clockRef.current.baseTimestamp = now;
      setLocalProgress(serverPosition || 0);
    } else {
      // Micro-jitter smoothing (< 1.5s): softly blend basePos to avoid visual jumps
      clockRef.current.basePos = estimated * 0.7 + (serverPosition || 0) * 0.3;
      clockRef.current.baseTimestamp = now;
    }
  }, [serverPosition, isPlaying]);

  // Ultra-fluid 60fps clock using requestAnimationFrame (zero drift)
  useEffect(() => {
    if (!isPlaying || !currentTrack) return;

    let animId;
    let lastTickTime = performance.now();

    const tick = (now) => {
      // Update at smooth ~35fps rate to balance ultra-fluid animation with CPU efficiency
      if (now - lastTickTime >= 28) {
        lastTickTime = now;
        const elapsed = now - clockRef.current.baseTimestamp;
        const current = clockRef.current.basePos + elapsed;
        const clamped = duration > 0 ? Math.min(current, duration) : Math.max(0, current);
        setLocalProgress(clamped);
      }
      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying, currentTrack, duration]);

  // Reset cover transition animation
  useEffect(() => {
    if (animateCover) {
      const timer = setTimeout(() => setAnimateCover(false), 600);
      return () => clearTimeout(timer);
    }
  }, [animateCover]);

  // Load lyrics when lyrics mode is opened
  useEffect(() => {
    if (showLyrics && currentTrack && lyricsTrackUrl !== currentTrack.url) {
      let active = true;

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

  // Notify parent component of lyrics mode toggle (stays active during smooth exit animation)
  useEffect(() => {
    if (onLyricsToggle) onLyricsToggle(showLyrics || isClosingLyrics);
  }, [showLyrics, isClosingLyrics, onLyricsToggle]);

  // Clean up exit timer on unmount
  useEffect(() => {
    return () => {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    };
  }, []);

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
    if (showLyrics && !isClosingLyrics) {
      setIsClosingLyrics(true);
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
      closingTimerRef.current = setTimeout(() => {
        setShowLyrics(false);
        setIsClosingLyrics(false);
      }, 380);
    } else if (!showLyrics) {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
      setIsClosingLyrics(false);
      setShowLyrics(true);
    }
  };

  const thumbnail = currentTrack?.artworkUrl || getYoutubeThumbnail(currentTrack?.url);
  const progressPercent = duration > 0 ? Math.min(100, (localProgress / duration) * 100) : 0;
  const isLyricsVisible = showLyrics || isClosingLyrics;

  return (
    <div className={`player-container ${isLyricsVisible ? 'player-lyrics-mode' : ''} ${isClosingLyrics ? 'player-lyrics-closing' : ''}`}>
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
            <SkipBack size={28} fill="currentColor" />
          </button>

          <button className="control-btn play-pause-btn" onClick={handlePauseResume} disabled={!currentTrack}>
            {isPlaying ? <Pause size={32} fill="currentColor" /> : <Play size={32} fill="currentColor" style={{ marginLeft: '4px' }} />}
          </button>

          <button className="control-btn" onClick={handleSkip} disabled={!currentTrack}>
            <SkipForward size={28} fill="currentColor" />
          </button>

          <button
            className={`control-btn lyrics-btn ${showLyrics && !isClosingLyrics ? 'active-lyrics' : ''}`}
            onClick={handleLyricsToggle}
            disabled={!currentTrack}
            title={showLyrics ? "Masquer les paroles" : "Afficher les paroles"}
          >
            {showLyrics && !isClosingLyrics ? <MicOff size={22} /> : <Mic size={22} />}
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
      {isLyricsVisible && (
        <div className={`lyrics-panel ${isClosingLyrics ? 'lyrics-panel-closing' : ''}`}>
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
              {/* Lyrics Offset Fine-tuning Widget */}
              {lyrics?.synced?.length > 0 && (
                <div className="lyrics-offset-bar" title="Ajuster la synchronisation des paroles en temps réel">
                  <button
                    type="button"
                    className="offset-btn"
                    onClick={() => setSyncOffset(o => o - 250)}
                    title="Reculer les paroles (-0.25s)"
                  >
                    -0.25s
                  </button>
                  <span className={`offset-label ${syncOffset !== 0 ? 'offset-active' : ''}`}>
                    {syncOffset === 0 ? 'Synchro ✓' : `${syncOffset > 0 ? '+' : ''}${(syncOffset / 1000).toFixed(2)}s`}
                  </span>
                  <button
                    type="button"
                    className="offset-btn"
                    onClick={() => setSyncOffset(o => o + 250)}
                    title="Avancer les paroles (+0.25s)"
                  >
                    +0.25s
                  </button>
                  {syncOffset !== 0 && (
                    <button
                      type="button"
                      className="offset-btn offset-reset"
                      onClick={() => setSyncOffset(0)}
                      title="Réinitialiser le décalage (0s)"
                    >
                      ↺
                    </button>
                  )}
                </div>
              )}

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
            currentTimeMs={localProgress + syncOffset}
            onSeek={handleSeek}
            isLoading={lyricsLoading}
            artworkUrl={thumbnail}
          />
        </div>
      )}
    </div>
  );
}
