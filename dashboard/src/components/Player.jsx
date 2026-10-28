import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
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
  Sparkles,
  X
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

// Parse line into main vocal and secondary parenthetical backing vocals
function parseLyricLineText(rawText) {
  if (!rawText) return { main: '', backing: [], isOnlyBacking: false };
  const trimmed = rawText.trim();
  // Entire line is parenthesized: e.g. "(Ooh, hee-hee-hee)"
  if (/^\(([^)]+)\)$/.test(trimmed)) {
    return { isOnlyBacking: true, main: '', backing: [trimmed.slice(1, -1)] };
  }
  const backing = [];
  const main = trimmed.replace(/\(([^)]+)\)/g, (_, match) => {
    backing.push(match.trim());
    return '';
  }).replace(/\s{2,}/g, ' ').trim();

  if (!main && backing.length > 0) {
    return { isOnlyBacking: true, main: '', backing };
  }
  return { isOnlyBacking: false, main, backing };
}

// Pre-process lyrics lines into a stable list with instrumental entries (zero DOM layout shifts)
function prepareLyricsLines(syncedLines) {
  if (!syncedLines || syncedLines.length === 0) return [];
  const processed = [];

  // Check intro instrumental (gap before first vocal >= 3.5s)
  if (syncedLines[0].time >= 3500) {
    processed.push({
      time: 0,
      endTime: syncedLines[0].time,
      vocalEndTime: syncedLines[0].time,
      isInstrumental: true,
      text: '•••'
    });
  }

  for (let i = 0; i < syncedLines.length; i++) {
    const cur = syncedLines[i];
    const next = syncedLines[i + 1];

    // Estimate natural vocal duration based on text length:
    // ~75ms per character clamped between 2000ms and 4800ms
    const textLen = (cur.text || '').length;
    const estDuration = Math.min(4800, Math.max(2000, textLen * 75));
    const gap = next ? (next.time - cur.time) : 5500;
    const vocalDuration = Math.min(gap, estDuration);
    const vocalEndTime = cur.time + vocalDuration;
    const lineEndTime = next ? next.time : (cur.time + 5500);

    const parsed = parseLyricLineText(cur.text);
    processed.push({
      ...cur,
      endTime: lineEndTime,
      vocalEndTime,
      parsed,
      isInstrumental: false
    });

    // Check instrumental interlude between sections (gap >= 9 seconds and pause >= 4 seconds)
    if (next && gap >= 9000 && (gap - vocalDuration) >= 4000) {
      processed.push({
        time: vocalEndTime,
        endTime: next.time,
        vocalEndTime: next.time,
        isInstrumental: true,
        text: '•••'
      });
    }
  }

  return processed;
}

// Render line words with smooth karaoke wave animation when active (zero-layout shift, guaranteed spacing)
function LyricWords({ text, line, currentTimeMs, isActive }) {
  if (!text) return null;
  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text]);
  if (words.length === 0) return null;

  if (!isActive) {
    return <span className="lyrics-text-plain">{text}</span>;
  }

  // Weight each word by character count so syllables get natural singing duration
  const charWeights = useMemo(() => {
    return words.map(w => Math.max(2, w.replace(/[^a-zA-Z0-9\u00C0-\u017F]/g, '').length));
  }, [words]);

  const totalWeight = useMemo(() => charWeights.reduce((a, b) => a + b, 0), [charWeights]);

  // Vocal duration for this line
  const vocalDuration = Math.max(1600, Math.min(6500, line.vocalEndTime ? (line.vocalEndTime - line.time) : (line.endTime - line.time)));
  const elapsed = Math.max(0, currentTimeMs - line.time);
  const progress = Math.min(1, elapsed / vocalDuration);

  let cumWeight = 0;
  return (
    <span className="lyrics-words-wrapper">
      {words.map((word, k) => {
        const startFraction = cumWeight / totalWeight;
        cumWeight += charWeights[k];
        const endFraction = cumWeight / totalWeight;

        let status = 'word-waiting';
        if (progress >= endFraction) {
          status = 'word-sung';
        } else if (progress >= startFraction) {
          status = 'word-singing';
        }

        return (
          <span key={k} className={`lyrics-word ${status}`}>
            {word}
            {k < words.length - 1 && <span className="word-space">&nbsp;</span>}
          </span>
        );
      })}
    </span>
  );
}

// Lyrics display component (Cider / Apple Music Sing visual aesthetics & kinetics)
function LyricsView({ lyrics, currentTimeMs, onSeek, isLoading }) {
  const containerRef = useRef(null);
  const activeLineRef = useRef(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const userScrollTimeoutRef = useRef(null);

  // Stable pre-processed lines list
  const lines = useMemo(() => {
    return prepareLyricsLines(lyrics?.synced);
  }, [lyrics]);

  // Find index of currently active lyric line
  const activeIndex = useMemo(() => {
    if (!lines || lines.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time <= currentTimeMs) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lines, currentTimeMs]);

  // Smooth 60fps cubic easing auto-scroll centering active line at ~36% viewport height
  const scrollToActive = useCallback((smooth = true) => {
    if (!containerRef.current || !activeLineRef.current) return;
    const container = containerRef.current;
    const activeEl = activeLineRef.current;
    const containerHeight = container.clientHeight;
    const targetScroll = activeEl.offsetTop - (containerHeight * 0.36);

    if (!smooth) {
      container.scrollTop = Math.max(0, targetScroll);
      return;
    }

    const startScroll = container.scrollTop;
    const distance = Math.max(0, targetScroll) - startScroll;
    if (Math.abs(distance) < 2) return;

    const startTime = performance.now();
    const duration = 650;
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);
      container.scrollTop = startScroll + distance * easeOutCubic(progress);
      if (progress < 1) {
        requestAnimationFrame(step);
      }
    };
    requestAnimationFrame(step);
  }, []);

  // Center active line whenever activeIndex changes
  useEffect(() => {
    if (!isUserScrolling && activeIndex >= 0) {
      scrollToActive(true);
    }
  }, [activeIndex, isUserScrolling, scrollToActive]);

  // Only detach auto-sync when the user physically touches or wheels the list
  const handleUserInteraction = () => {
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
        <div className="lyrics-spinner" />
        <p>Recherche des paroles synchronisées...</p>
      </div>
    );
  }

  const hasNoLyrics = !lyrics || (!lyrics.plain && (!lyrics.synced || lyrics.synced.length === 0));

  if (hasNoLyrics) {
    return (
      <div className="lyrics-container lyrics-empty">
        <Mic size={48} opacity={0.25} />
        <p>Aucune parole disponible pour ce titre.</p>
      </div>
    );
  }

  // Synced lyrics view (Cider dynamic kinetic blur effect)
  if (lines && lines.length > 0) {
    const isIntroActive = activeIndex === 0 && lines[0].isInstrumental;

    return (
      <div
        className="lyrics-container"
        ref={containerRef}
        onWheel={handleUserInteraction}
        onTouchMove={handleUserInteraction}
      >
        <div className="lyrics-padding-top" />

        {lines.map((line, i) => {
          const isPast = i < activeIndex;
          const isActive = i === activeIndex;
          const isPrev = i === activeIndex - 1;
          const isOlderPast = i < activeIndex - 1;
          const isNext = i === activeIndex + 1;
          const isFuture = i > activeIndex + 1;

          // Past instrumental breaks vanish completely from the screen
          if (line.isInstrumental) {
            if (isPast) return null;
            return (
              <div
                key={`inst-${line.time}`}
                ref={isActive ? activeLineRef : null}
                className={`lyrics-line lyrics-instrumental-line ${isActive ? 'lyrics-active' : 'lyrics-future'}`}
                onClick={() => onSeek && onSeek(Math.max(0, line.endTime - 600))}
                title="Cliquer pour avancer vers le chant"
              >
                <div className="cider-dots-container">
                  <span className="cider-dot dot-1" />
                  <span className="cider-dot dot-2" />
                  <span className="cider-dot dot-3" />
                </div>
              </div>
            );
          }

          let lineClass = 'lyrics-line';
          if (isActive) {
            lineClass += ' lyrics-active';
          } else if (isNext) {
            lineClass += ' lyrics-next';
          } else if (isFuture) {
            lineClass += ' lyrics-future';
          } else if (isPrev) {
            lineClass += ' lyrics-prev';
          } else if (isOlderPast) {
            lineClass += ' lyrics-past';
          }

          // When intro instrumental is playing, softly frost all following lines
          if (isIntroActive && i > 0) {
            lineClass += ' lyrics-intro-frosted';
          }

          const { isOnlyBacking, main, backing } = line.parsed || { main: line.text, backing: [] };

          return (
            <div
              key={`line-${line.time}`}
              ref={isActive ? activeLineRef : null}
              className={lineClass}
              onClick={() => onSeek && onSeek(line.time)}
              title="Cliquer pour écouter à partir d'ici"
            >
              <span className="lyrics-seek-hint">{formatTime(line.time)}</span>
              <div className="lyrics-text-wrapper">
                {isOnlyBacking ? (
                  <span className="lyrics-backing-solo">({backing[0]})</span>
                ) : (
                  <>
                    <div className="lyrics-main-line">
                      <LyricWords
                        text={main}
                        line={line}
                        currentTimeMs={currentTimeMs}
                        isActive={isActive}
                      />
                    </div>
                    {backing && backing.length > 0 && (
                      <div className="lyrics-backing-sub">
                        {backing.map((b, bIdx) => (
                          <span key={bIdx} className="backing-pill">({b})</span>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
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

export default function Player({ guildId, currentTrack, isPlaying, serverPosition, positionTimestamp, duration, volume, loop, setQueueState, onLyricsToggle, tracks }) {
  const [localProgress, setLocalProgress] = useState(serverPosition || 0);
  const [lastTrackUrl, setLastTrackUrl] = useState(currentTrack?.url);
  const [animateCover, setAnimateCover] = useState(false);

  // Sync Offset (Fine-tuning in milliseconds, saved per track)
  const [syncOffset, setSyncOffset] = useState(0);

  useEffect(() => {
    if (!currentTrack?.url && !currentTrack?.title) return;
    const key = `foxy_offset_${currentTrack.title || currentTrack.url}`;
    const saved = localStorage.getItem(key);
    if (saved !== null) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed)) setSyncOffset(parsed);
    } else {
      setSyncOffset(0);
    }
  }, [currentTrack?.url, currentTrack?.title]);

  const updateSyncOffset = (updater) => {
    setSyncOffset(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (currentTrack?.url || currentTrack?.title) {
        const key = `foxy_offset_${currentTrack.title || currentTrack.url}`;
        localStorage.setItem(key, String(next));
      }
      return next;
    });
  };

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
    clockRef.current.basePos = serverPosition || 0;
    clockRef.current.baseTimestamp = performance.now();
    setLocalProgress(serverPosition || 0);
    if (lyricsTrackUrl !== currentTrack?.url) {
      setLyrics(null);
      setLyricsTrackUrl(null);
    }
  }

  // Smooth calibration with serverPosition ticks without cumulative lag drift
  useEffect(() => {
    const isCurrentlyPlaying = isPlaying;
    clockRef.current.isPlaying = isCurrentlyPlaying;
    const now = performance.now();
    const targetPos = typeof serverPosition === 'number' ? serverPosition : 0;
    const elapsed = isCurrentlyPlaying ? (now - clockRef.current.baseTimestamp) : 0;
    const estimated = clockRef.current.basePos + elapsed;
    const delta = Math.abs(estimated - targetPos);

    if (delta > 600 || !isCurrentlyPlaying) {
      // Large jump (seek or initial start) -> immediate snap
      clockRef.current.basePos = targetPos;
      clockRef.current.baseTimestamp = now;
      setLocalProgress(targetPos);
    } else {
      // Gentle micro-correction to keep clock locked without sudden 150ms jump
      clockRef.current.basePos += (targetPos - estimated) * 0.15;
    }
  }, [serverPosition, isPlaying]);

  // Ultra-fluid 60fps clock using requestAnimationFrame (zero drift)
  useEffect(() => {
    if (!isPlaying || !currentTrack) return;

    let animId;
    let lastTickTime = performance.now();

    const tick = (now) => {
      // 60fps tick (every 16ms)
      if (now - lastTickTime >= 16) {
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

  // Clean up exit timer on unmount
  useEffect(() => {
    return () => {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
    };
  }, []);

  // Handle Escape key to close lyrics smoothly
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && (showLyrics || isClosingLyrics)) {
        if (!isClosingLyrics) handleLyricsToggle();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showLyrics, isClosingLyrics]);

  const handlePauseResume = async () => {
    if (!currentTrack) return;
    const nextPlaying = !isPlaying;
    setQueueState(prev => ({ ...prev, isPlaying: nextPlaying }));
    clockRef.current.isPlaying = nextPlaying;
    const action = nextPlaying ? 'resume' : 'pause';
    try {
      const res = await fetch(`${API_URL}/api/guilds/${guildId}/${action}`, { method: 'POST' });
      const data = await res.json();
      if (data && typeof data.isPlaying === 'boolean') {
        setQueueState(prev => ({ ...prev, isPlaying: data.isPlaying }));
        clockRef.current.isPlaying = data.isPlaying;
      }
    } catch (e) {
      console.error(e);
      setQueueState(prev => ({ ...prev, isPlaying: isPlaying }));
      clockRef.current.isPlaying = isPlaying;
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
    clockRef.current.basePos = timeMs;
    clockRef.current.baseTimestamp = performance.now();
    setLocalProgress(timeMs);
    try {
      await fetch(`${API_URL}/api/guilds/${guildId}/seek`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position: timeMs })
      });
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
        if (onLyricsToggle) onLyricsToggle(false);
      }, 380);
    } else if (!showLyrics) {
      if (closingTimerRef.current) clearTimeout(closingTimerRef.current);
      setIsClosingLyrics(false);
      setShowLyrics(true);
      if (onLyricsToggle) onLyricsToggle(true);
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
          <p className="track-artist">{currentTrack ? (currentTrack.artist || 'Foxy Music Bot') : 'En attente...'}</p>
        </div>

        <div className="progress-section" style={{ width: '100%', maxWidth: 'min(100%, 45vh)', marginTop: '12px' }}>
          <div
            className="progress-container"
            style={{ cursor: currentTrack ? 'pointer' : 'default' }}
            onClick={(e) => {
              if (!currentTrack || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const ratio = Math.max(0, Math.min(1, clickX / rect.width));
              handleSeek(Math.round(ratio * duration));
            }}
          >
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
          {/* Dynamic Cider Fluid Aurora Backdrop - Seamless across entire panel */}
          <div className="cider-aura-wrapper" aria-hidden="true">
            <div className="cider-aura-blob blob-1" style={thumbnail ? { backgroundImage: `url(${thumbnail})` } : undefined} />
            <div className="cider-aura-blob blob-2" style={thumbnail ? { backgroundImage: `url(${thumbnail})` } : undefined} />
            <div className="cider-aura-blob blob-3" />
            <div className="cider-aura-glass" />
          </div>

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
                <div className="lyrics-offset-bar" title="Ajuster la synchronisation des paroles en temps réel (sauvegardé pour ce morceau)">
                  <button
                    type="button"
                    className="offset-btn"
                    onClick={() => updateSyncOffset(o => o - 1000)}
                    title="Reculer les paroles (-1s)"
                  >
                    -1s
                  </button>
                  <button
                    type="button"
                    className="offset-btn"
                    onClick={() => updateSyncOffset(o => o - 250)}
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
                    onClick={() => updateSyncOffset(o => o + 250)}
                    title="Avancer les paroles (+0.25s)"
                  >
                    +0.25s
                  </button>
                  <button
                    type="button"
                    className="offset-btn"
                    onClick={() => updateSyncOffset(o => o + 1000)}
                    title="Avancer les paroles (+1s)"
                  >
                    +1s
                  </button>
                  {syncOffset !== 0 && (
                    <button
                      type="button"
                      className="offset-btn offset-reset"
                      onClick={() => updateSyncOffset(0)}
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

              {/* Explicit Close Button */}
              <button
                type="button"
                onClick={handleLyricsToggle}
                className="lyrics-close-btn"
                title="Fermer les paroles (Échap)"
              >
                <X size={18} />
              </button>
            </div>
          </div>
          <LyricsView
            lyrics={lyrics}
            currentTimeMs={localProgress + syncOffset}
            onSeek={handleSeek}
            isLoading={lyricsLoading}
          />
        </div>
      )}
    </div>
  );
}
