import React from 'react';
import GlassPanel from '../components/GlassPanel';
import ArtistBadge from '../components/ArtistBadge';
import TrackList from '../components/TrackList';
import { Play } from 'lucide-react';

const ArtistPage = () => {
  // Mock data
  const artist = {
    name: "Lomepal",
    isVerified: true,
    bio: "Rappeur et chanteur français.",
    followers: "1.2M abonnés",
    coverUrl: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=2070&auto=format&fit=crop"
  };

  const topTracks = [
    { title: "Trop beau", artist: "Lomepal", duration: 230000, album: "Jeannine" },
    { title: "Yeux disent", artist: "Lomepal", duration: 200000, album: "FLIP" },
    { title: "Decrescendo", artist: "Lomepal", duration: 215000, album: "Mauvais Ordre" },
  ];

  return (
    <div className="artist-page" style={{ marginTop: '-2rem', marginHorizontal: '-2rem' }}>
      {/* Header Banner */}
      <div style={{ 
        height: '350px', 
        width: 'calc(100% + 4rem)', 
        marginLeft: '-2rem',
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.1), var(--bg-deep)), url(${artist.coverUrl})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        position: 'relative',
        display: 'flex',
        alignItems: 'flex-end',
        padding: '2rem'
      }}>
        <div>
          <h1 style={{ fontSize: '4rem', fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: '1rem', margin: 0, textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
            {artist.name}
            {artist.isVerified && <ArtistBadge size={32} />}
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.8)', fontSize: '1rem', marginTop: '0.5rem' }}>{artist.followers}</p>
        </div>
      </div>

      <div style={{ padding: '2rem 0' }}>
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
          <button style={{ 
            background: 'var(--fox-orange)', 
            border: 'none', 
            borderRadius: '30px', 
            padding: '12px 32px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'white',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(232, 101, 10, 0.4)'
          }}>
            <Play size={18} fill="currentColor" />
            Lecture
          </button>
          <button style={{ 
            background: 'rgba(255,255,255,0.1)', 
            border: '1px solid rgba(255,255,255,0.2)', 
            borderRadius: '30px', 
            padding: '12px 32px',
            color: 'white',
            fontWeight: 600,
            cursor: 'pointer'
          }}>
            S'abonner
          </button>
        </div>

        <section style={{ marginBottom: '3rem' }}>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 600 }}>
            Titres les plus écoutés
          </h2>
          <GlassPanel style={{ padding: 0 }}>
            <TrackList tracks={topTracks} onPlayTrack={() => {}} />
          </GlassPanel>
        </section>

        <section>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 600 }}>
            À propos
          </h2>
          <GlassPanel>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>{artist.bio}</p>
          </GlassPanel>
        </section>
      </div>
    </div>
  );
};

export default ArtistPage;
