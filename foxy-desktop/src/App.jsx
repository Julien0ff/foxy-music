import { useState, useEffect } from 'react';
import { Minimize2, Maximize2, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import NowPlayingBar from './components/NowPlayingBar';
import LoginPage from './pages/LoginPage';
import HomePage from './pages/HomePage';
import ArtistPage from './pages/ArtistPage';
import SearchPage from './pages/SearchPage';
import LibraryPage from './pages/LibraryPage';
import ImportPage from './pages/ImportPage';
import SettingsPage from './pages/SettingsPage';
import { useAuth } from './contexts/AuthContext';
import { usePlayer } from './contexts/PlayerContext';

function App() {
  const [currentRoute, setCurrentRoute] = useState('home');
  const { user, loading, logout } = useAuth();
  const { playTrack } = usePlayer(); // <-- We need this import if not present

  useEffect(() => {
    window.playTrackGlobally = (track) => {
      playTrack(track, [track]);
    };
  }, [playTrack]);

  const handleMinimize = () => window.electron?.window.minimize();
  const handleMaximize = () => window.electron?.window.maximize();
  const handleClose = () => window.electron?.window.close();

  if (loading) {
    return <div className="app-container" style={{ alignItems: 'center', justifyContent: 'center' }}>Chargement...</div>;
  }

  const renderPage = () => {
    switch (currentRoute) {
      case 'home': return <HomePage />;
      case 'playlists': return <LibraryPage />;
      case 'settings': return <SettingsPage />;
      case 'artist': return <ArtistPage />;
      default: return (
        <div style={{ textAlign: 'center', marginTop: '4rem' }}>
          <h1 style={{ color: 'var(--fox-orange)', fontSize: '3rem', marginBottom: '1rem' }}>BIENVENUE</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Sélectionnez une option dans le menu de gauche.</p>
        </div>
      );
    }
  };

  return (
    <div className="app-container">
      <div className="titlebar drag-region">
        <div className="titlebar-content">
          <span className="app-title">Foxy Music</span>
        </div>
      </div>
      
      {!user ? (
        <div className="main-content" style={{ position: 'relative' }}>
          <LoginPage />
        </div>
      ) : (
        <>
          <div className="main-layout" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <Sidebar 
              currentRoute={currentRoute} 
              onRouteChange={setCurrentRoute} 
              onLogout={logout} 
            />
            
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
