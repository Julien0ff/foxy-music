import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import Hls from 'hls.js';
import Player from './components/Player';
import QueueList from './components/QueueList';
import SearchBar from './components/SearchBar';
import Sidebar from './components/Sidebar';
import VoiceChannels from './components/VoiceChannels';
import { Music, X } from 'lucide-react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import './App.css';
import { API_URL } from './config';
import TermsOfService from './components/TermsOfService';
import PrivacyPolicy from './components/PrivacyPolicy';
import SettingsModal from './components/SettingsModal';

// Ambient blurred looping video background for tracks with Apple Music motion artwork
function AmbientMotionBg({ url, isPlaying }) {
  const videoRef = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    const video = videoRef.current;
    if (!video || !url) return;

    let hls = null;
    let cancelled = false;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = url;
    } else if (Hls && Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        backBufferLength: 30
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    }

    const onPlay = () => {
      if (!cancelled) setReady(true);
    };
    video.addEventListener('playing', onPlay);
    video.play().catch(() => {});

    return () => {
      cancelled = true;
      video.removeEventListener('playing', onPlay);
      if (hls) hls.destroy();
      video.src = '';
    };
  }, [url]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isPlaying]);

  return (
    <video
      ref={videoRef}
      className={`dynamic-bg-motion-video ${ready ? 'active' : ''}`}
      muted
      loop
      playsInline
      autoPlay
      aria-hidden="true"
    />
  );
}

const CLIENT_ID = '1509947523949662380';
const REDIRECT_URI = encodeURIComponent(window.location.origin);
const OAUTH_URL = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=token&scope=identify%20guilds`;

const getYoutubeThumbnail = (url) => {
  if (!url) return null;
  const match = url.match(/(?:v=|youtu\.be\/)([^&?]+)/);
  if (match && match[1]) return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
  return null;
};

const getInitialToken = () => {
  const hash = window.location.hash;
  if (hash && hash.includes('access_token')) {
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    if (accessToken) {
      localStorage.setItem('discord_token', accessToken);
      
      // Si ouvert depuis un iframe d'activité, on notifie la fenêtre parente et ferme l'onglet de login
      try {
        if (window.opener) {
          window.opener.postMessage({ type: 'DISCORD_TOKEN', token: accessToken }, window.location.origin);
          window.close();
        }
      } catch (e) {
        console.error("Impossible de notifier la fenêtre parente :", e);
      }

      window.history.replaceState(null, null, ' ');
      return accessToken;
    }
  }
  return localStorage.getItem('discord_token');
};

const getActivePage = () => {
  const path = window.location.pathname;
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page');

  if (path === '/terms-of-service' || path === '/terms' || hash === '#/terms-of-service' || hash === '#/terms' || page === 'terms') {
    return 'terms';
  }
  if (path === '/privacy-policy' || path === '/privacy' || hash === '#/privacy-policy' || hash === '#/privacy' || page === 'privacy') {
    return 'privacy';
  }
  return 'app';
};

function App() {
  const activePage = getActivePage();

  const [token, setToken] = useState(getInitialToken);
  const [user, setUser] = useState(null);
  const [botInfo, setBotInfo] = useState(null);
  const [sharedGuilds, setSharedGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState(null);
  const [lyricsMode, setLyricsMode] = useState(false);
  const [voiceData, setVoiceData] = useState({ channels: [], botVoiceChannel: null });
  
  // Settings and Playlist Import States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showInvitePopup, setShowInvitePopup] = useState(false);

  // Background crossfade state
  const [bgState, setBgState] = useState({
    bg1: '',
    bg2: '',
    activeBg: 1
  });
  const [prevCover, setPrevCover] = useState('');

  const [queueState, setQueueState] = useState({
    currentTrack: null,
    tracks: [],
    isPlaying: false,
    position: 0,
    duration: 0,
    volume: 100,
    loop: false
  });

  // Apple Music Motion Artwork URL for active track
  const [motionUrl, setMotionUrl] = useState(null);

  useEffect(() => {
    const track = queueState.currentTrack;
    if (!track || !track.title) {
      setMotionUrl(null);
      return;
    }
    let active = true;
    const title = track.title;
    const artist = track.artist || track.author || '';

    fetch(`${API_URL}/api/motion-artwork?title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`)
      .then(res => res.json())
      .then(data => {
        if (active) {
          setMotionUrl(data?.motionUrl || null);
        }
      })
      .catch(() => {
        if (active) setMotionUrl(null);
      });

    return () => {
      active = false;
    };
  }, [queueState.currentTrack?.title, queueState.currentTrack?.artist, queueState.currentTrack?.url]);

  // Écouteurs pour la synchronisation du token OAuth depuis le popup
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data && event.data.type === 'DISCORD_TOKEN') {
        const newToken = event.data.token;
        console.log("Token OAuth reçu via postMessage de la popup !");
        setToken(newToken);
      }
    };

    const handleStorage = (event) => {
      if (event.key === 'discord_token') {
        console.log("Token OAuth reçu via événement de stockage !");
        setToken(event.newValue);
      }
    };

    window.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener('message', handleMessage);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  // Configuration de l'activité Discord
  useEffect(() => {
    if (window.top !== window.self) {
      const sdk = new DiscordSDK(CLIENT_ID);
      sdk.ready().then(() => {
        console.log("Discord SDK est prêt pour l'Activité ! Serveur ID :", sdk.guildId);
        if (sdk.guildId) {
          setSelectedGuildId(sdk.guildId);
        }
      }).catch(console.error);
    }
  }, []);

  // Fetch Discord User, Bot Info & Guilds
  useEffect(() => {
    fetch(`${API_URL}/api/bot/info`)
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setBotInfo(data);
          
          // Mise à jour dynamique du favicon avec l'avatar du bot
          if (data.avatar) {
            let link = document.querySelector("link[rel~='icon']");
            if (!link) {
              link = document.createElement('link');
              link.rel = 'icon';
              document.head.appendChild(link);
            }
            link.href = data.avatar;
            link.type = 'image/png';
          }
        }
      })
      .catch(console.error);

    if (token) {
      const cachedUser = sessionStorage.getItem('discord_user');
      if (cachedUser) {
        setUser(JSON.parse(cachedUser));
      } else {
        fetch('https://discord.com/api/users/@me', {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => {
          if (res.status === 401) {
            localStorage.removeItem('discord_token');
            setToken(null);
            return null;
          }
          if (res.status === 429) return null;
          return res.json();
        })
        .then(data => {
          if (data && data.id) {
            setUser(data);
            sessionStorage.setItem('discord_user', JSON.stringify(data));
          }
        })
        .catch(console.error);
      }

      // Fetch guilds
      const cachedShared = sessionStorage.getItem('discord_shared_guilds');
      if (cachedShared) {
        const shared = JSON.parse(cachedShared);
        setSharedGuilds(shared);
        if (shared.length > 0) {
           setSelectedGuildId(prev => (!prev) ? shared[0].id : prev);
           setShowInvitePopup(false);
        } else {
           setSelectedGuildId(null);
           setShowInvitePopup(true);
        }
      } else {
        fetch('https://discord.com/api/users/@me/guilds', {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then(res => {
          if (res.status === 429) {
            console.warn("Rate limited on /users/@me/guilds");
            return null;
          }
          return res.json();
        })
        .then(guilds => {
          if (Array.isArray(guilds)) {
            fetch(`${API_URL}/api/user/guilds`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ guilds })
            })
            .then(async res => {
              if (!res.ok) {
                console.error('Failed to fetch shared guilds, status:', res.status);
                return [];
              }
              return res.json();
            })
            .then(shared => {
               sessionStorage.setItem('discord_shared_guilds', JSON.stringify(shared));
               setSharedGuilds(shared);
               if (shared.length > 0) {
                 setSelectedGuildId(prev => (!prev) ? shared[0].id : prev);
                 setShowInvitePopup(false);
               } else {
                 setSelectedGuildId(null);
                 setShowInvitePopup(true);
               }
            })
            .catch(err => {
               console.error('Error parsing shared guilds:', err);
               setSharedGuilds([]);
               setShowInvitePopup(true);
            });
          }
        })
        .catch(console.error);
      }
    }
  }, [token]);

  // Fetch Queue and Socket
  useEffect(() => {
    if (!user || !selectedGuildId) return;

    fetch(`${API_URL}/api/guilds/${selectedGuildId}/queue`)
      .then(res => res.json())
      .then(data => {
        setQueueState({
          currentTrack: data.currentTrack,
          tracks: data.tracks || [],
          isPlaying: data.isPlaying,
          position: data.position || 0,
          duration: data.duration || 0,
          volume: data.volume || 100,
          loop: data.loop || false
        });
      })
      .catch(err => console.error("Failed to fetch initial queue:", err));

    fetch(`${API_URL}/api/guilds/${selectedGuildId}/voice`)
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setVoiceData(data);
        }
      })
      .catch(err => console.error("Failed to fetch initial voice state:", err));

    const socket = io(API_URL);

    socket.on('connect', () => {
      console.log('Connected to Foxy Music API');
      socket.emit('subscribe_queue', selectedGuildId);
    });

    socket.on('queue_update', (data) => {
      setQueueState({
        currentTrack: data.currentTrack,
        tracks: data.tracks || [],
        isPlaying: data.isPlaying,
        position: data.position || 0,
        duration: data.duration || 0,
        volume: data.volume || 100,
        loop: data.loop || false
      });
    });

    socket.on('player_position', (data) => {
      if (data && typeof data.position === 'number') {
        setQueueState(prev => ({
          ...prev,
          position: data.position,
          positionTimestamp: data.timestamp || Date.now(),
          isPlaying: typeof data.isPlaying === 'boolean' ? data.isPlaying : prev.isPlaying
        }));
      }
    });

    socket.on('voice_update', (data) => {
      setVoiceData(data);
    });

    return () => socket.disconnect();
  }, [user, selectedGuildId]);

  // Background Image Crossfading Synchronizer during render phase to avoid synchronous useEffect setState triggers
  const cover = queueState.currentTrack?.artworkUrl || getYoutubeThumbnail(queueState.currentTrack?.url) || botInfo?.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
  if (cover !== prevCover) {
    setPrevCover(cover);
    setBgState(prev => {
      if (prev.activeBg === 1) {
        if (prev.bg1 === cover) return prev;
        return {
          bg1: prev.bg1,
          bg2: cover,
          activeBg: 2
        };
      } else {
        if (prev.bg2 === cover) return prev;
        return {
          bg1: cover,
          bg2: prev.bg2,
          activeBg: 1
        };
      }
    });
  }

  const handleLogout = () => {
    localStorage.removeItem('discord_token');
    sessionStorage.removeItem('discord_user');
    sessionStorage.removeItem('discord_shared_guilds');
    setToken(null);
    setUser(null);
    setSharedGuilds([]);
    setSelectedGuildId(null);
  };

  const handleConnectBot = async (channelId) => {
    try {
      const res = await fetch(`${API_URL}/api/guilds/${selectedGuildId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.error || 'Erreur lors de la connexion du bot au salon vocal.');
      }
    } catch (e) {
      console.error(e);
      alert('Erreur réseau lors de la tentative de connexion au salon vocal.');
    }
  };


  const handleRemoveTrack = async (index) => {
    if (!selectedGuildId) return;
    try {
      await fetch(`${API_URL}/api/guilds/${selectedGuildId}/queue/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index })
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleClearQueue = async () => {
    if (!selectedGuildId) return;
    try {
      await fetch(`${API_URL}/api/guilds/${selectedGuildId}/queue/clear`, {
        method: 'POST'
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleShuffleQueue = async () => {
    if (!selectedGuildId) return;
    try {
      await fetch(`${API_URL}/api/guilds/${selectedGuildId}/queue/shuffle`, {
        method: 'POST'
      });
    } catch (e) {
      console.error(e);
    }
  };
  if (activePage === 'terms') {
    return <TermsOfService />;
  }
  if (activePage === 'privacy') {
    return <PrivacyPolicy />;
  }

  if (!user) {
    const defaultAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
    const bgImage = botInfo?.avatar || defaultAvatar;
    return (
      <div className="app-container landing-container">
        <div className="dynamic-bg-container">
          <div className="dynamic-bg active" style={{ backgroundImage: `url(${bgImage})` }}></div>
        </div>
        <div className="landing-content glass-panel">
          <div className="logo-container" style={{ background: 'transparent', padding: 0, boxShadow: 'none' }}>
            <img src={bgImage} alt="Foxy Music Bot" style={{ width: 120, height: 120, borderRadius: '50%', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', objectFit: 'cover' }} />
          </div>
          <h1>Foxy Music</h1>
          <p>La meilleure expérience musicale pour tes serveurs Discord.</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', width: '100%', maxWidth: '300px', margin: '0 auto' }}>
            <a href={OAUTH_URL} target="_blank" rel="noopener noreferrer" className="login-button">Se connecter avec Discord</a>
            
            <a 
              href="foxymusic://open" 
              className="login-button" 
              style={{ 
                background: 'rgba(255, 255, 255, 0.1)', 
                color: 'var(--text-main)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                boxShadow: 'none'
              }}
            >
              Ouvrir l'application
            </a>
          </div>
          
          <div style={{ marginTop: '20px', display: 'flex', gap: '16px', fontSize: '12px' }}>
            <a href="#/terms-of-service" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'var(--transition)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}>Conditions d'utilisation</a>
            <span style={{ color: 'rgba(255, 255, 255, 0.15)' }}>|</span>
            <a href="#/privacy-policy" style={{ color: 'var(--text-muted)', textDecoration: 'none', transition: 'var(--transition)' }} onMouseEnter={(e) => e.currentTarget.style.color = 'var(--text-main)'} onMouseLeave={(e) => e.currentTarget.style.color = 'var(--text-muted)'}>Politique de confidentialité</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {/* Premium Double Layer Crossfading Backgrounds & Dynamic Aurora Mesh */}
      <div className="dynamic-bg-container">
        {/* Continuous organic fluid aurora orbs (animated in all cases!) */}
        <div className="dynamic-aurora-mesh" aria-hidden="true">
          <div className="aurora-orb orb-1" />
          <div className="aurora-orb orb-2" />
          <div className="aurora-orb orb-3" />
          <div className="aurora-orb orb-4" />
        </div>

        {/* Ambient Motion Video Background (when official Apple Music motion artwork is available) */}
        {motionUrl && (
          <AmbientMotionBg url={motionUrl} isPlaying={queueState.isPlaying} />
        )}

        {/* Static cover crossfading layers with continuous breathing float animation */}
        <div 
          className={`dynamic-bg ${bgState.activeBg === 1 ? 'active' : ''}`} 
          style={{ backgroundImage: bgState.bg1 ? `url(${bgState.bg1})` : 'none' }}
        ></div>
        <div 
          className={`dynamic-bg ${bgState.activeBg === 2 ? 'active' : ''}`} 
          style={{ backgroundImage: bgState.bg2 ? `url(${bgState.bg2})` : 'none' }}
        ></div>

        <div className="dynamic-ambient-overlay" aria-hidden="true" />
      </div>

      <Sidebar 
        guilds={sharedGuilds} 
        selectedGuildId={selectedGuildId} 
        onSelectGuild={setSelectedGuildId} 
        botAvatar={botInfo?.avatar}
        user={user}
        onLogout={handleLogout}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      <div className="main-wrapper">
        <main className="dashboard-layout">
          {selectedGuildId ? (
            <div className={`dashboard-grid ${lyricsMode ? 'lyrics-active-grid' : ''}`}>
              <div className="left-column">
                <VoiceChannels 
                  voiceData={voiceData}
                  onConnect={handleConnectBot}
                  userId={user?.id}
                />
              </div>
              
              <div className={`center-column ${lyricsMode ? 'lyrics-center' : ''}`}>
                <div className={`search-wrapper ${lyricsMode ? 'search-hidden' : ''}`}>
                  <SearchBar guildId={selectedGuildId} />
                </div>
                <div className={`player-wrapper ${lyricsMode ? 'lyrics-player-wrapper' : ''}`}>
                  <Player 
                    guildId={selectedGuildId}
                    currentTrack={queueState.currentTrack} 
                    isPlaying={queueState.isPlaying}
                    serverPosition={queueState.position}
                    positionTimestamp={queueState.positionTimestamp}
                    duration={queueState.duration}
                    volume={queueState.volume}
                    loop={queueState.loop}
                    setQueueState={setQueueState}
                    onLyricsToggle={setLyricsMode}
                    tracks={queueState.tracks}
                    motionUrl={motionUrl}
                  />
                </div>
              </div>

              <div className={`right-column ${lyricsMode ? 'right-column-hidden' : ''}`}>
                <div className="queue-wrapper">
                  <QueueList 
                    tracks={queueState.tracks} 
                    onRemoveTrack={handleRemoveTrack}
                    onClearQueue={handleClearQueue}
                    onShuffleQueue={handleShuffleQueue}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="no-server-selected">
              <Music size={48} opacity={0.5} />
              <h2>Aucun serveur sélectionné</h2>
              <p>Sélectionnez un serveur dans la barre latérale pour gérer la musique.</p>
            </div>
          )}
        </main>
      </div>

      {/* Settings Modal */}
      {isSettingsOpen && (
        <SettingsModal 
          onClose={() => setIsSettingsOpen(false)} 
          selectedGuildId={selectedGuildId} 
        />
      )}

      {/* Invite Modal */}
      {showInvitePopup && (
        <div className="settings-modal" onClick={() => setShowInvitePopup(false)}>
            <div className="settings-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px', textAlign: 'center' }}>
                <div className="settings-header" style={{ justifyContent: 'center', position: 'relative' }}>
                    <h3 className="settings-title">Inviter Foxy Music</h3>
                    <button className="settings-close" onClick={() => setShowInvitePopup(false)} style={{ position: 'absolute', right: '1.5rem' }}>
                        <X size={20} />
                    </button>
                </div>
                <div className="settings-body" style={{ padding: '2rem 1rem' }}>
                    <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', lineHeight: '1.5' }}>
                        Il semble que nous n'ayons aucun serveur en commun. Invitez le bot sur votre serveur pour commencer à écouter de la musique !
                    </p>
                    <a 
                        href={`https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&permissions=8&scope=bot%20applications.commands`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="save-btn"
                        style={{ display: 'inline-flex', textDecoration: 'none', justifyContent: 'center', width: '100%', padding: '12px' }}
                        onClick={() => setShowInvitePopup(false)}
                    >
                        Inviter le bot
                    </a>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}

export default App;
