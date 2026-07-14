import React, { useState, useEffect } from 'react';
import GlassPanel from '../components/GlassPanel';
import TrackList from '../components/TrackList';
import { usePlayer } from '../contexts/PlayerContext';

const SearchPage = ({ globalSearch }) => {
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const { playTrack } = usePlayer();

  useEffect(() => {
    if (!globalSearch || globalSearch.trim() === '') {
      setSearchResults([]);
      return;
    }

    const timer = setTimeout(() => {
      setLoading(true);
      // Use highly reliable iTunes API directly instead of proxying through broken Lavalink backend
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(globalSearch)}&entity=song&limit=25`)
        .then(res => res.json())
        .then(data => {
          if (data && data.results) {
            const formatted = data.results.map(t => ({
                title: t.trackName,
                artist: t.artistName,
                url: t.previewUrl,
                duration: t.trackTimeMillis || 30000,
                artworkUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100', '600x600') : null
            })).filter(t => t.url);
            setSearchResults(formatted);
          } else {
            setSearchResults([]);
          }
          setLoading(false);
        })
        .catch(err => {
          console.error(err);
          setSearchResults([]);
          setLoading(false);
        });
    }, 500); // 500ms debounce

    return () => clearTimeout(timer);
  }, [globalSearch]);

  return (
    <div className="search-page">
      <h1 style={{ color: 'var(--fox-orange)', fontSize: '2.5rem', marginBottom: '2rem' }}>
        Résultats pour "{globalSearch}"
      </h1>

      {loading && <p style={{ color: 'var(--text-secondary)' }}>Recherche en cours...</p>}
      
      {!loading && globalSearch && searchResults.length === 0 && (
        <p style={{ color: 'var(--text-secondary)' }}>Aucun résultat trouvé.</p>
      )}

      {searchResults.length > 0 && (
        <GlassPanel style={{ padding: 0 }}>
          <TrackList tracks={searchResults} onPlayTrack={(track) => playTrack(track, searchResults)} />
        </GlassPanel>
      )}
    </div>
  );
};

export default SearchPage;
