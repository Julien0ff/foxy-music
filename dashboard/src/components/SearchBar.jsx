import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Plus, Check } from 'lucide-react';
import { API_URL } from '../config';

export default function SearchBar({ guildId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingITunes, setIsSearchingITunes] = useState(false);
  const [addingTrackId, setAddingTrackId] = useState(null);
  const searchTimeoutRef = useRef(null);

  // Check if string is a URL
  const isUrl = (str) => {
    try {
      new URL(str);
      return true;
    } catch {
      return false;
    }
  };

  // Debounce user search input and fetch iTunes results
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const fetchITunesResults = async (searchTerm) => {
      if (!searchTerm.trim() || isUrl(searchTerm)) {
        setResults([]);
        return;
      }

      setIsSearchingITunes(true);
      try {
        const response = await fetch(
          `https://itunes.apple.com/search?term=${encodeURIComponent(searchTerm)}&media=music&limit=6&entity=song`
        );
        if (response.ok) {
          const data = await response.json();
          setResults(data.results || []);
        }
      } catch (error) {
        console.error('Error fetching iTunes results:', error);
      } finally {
        setIsSearchingITunes(false);
      }
    };

    if (query.trim().length > 2) {
      searchTimeoutRef.current = setTimeout(() => {
        fetchITunesResults(query);
      }, 400);
    } else {
      // Async state update to avoid synchronous useEffect triggers
      const timer = setTimeout(() => {
        setResults([]);
      }, 0);
      return () => clearTimeout(timer);
    }

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query]);

  // Handle direct submit (URL or custom search query)
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/guilds/${guildId}/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: query.trim() })
      });

      const data = await res.json();
      if (data.success) {
        setQuery('');
        setResults([]);
      } else {
        alert(data.error || 'Erreur lors de l\'ajout de la musique');
      }
    } catch (e) {
      console.error(e);
      alert('Erreur réseau');
    } finally {
      setIsLoading(false);
    }
  };

  // Add iTunes track to queue
  const handleAddTrack = async (track) => {
    const trackIdentifier = `${track.trackName} ${track.artistName}`;
    const trackId = track.trackId;
    setAddingTrackId(trackId);

    try {
      const res = await fetch(`${API_URL}/api/guilds/${guildId}/play`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: trackIdentifier })
      });

      const data = await res.json();
      if (data.success) {
        // Micro-pulsation / success state
        setTimeout(() => {
          setAddingTrackId(null);
          // Auto clear search query if successfully added
          setQuery('');
          setResults([]);
        }, 1000);
      } else {
        alert(data.error || 'Erreur lors de l\'ajout');
        setAddingTrackId(null);
      }
    } catch (e) {
      console.error(e);
      alert('Erreur réseau');
      setAddingTrackId(null);
    }
  };

  return (
    <div className="search-container">
      <form onSubmit={handleSubmit} className="search-form">
        <Search size={20} className="search-icon" />
        <input 
          type="text" 
          placeholder="Rechercher une musique, un artiste ou coller un lien (YouTube, Spotify...)" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isLoading}
          className="search-input"
        />
        {(isLoading || isSearchingITunes) && <Loader2 size={20} className="search-spinner" />}
      </form>

      {/* Dynamic Search Results dropdown overlay */}
      {results.length > 0 && (
        <div className="search-results-overlay">
          {results.map((track) => (
            <div key={track.trackId} className="search-result-item">
              <img 
                src={track.artworkUrl60 || track.artworkUrl100} 
                alt={track.trackName} 
                className="search-result-cover" 
              />
              <div className="search-result-info">
                <div className="search-result-title" title={track.trackName}>
                  {track.trackName}
                </div>
                <div className="search-result-artist">
                  {track.artistName} • {track.collectionName || 'Single'}
                </div>
              </div>
              <button 
                onClick={() => handleAddTrack(track)}
                disabled={addingTrackId !== null}
                className={`search-result-add-btn ${addingTrackId === track.trackId ? 'added' : ''}`}
              >
                {addingTrackId === track.trackId ? (
                  <Check size={16} className="add-icon animate-bounce" />
                ) : (
                  <Plus size={16} className="add-icon" />
                )}
                <span>{addingTrackId === track.trackId ? 'Ajouté' : 'Ajouter'}</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
