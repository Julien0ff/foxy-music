import { useState } from 'react';
import { Minimize2, Maximize2, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import NowPlayingBar from './components/NowPlayingBar';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ArtistPage from './pages/ArtistPage';
import SearchPage from './pages/SearchPage';
import LibraryPage from './pages/LibraryPage';
import ImportPage from './pages/ImportPage';
import { useAuth } from './contexts/AuthContext';

function App() {
  const [currentRoute, setCurrentRoute] = useState('home');
  const { user, loading, logout } = useAuth();

  const handleMinimize = () => window.electron?.window.minimize();
  const handleMaximize = () => window.electron?.window.maximize();
  const handleClose = () => window.electron?.window.close();

  if (loading) {
    return <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>Chargement...</div>;
  }

  const renderPage = () => {
    switch (currentRoute) {
      case 'home': return <HomePage />;
      case 'search': return <SearchPage />;
      case 'artists': return <ArtistPage />;
      case 'tracks': 
      case 'recent':
      case 'playlists': return <LibraryPage />;
      case 'browse': return <ImportPage />; // Using Browse for Import for now
      default: return (
        <>
          <h1 style={{ color: 'var(--fox-orange)', fontSize: '3rem', marginBottom: '1rem' }}>{currentRoute.toUpperCase()}</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Contenu de la page en construction...</p>
        </>
      );
    }
  };

  return (
    <div className="app-container">
      <div className="titlebar drag-region">
        <div className="titlebar-content">
          <span className="app-title">Foxy Music</span>
        </div>
        <div className="window-controls no-drag">
          <button className="window-btn minimize" onClick={handleMinimize}><Minimize2 size={14} /></button>
          <button className="window-btn maximize" onClick={handleMaximize}><Maximize2 size={14} /></button>
          <button className="window-btn close" onClick={handleClose}><X size={14} /></button>
        </div>
      </div>
      
      {!user ? (
        <div className="main-content" style={{ position: 'relative' }}>
          <LoginPage />
        </div>
      ) : (
        <>
          <div className="main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Sidebar currentRoute={currentRoute} onRouteChange={setCurrentRoute} onLogout={logout} />
            
            <div className="main-content" style={{ flex: 1, padding: '2rem', overflowY: 'auto' }}>
              {renderPage()}
            </div>
          </div>

          <NowPlayingBar />
        </>
      )}
    </div>
  );
}

export default App;
