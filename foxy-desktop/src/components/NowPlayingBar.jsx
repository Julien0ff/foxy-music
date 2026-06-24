import React, { useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Repeat, ListMusic } from 'lucide-react';
import './NowPlayingBar.css';

const formatTime = (ms) => {
  if (!ms) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const NowPlayingBar = ({ 
  currentTrack, 
  isPlaying, 
  position = 0, 
  duration = 0,
  volume = 100,
  onPlayPause,
  onSkip,
  onPrevious,
  onSeek,
  onVolumeChange
}) => {
  const [seekWidth, setSeekWidth] = useState(0);

  // Fallback track data for testing UI
  const track = currentTrack || {
    title: "Bienvenue sur Foxy Music",
    artist: "The Foxy Team",
    artworkUrl: "https://cdn.discordapp.com/embed/avatars/0.png"
  };

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div className="now-playing-bar">
      {/* Left: Track Info */}
      <div className="np-left">
        <div className="np-artwork-container">
          <img src={track.artworkUrl} alt={track.title} className="np-artwork" />
        </div>
        <div className="np-track-info">
          <div className="np-title">{track.title}</div>
          <div className="np-artist">{track.artist}</div>
        </div>
      </div>

      {/* Center: Controls & Scrubber */}
      <div className="np-center">
        <div className="np-controls">
          <button className="np-btn secondary" onClick={onPrevious}>
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button className="np-btn primary" onClick={onPlayPause}>
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button className="np-btn secondary" onClick={onSkip}>
            <SkipForward size={20} fill="currentColor" />
          </button>
        </div>
        <div className="np-scrubber-container">
          <span className="np-time">{formatTime(position)}</span>
          <div className="np-scrubber">
            <div className="np-scrubber-bg">
              <div className="np-scrubber-progress" style={{ width: `${progressPercent}%` }}></div>
              <div className="np-scrubber-handle" style={{ left: `${progressPercent}%` }}></div>
            </div>
          </div>
          <span className="np-time">-{formatTime(duration - position)}</span>
        </div>
      </div>

      {/* Right: Volume & Queue */}
      <div className="np-right">
        <button className="np-btn secondary">
          <Repeat size={16} />
        </button>
        <div className="np-volume">
          <Volume2 size={16} color="var(--text-secondary)" />
          <div className="np-scrubber-bg" style={{ width: 80, marginLeft: 8 }}>
            <div className="np-scrubber-progress" style={{ width: `${volume}%` }}></div>
            <div className="np-scrubber-handle" style={{ left: `${volume}%` }}></div>
          </div>
        </div>
        <button className="np-btn secondary">
          <ListMusic size={18} />
        </button>
      </div>
    </div>
  );
};

export default NowPlayingBar;
