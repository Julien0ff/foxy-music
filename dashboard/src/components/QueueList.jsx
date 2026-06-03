import { ListMusic, Music, Shuffle, Trash2, X } from 'lucide-react';

export default function QueueList({ tracks, onRemoveTrack, onClearQueue, onShuffleQueue }) {
  return (
    <div className="queue-container">
      <div className="queue-header">
        <div className="queue-title">
          <ListMusic size={20} />
          <span>File d'attente ({tracks.length})</span>
        </div>
        {tracks.length > 0 && (
          <div className="queue-actions">
            <button className="queue-action-btn" onClick={onShuffleQueue} title="Mélanger la file d'attente">
              <Shuffle size={14} />
            </button>
            <button className="queue-action-btn clear-btn" onClick={onClearQueue} title="Vider la file d'attente">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
      
      {tracks.length === 0 ? (
        <div className="empty-queue">
          <p>La file d'attente est vide.</p>
          <p style={{ fontSize: '12px', marginTop: '10px' }}>Ajoute de la musique depuis Discord !</p>
        </div>
      ) : (
        <div className="queue-list">
          {tracks.map((track, index) => (
            <div key={index} className="queue-item" style={{ animationDelay: `${index * 0.05}s` }}>
              <div className="queue-index">{index + 1}</div>
              <div className="queue-item-artwork">
                {track.artworkUrl ? (
                  <img src={track.artworkUrl} alt="" className="queue-artwork-img" />
                ) : (
                  <div className="queue-artwork-fallback">
                    <Music size={14} color="var(--primary)" />
                  </div>
                )}
              </div>
              <div className="queue-item-info">
                <div className="queue-item-title" title={track.title}>{track.title}</div>
                {track.artist && <div className="queue-item-artist">{track.artist}</div>}
              </div>
              <button className="queue-item-remove-btn" onClick={() => onRemoveTrack(index)} title="Retirer de la file d'attente">
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
