import React, { useState } from 'react';
import { Home, Search, Library, Music, Mic2, ListMusic, DownloadCloud, Settings, LogOut, Clock } from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ currentRoute = 'home', onRouteChange, onLogout, globalSearch, setGlobalSearch }) => {
  const NavItem = ({ icon: Icon, label, id }) => (
    <div 
      className={`sidebar-item ${currentRoute === id ? 'active' : ''}`}
      onClick={() => onRouteChange(id)}
    >
      <Icon size={20} />
      <span>{label}</span>
    </div>
  );

  const [localQuery, setLocalQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setLocalQuery(val);
    if (val.trim() !== '') {
      setIsSearching(true);
      fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(val)}&entity=song&limit=5`)
        .then(res => res.json())
        .then(data => {
          if (data && data.results) {
            setSearchResults(data.results.map(t => ({
              title: t.trackName,
              artist: t.artistName,
              url: t.previewUrl,
              duration: t.trackTimeMillis || 30000,
              artworkUrl: t.artworkUrl100 ? t.artworkUrl100.replace('100x100', '600x600') : null
            })).filter(t => t.url));
          }
        })
        .finally(() => setIsSearching(false));
    } else {
      setSearchResults([]);
    }
  };

  const handlePlayFromSearch = (track) => {
    // We will use the global player to play this track.
    // Since we don't have playTrack in Sidebar directly, we can pass it via props or dispatch an event.
    // For now, we will dispatch a custom event that App.jsx or PlayerContext can listen to, or pass it up.
    if (window.playTrackGlobally) {
      window.playTrackGlobally(track);
    }
    setLocalQuery('');
    setSearchResults([]);
  };

  return (
    <div className="sidebar">
      <div className="sidebar-search" style={{ position: 'relative' }}>
        <div className="search-input-container" style={{
          background: 'rgba(0, 0, 0, 0.2)', borderRadius: '6px', padding: '6px 10px', 
          display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <Search size={16} color="var(--text-secondary)" />
          <input 
            type="text" 
            placeholder="Rechercher" 
            value={localQuery}
            onChange={handleSearchChange}
            style={{ 
              background: 'transparent', border: 'none', color: 'var(--text-primary)', 
              outline: 'none', width: '100%', fontSize: '13px' 
            }}
          />
        </div>
        
        {/* Dropdown Menu */}
        {localQuery && (
          <div style={{
            position: 'absolute', top: '100%', left: '1rem', right: '1rem',
            background: 'rgba(30, 30, 32, 0.95)', backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '8px',
            marginTop: '4px', zIndex: 100, maxHeight: '300px', overflowY: 'auto',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
          }}>
            {isSearching ? (
              <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>Recherche...</div>
            ) : searchResults.length > 0 ? (
              searchResults.map((track, i) => (
                <div key={i} onClick={() => handlePlayFromSearch(track)} style={{
                  display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                  cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)'
                }} className="search-result-item">
                  <img src={track.artworkUrl} alt="" style={{ width: '32px', height: '32px', borderRadius: '4px', objectFit: 'cover' }} />
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '13px', color: 'white', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{track.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{track.artist}</div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text-secondary)', textAlign: 'center' }}>Aucun résultat</div>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-section">
        <NavItem icon={Home} label="Accueil" id="home" />
        <NavItem icon={Search} label="Rechercher" id="search" />
      </div>

      <div className="sidebar-section" style={{ marginTop: '1rem', flex: 1, overflowY: 'auto' }}>
        <h3 className="section-title" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '10px' }}>Playlists</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <NavItem icon={ListMusic} label="Toutes les playlists" id="playlists" />
          <div style={{ padding: '8px 16px', color: 'var(--text-secondary)', fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '12px', transition: '0.2s', borderRadius: '6px' }} className="nav-item">
            <div style={{ width: '20px', height: '20px', background: 'var(--fox-orange)', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: 'white', fontSize: '10px', fontWeight: 'bold' }}>+</span>
            </div>
            Créer une playlist...
          </div>
          <NavItem icon={Music} label="Morceaux préférés" id="liked" />
          <NavItem icon={Music} label="Playlist pour le bus" id="bus" />
          <NavItem icon={Music} label="femboy music" id="femboy" />
          <NavItem icon={Music} label="Hazbin Hotel" id="hazbin" />
          <NavItem icon={Music} label="Omori OST" id="omori" />
        </div>
      </div>
      
      <div className="sidebar-spacer" />
      
      <div className="sidebar-bottom">
        <NavItem icon={Settings} label="Paramètres" id="settings" />
        {onLogout && (
          <div className="sidebar-item logout-btn" onClick={onLogout}>
            <LogOut size={20} />
            <span>Déconnexion</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default Sidebar;
