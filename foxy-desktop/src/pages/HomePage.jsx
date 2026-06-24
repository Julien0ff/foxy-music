import React from 'react';
import GlassPanel from '../components/GlassPanel';
import TrackList from '../components/TrackList';

const HomePage = () => {
  // Mock recent tracks
  const recentTracks = [
    { title: "Nights", artist: "Frank Ocean", duration: 304000, album: "Blonde", artworkUrl: "https://cdn.discordapp.com/embed/avatars/0.png" },
    { title: "SICKO MODE", artist: "Travis Scott", duration: 312000, album: "ASTROWORLD", artworkUrl: "https://cdn.discordapp.com/embed/avatars/1.png" },
    { title: "The Less I Know The Better", artist: "Tame Impala", duration: 216000, album: "Currents", artworkUrl: "https://cdn.discordapp.com/embed/avatars/2.png" }
  ];

  return (
    <div className="home-page" style={{ paddingBottom: '2rem' }}>
      <h1 style={{ color: 'var(--fox-cream)', fontSize: '2.5rem', marginBottom: '2rem', fontWeight: 700 }}>
        Écouter maintenant
      </h1>

      <section style={{ marginBottom: '3rem' }}>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 600 }}>
          Repris récemment
        </h2>
        <div style={{ display: 'flex', gap: '1.5rem', overflowX: 'auto', paddingBottom: '1rem' }}>
          {[1, 2, 3, 4, 5].map((item) => (
            <GlassPanel key={item} style={{ width: '200px', flexShrink: 0, padding: '12px' }}>
              <div style={{ width: '100%', aspectRatio: '1/1', background: 'rgba(255,255,255,0.1)', borderRadius: '8px', marginBottom: '12px' }}></div>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>Mix Chill {item}</div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '12px' }}>Apple Music</div>
            </GlassPanel>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 600 }}>
          Pour vous
        </h2>
        <GlassPanel style={{ padding: '0' }}>
          <TrackList tracks={recentTracks} onPlayTrack={(t) => console.log('Play', t)} />
        </GlassPanel>
      </section>
    </div>
  );
};

export default HomePage;
