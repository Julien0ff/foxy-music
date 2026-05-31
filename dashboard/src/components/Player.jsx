import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, SkipForward, Music, Repeat, Mic, MicOff } from 'lucide-react';
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

  // Find the index of the currently active lyric line
  const activeIndex = lyrics.synced.length > 0
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

  if (!lyrics) {
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
      {lyrics.plain.split('\n').map((line, i) => (
        <div key={i} className={`lyrics-line ${!line.trim() ? 'lyrics-blank' : ''}`}>
          {line || '\u00A0'}
        </div>
      ))}
    </div>
  );
}

export default function Player({ guildId, currentTrack, isPlaying, serverPosition, duration, volume, loop, setQueueState, onLyricsToggle }) {
  const [localProgress, setLocalProgress] = useState(0);
  const [lastSyncPos, setLastSyncPos] = useState(serverPosition);
  const [lastTrackUrl, setLastTrackUrl] = useState(currentTrack?.url);
  const [animateCover, setAnimateCover] = useState(false);

  // Lyrics state
  const [showLyrics, setShowLyrics] = useState(false);
  const [lyrics, setLyrics] = useState(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsTrackUrl, setLyricsTrackUrl] = useState(null);

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
      setLyricsLoading(true);
      setLyrics(null);
      fetch(`${API_URL}/api/guilds/${guildId}/lyrics`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          setLyrics(data);
          setLyricsTrackUrl(currentTrack.url);
        })
        .catch(() => setLyrics(null))
        .finally(() => setLyricsLoading(false));
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
