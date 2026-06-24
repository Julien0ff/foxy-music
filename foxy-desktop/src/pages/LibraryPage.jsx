import React from 'react';
import GlassPanel from '../components/GlassPanel';
import TrackList from '../components/TrackList';

const LibraryPage = () => {
  const myTracks = [
    { title: "Nights", artist: "Frank Ocean", duration: 304000, album: "Blonde" },
    { title: "Trop beau", artist: "Lomepal", duration: 230000, album: "Jeannine" }
  ];

  return (
    <div className="library-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '2rem' }}>
        <h1 style={{ color: 'var(--fox-cream)', fontSize: '2.5rem', fontWeight: 700, margin: 0 }}>
          Bibliothèque
        </h1>
        <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
          2 titres importés
        </div>
      </div>

      <GlassPanel style={{ padding: 0 }}>
        <TrackList tracks={myTracks} onPlayTrack={() => {}} />
      </GlassPanel>
    </div>
  );
};

export default LibraryPage;
