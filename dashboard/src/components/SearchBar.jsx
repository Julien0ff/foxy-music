import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { API_URL } from '../config';

export default function SearchBar({ guildId }) {
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async (e) => {
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
      } else {
        alert(data.error || 'Erreur lors de la recherche');
      }
    } catch (e) {
      console.error(e);
      alert('Erreur réseau');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="search-container">
      <form onSubmit={handleSearch} className="search-form">
        <Search size={20} className="search-icon" />
        <input 
          type="text" 
          placeholder="Rechercher ou coller un lien (YouTube, Spotify...)" 
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isLoading}
          className="search-input"
        />
        {isLoading && <Loader2 size={20} className="search-spinner" />}
      </form>
    </div>
  );
}
