import { useState, useEffect } from 'react';
import { Play, Pause, SkipForward, Music, Repeat } from 'lucide-react';
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

export default function Player({ guildId, currentTrack, isPlaying, serverPosition, duration, volume, loop, setQueueState }) {
  const [localProgress, setLocalProgress] = useState(0);
  const [lastSyncPos, setLastSyncPos] = useState(serverPosition);
  const [lastTrackUrl, setLastTrackUrl] = useState(currentTrack?.url);

  // Derive state from props during render (avoids cascading renders from useEffect)
  if (serverPosition !== lastSyncPos) {
    setLastSyncPos(serverPosition);
    setLocalProgress(serverPosition || 0);
  }

  // Réinitialiser la barre de progression instantanément lors d'un changement de musique
  if (currentTrack?.url !== lastTrackUrl) {
    setLastTrackUrl(currentTrack?.url);
    setLocalProgress(serverPosition || 0);
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

  const thumbnail = currentTrack?.artworkUrl || getYoutubeThumbnail(currentTrack?.url);
  const progressPercent = duration > 0 ? Math.min(100, (localProgress / duration) * 100) : 0;

  return (
    <div className="player-container">
      <div className="artwork-wrapper">
        {thumbnail ? (
          <img src={thumbnail} alt="Cover" className={`artwork ${currentTrack ? '' : 'idle'}`} />
        ) : (
          <div className={`artwork ${currentTrack ? '' : 'idle'}`} style={{ background: 'linear-gradient(135deg, var(--primary), var(--secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
  );
}
