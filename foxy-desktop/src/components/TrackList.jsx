import React from 'react';
import { Play, MoreHorizontal } from 'lucide-react';
import './TrackList.css';

const formatTime = (ms) => {
  if (!ms) return '0:00';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};

const TrackList = ({ tracks = [], onPlayTrack }) => {
  if (!tracks.length) {
    return <div className="empty-state">Aucun morceau disponible.</div>;
  }

  return (
    <div className="track-list">
      {tracks.map((track, index) => (
        <div key={index} className="track-item" onDoubleClick={() => onPlayTrack(track, index)}>
          <div className="track-index">
            <span className="index-num">{index + 1}</span>
            <button className="play-btn" onClick={() => onPlayTrack(track, index)}>
              <Play size={14} fill="currentColor" />
            </button>
          </div>
          
          <div className="track-info-col">
            <div className="track-title">{track.title}</div>
            <div className="track-artist">{track.artist}</div>
          </div>
          
          <div className="track-album">
            {track.album || "Single"}
          </div>
          
          <div className="track-actions">
            <span className="track-duration">{formatTime(track.duration)}</span>
            <button className="more-btn">
              <MoreHorizontal size={18} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default TrackList;
