import React from 'react';
import { Home, Search, Library, Radio, Settings, LogOut } from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ currentRoute = 'home', onRouteChange, onLogout }) => {
  const NavItem = ({ icon: Icon, label, id }) => (
    <div 
      className={`sidebar-item ${currentRoute === id ? 'active' : ''}`}
      onClick={() => onRouteChange(id)}
    >
      <Icon size={20} />
      <span>{label}</span>
    </div>
  );

  return (
    <div className="sidebar">
      <div className="sidebar-search">
        <div className="search-input-mock" onClick={() => onRouteChange('search')}>
          <Search size={16} />
          <span>Rechercher</span>
        </div>
      </div>

      <div className="sidebar-section">
        <h3 className="section-title">Apple Music</h3>
        <NavItem icon={Home} label="Écouter" id="home" />
        <NavItem icon={Radio} label="Parcourir" id="browse" />
        <NavItem icon={Radio} label="Radio" id="radio" />
      </div>

      <div className="sidebar-section">
        <h3 className="section-title">Bibliothèque</h3>
        <NavItem icon={Library} label="Ajouts récents" id="recent" />
        <NavItem icon={Library} label="Artistes" id="artists" />
        <NavItem icon={Library} label="Morceaux" id="tracks" />
      </div>

      <div className="sidebar-section">
        <h3 className="section-title">Playlists</h3>
        <NavItem icon={Library} label="Toutes les playlists" id="playlists" />
      </div>
      
      <div className="sidebar-spacer" />
      
      <div className="sidebar-bottom">
        <NavItem icon={Settings} label="Réglages" id="settings" />
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
