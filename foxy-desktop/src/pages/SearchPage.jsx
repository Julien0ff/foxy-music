import React, { useState } from 'react';
import GlassPanel from '../components/GlassPanel';
import TrackList from '../components/TrackList';
import { Search } from 'lucide-react';

const SearchPage = () => {
  const [query, setQuery] = useState('');
  
  const searchResults = query ? [
    { title: `${query} (Mix)`, artist: "Various Artists", duration: 250000, album: "Foxy Mixes" },
    { title: `Meilleur de ${query}`, artist: "Foxy Music", duration: 300000, album: "Essentials" }
  ] : [];

  return (
    <div className="search-page">
      <div style={{ position: 'relative', marginBottom: '2rem' }}>
        <div style={{
          position: 'absolute',
          left: '16px',
          top: '50%',
          transform: 'translateY(-50%)',
          color: 'var(--text-secondary)'
        }}>
          <Search size={20} />
        </div>
        <input 
          type="text" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Artistes, morceaux, ou podcasts" 
          autoFocus
          style={{
            width: '100%',
            padding: '16px 16px 16px 48px',
            background: 'rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            color: 'white',
            fontSize: '18px',
            outline: 'none',
            boxShadow: '0 4px 15px rgba(0,0,0,0.2)'
          }}
        />
      </div>

      {query ? (
        <section>
          <h2 style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 600 }}>
            Meilleurs résultats
          </h2>
          <GlassPanel style={{ padding: 0 }}>
            <TrackList tracks={searchResults} onPlayTrack={() => {}} />
          </GlassPanel>
        </section>
      ) : (
        <div style={{ textAlign: 'center', color: 'var(--text-secondary)', marginTop: '4rem' }}>
          Recherchez tout ce que vous voulez écouter.
        </div>
      )}
    </div>
  );
};

export default SearchPage;
