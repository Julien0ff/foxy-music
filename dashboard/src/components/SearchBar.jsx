import { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Plus, Check, Upload } from 'lucide-react';
import { API_URL } from '../config';

export default function SearchBar({ guildId }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearchingITunes, setIsSearchingITunes] = useState(false);
  const [addingTrackId, setAddingTrackId] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
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

  // Handle Audio File Upload (from click or drop)
  const handleUploadFile = async (file) => {
    if (!file) return;

    const supportedExts = ['.mp3', '.m4a', '.wav', '.flac', '.ogg', '.oga', '.aac', '.opus', '.webm', '.wma'];
    const fileName = file.name.toLowerCase();
    const isAudio = supportedExts.some(ext => fileName.endsWith(ext)) || file.type.startsWith('audio/');

    if (!isAudio) {
      alert(`Format de fichier non supporté. Formats acceptés : ${supportedExts.join(', ')}.`);
      return;
    }

    setIsUploading(true);
    setUploadProgress(`Téléversement de ${file.name}...`);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`${API_URL}/api/guilds/${guildId}/play-file`, {
        method: 'POST',
        body: formData
      });

      const data = await res.json();
      if (data.success) {
        setUploadProgress('Morceau ajouté à la lecture !');
        setTimeout(() => {
          setUploadProgress('');
        }, 2500);
      } else {
        alert(data.error || 'Erreur lors de l\'envoi du fichier');
        setUploadProgress('');
      }
    } catch (err) {
      console.error('[Upload Error]', err);
      alert('Erreur lors du transfert du fichier.');
      setUploadProgress('');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) handleUploadFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleUploadFile(file);
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
        setTimeout(() => {
          setAddingTrackId(null);
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
    <div 
      className={`search-container ${isDragging ? 'is-dragging' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <form onSubmit={handleSubmit} className="search-form">
        <Search size={20} className="search-icon" />
        <input 
          type="text" 
          placeholder={uploadProgress || "Rechercher, coller un lien ou déposer un fichier audio..."} 
          value={uploadProgress ? '' : query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={isLoading || isUploading}
          className={`search-input ${uploadProgress ? 'upload-active-placeholder' : ''}`}
        />
        
        {/* Hidden File Input */}
        <input 
          type="file" 
          ref={fileInputRef} 
          accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.oga,.aac,.opus,.webm" 
          style={{ display: 'none' }} 
          onChange={handleFileChange} 
        />

        {/* Upload File Button */}
        <button
          type="button"
          className={`search-upload-btn ${isUploading ? 'uploading' : ''}`}
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || isUploading}
          title="Uploader un fichier audio (.mp3, .m4a, .wav...)"
        >
          {isUploading ? (
            <Loader2 size={18} className="search-spinner" />
          ) : (
            <Upload size={18} />
          )}
        </button>

        {(isLoading || isSearchingITunes) && !isUploading && (
          <Loader2 size={20} className="search-spinner" />
        )}
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
