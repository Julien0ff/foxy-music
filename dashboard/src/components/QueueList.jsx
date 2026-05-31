import { ListMusic, Music } from 'lucide-react';

export default function QueueList({ tracks }) {
  return (
    <div className="queue-container">
      <div className="queue-header">
        <ListMusic size={24} />
        <span>File d'attente ({tracks.length})</span>
      </div>
      
      {tracks.length === 0 ? (
        <div className="empty-queue">
          <p>La file d'attente est vide.</p>
          <p style={{ fontSize: '12px', marginTop: '10px' }}>Ajoute de la musique depuis Discord !</p>
        </div>
      ) : (
        <div className="queue-list">
          {tracks.map((track, index) => (
            <div key={index} className="queue-item" style={{ animationDelay: `${index * 0.1}s` }}>
              <div className="queue-index">{index + 1}</div>
              <div className="queue-item-info">
                <div className="queue-item-title">{track.title}</div>
              </div>
              <Music size={16} color="var(--primary)" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
