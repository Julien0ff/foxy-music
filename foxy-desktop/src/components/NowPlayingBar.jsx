import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Repeat, ListMusic, Maximize2, Minimize2 } from 'lucide-react';
import { usePlayer } from '../contexts/PlayerContext';
import './NowPlayingBar.css';

const formatTime = (ms) => {
  if (!ms || isNaN(ms)) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const NowPlayingBar = () => {
  const { 
    currentTrack, 
    isPlaying, 
    position, 
    duration,
    volume,
    togglePlay,
    playNext,
    playPrevious,
    seekTo,
    setVolume
  } = usePlayer();

  const [isFullScreen, setIsFullScreen] = useState(false);

  const track = currentTrack || {
    title: "Bienvenue sur Foxy Music",
    artist: "The Foxy Team",
    artworkUrl: "https://cdn.discordapp.com/embed/avatars/0.png"
  };

  const progressPercent = duration > 0 ? (position / duration) * 100 : 0;

  const handleSeek = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = x / rect.width;
    seekTo(percent * duration);
  };

  const handleVolumeChange = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percent = Math.max(0, Math.min(1, x / rect.width));
    setVolume(percent * 100);
  };

  const BarContent = () => (
    <>
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
          <button className="np-btn secondary" onClick={playPrevious}>
            <SkipBack size={20} fill="currentColor" />
          </button>
          <button className="np-btn primary" onClick={togglePlay} disabled={!currentTrack}>
            {isPlaying ? <Pause size={24} fill="currentColor" /> : <Play size={24} fill="currentColor" style={{ marginLeft: 2 }} />}
          </button>
          <button className="np-btn secondary" onClick={playNext}>
            <SkipForward size={20} fill="currentColor" />
          </button>
        </div>
        <div className="np-scrubber-container">
          <span className="np-time">{formatTime(position)}</span>
          <div className="np-scrubber" onClick={handleSeek}>
            <div className="np-scrubber-bg">
              <div className="np-scrubber-progress" style={{ width: `${progressPercent}%` }}></div>
              <div className="np-scrubber-handle" style={{ left: `${progressPercent}%` }}></div>
            </div>
          </div>
          <span className="np-time">-{formatTime(Math.max(0, duration - position))}</span>
        </div>
      </div>

      {/* Right: Volume & Queue */}
      <div className="np-right">
        <button className="np-btn secondary">
          <Repeat size={16} />
        </button>
        <div className="np-volume">
          <Volume2 size={16} color="var(--text-secondary)" />
          <div className="np-scrubber" onClick={handleVolumeChange} style={{ width: 80, marginLeft: 8, height: '16px', display: 'flex', alignItems: 'center' }}>
            <div className="np-scrubber-bg" style={{ width: '100%' }}>
              <div className="np-scrubber-progress" style={{ width: `${volume}%` }}></div>
              <div className="np-scrubber-handle" style={{ left: `${volume}%` }}></div>
            </div>
          </div>
        </div>
        <button className="np-btn secondary" onClick={() => setIsFullScreen(!isFullScreen)}>
          {isFullScreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <button className="np-btn secondary">
          <ListMusic size={18} />
        </button>
      </div>
    </>
  );

  return (
    <>
      {isFullScreen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column'
        }}>
          {/* Blurred Background */}
          <div style={{
            position: 'absolute', top: '-10%', left: '-10%', right: '-10%', bottom: '-10%',
            backgroundImage: `url(${track.artworkUrl})`,
            backgroundSize: 'cover', backgroundPosition: 'center',
            filter: 'blur(80px) brightness(0.4)', zIndex: -1
          }}></div>

          {/* Main Full Screen Content */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4rem', gap: '4rem' }}>
            {/* Album Cover */}
            <div style={{
              flex: 'none',
              width: '500px', height: '500px',
              display: 'flex', justifyContent: 'center'
            }}>
              <img src={track.artworkUrl} alt="" style={{
                width: '100%', height: '100%', objectFit: 'cover',
                borderRadius: '16px', boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                transition: 'all 0.5s cubic-bezier(0.2, 0.8, 0.2, 1)'
              }} />
            </div>

            {/* Lyrics Panel */}
            <div style={{
              flex: 1, height: '100%', overflowY: 'auto', padding: '2rem',
              display: 'flex', flexDirection: 'column', gap: '2rem',
              maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
            }}>
              {[...Array(10)].map((_, i) => (
                <div key={i} style={{ 
                  fontSize: i === 3 ? '2.5rem' : '1.8rem', 
                  fontWeight: i === 3 ? 800 : 500, 
                  color: i === 3 ? 'white' : 'rgba(255,255,255,0.4)',
                  transition: '0.3s'
                }}>
                  ♪ (Lyrics synchronisées indisponibles) ♪<br/>
                  Foxy Music - Focus Mode
                </div>
              ))}
            </div>
          </div>

          {/* Bottom Bar overlaying the full screen */}
          <div className="now-playing-bar" style={{ background: 'transparent', borderTop: 'none', padding: '1rem 2rem' }}>
            <BarContent />
          </div>
        </div>
      )}

      {!isFullScreen && (
        <div className="now-playing-bar">
          <BarContent />
        </div>
      )}
    </>
  );
};

export default NowPlayingBar;
