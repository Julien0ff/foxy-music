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
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <tbody>
          {tracks.map((track, index) => (
            <tr 
              key={index} 
              className="track-row"
              onDoubleClick={() => onPlayTrack(track, index)}
              style={{ cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)', transition: 'background 0.2s' }}
            >
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', width: '40px', textAlign: 'center' }}>
                {index + 1}
              </td>
              <td style={{ padding: '12px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  {track.artworkUrl && (
                    <img src={track.artworkUrl} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} />
                  )}
                  <div>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginBottom: '4px', fontSize: '14px' }}>
                      {track.title}
                    </div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {track.artist}
                    </div>
                  </div>
                </div>
              </td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '13px' }}>
                {track.album || "Single"}
              </td>
              <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: '13px', textAlign: 'right' }}>
                {formatTime(track.duration)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TrackList;
