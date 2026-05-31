import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Player from './components/Player';
import QueueList from './components/QueueList';
import SearchBar from './components/SearchBar';
import Sidebar from './components/Sidebar';
import VoiceChannels from './components/VoiceChannels';
import { Music } from 'lucide-react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import './App.css';

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
      window.history.replaceState(null, null, ' ');
      return accessToken;
    }
  }
  return localStorage.getItem('discord_token');
};

function App() {
  const [token, setToken] = useState(getInitialToken);
  const [user, setUser] = useState(null);
  const [botInfo, setBotInfo] = useState(null);
  const [sharedGuilds, setSharedGuilds] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState(null);
  
  const [queueState, setQueueState] = useState({
    currentTrack: null,
    tracks: [],
    isPlaying: false,
    position: 0,
    duration: 0,
    volume: 100,
    loop: false
  });

  // Discord Activity Setup
  useEffect(() => {
    if (window.top !== window.self) {
      const sdk = new DiscordSDK(CLIENT_ID);
      sdk.ready().then(() => {
        console.log("Discord SDK is ready for Activity!");
        // Note: For fully seamless auth in Activity, a backend token exchange is required.
      }).catch(console.error);
    }
  }, []);

  // Fetch Discord User, Bot Info & Guilds
  useEffect(() => {
    fetch('http://localhost:3001/api/bot/info')
      .then(res => res.json())
      .then(data => {
        if (!data.error) setBotInfo(data);
      })
      .catch(console.error);

    if (token) {
      fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(data => {
        if (data.id) setUser(data);
        else {
          localStorage.removeItem('discord_token');
          setToken(null);
        }
      })
      .catch(() => {
        localStorage.removeItem('discord_token');
        setToken(null);
      });

      // Fetch guilds
      fetch('https://discord.com/api/users/@me/guilds', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(res => res.json())
      .then(guilds => {
        if (Array.isArray(guilds)) {
          fetch('http://localhost:3001/api/user/guilds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guilds })
          })
          .then(res => res.json())
          .then(shared => {
             setSharedGuilds(shared);
             setSelectedGuildId(prev => (shared.length > 0 && !prev) ? shared[0].id : prev);
          });
        }
      });
    }
  }, [token]);

  // Fetch Queue and Socket
  useEffect(() => {
    if (!user || !selectedGuildId) return;

    fetch(`http://localhost:3001/api/guilds/${selectedGuildId}/queue`)
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

    const socket = io('http://localhost:3001');

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

    return () => socket.disconnect();
  }, [user, selectedGuildId]);

  const handleLogout = () => {
    localStorage.removeItem('discord_token');
    setToken(null);
    setUser(null);
    setSharedGuilds([]);
    setSelectedGuildId(null);
  };

  const handleConnectBot = async (channelId) => {
    try {
      await fetch(`http://localhost:3001/api/guilds/${selectedGuildId}/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId })
      });
    } catch (e) {
      console.error(e);
    }
  };

  if (!user) {
    const defaultAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
    const bgImage = botInfo?.avatar || defaultAvatar;
    return (
      <div className="app-container landing-container">
        <div className="dynamic-bg" style={{ backgroundImage: `url(${bgImage})`, filter: 'blur(80px) brightness(0.6)' }}></div>
        <div className="landing-content glass-panel">
          <div className="logo-container" style={{ background: 'transparent', padding: 0, boxShadow: 'none' }}>
            <img src={bgImage} alt="Foxy Music Bot" style={{ width: 120, height: 120, borderRadius: '50%', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', objectFit: 'cover' }} />
          </div>
          <h1>Foxy Music</h1>
          <p>La meilleure expérience musicale pour tes serveurs Discord.</p>
          <a href={OAUTH_URL} className="login-button">Se connecter avec Discord</a>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div 
        className="dynamic-bg" 
        style={{ backgroundImage: queueState.currentTrack && getYoutubeThumbnail(queueState.currentTrack.url) ? `url(${getYoutubeThumbnail(queueState.currentTrack.url)})` : 'none' }}
      ></div>

      <Sidebar 
        guilds={sharedGuilds} 
        selectedGuildId={selectedGuildId} 
        onSelectGuild={setSelectedGuildId} 
        botAvatar={botInfo?.avatar}
        user={user}
        onLogout={handleLogout}
      />

      <div className="main-wrapper">

        <main className="dashboard-layout">
          {selectedGuildId ? (
            <div className="dashboard-grid">
              <div className="left-column">
                <VoiceChannels 
                  guildId={selectedGuildId} 
                  onConnect={handleConnectBot} 
                />
              </div>
              
              <div className="center-column">
                <div className="search-wrapper">
                  <SearchBar guildId={selectedGuildId} />
                </div>
                <div className="player-wrapper">
                  <Player 
                    guildId={selectedGuildId}
                    currentTrack={queueState.currentTrack} 
                    isPlaying={queueState.isPlaying}
                    serverPosition={queueState.position}
                    duration={queueState.duration}
                    volume={queueState.volume}
                    loop={queueState.loop}
                    setQueueState={setQueueState}
                  />
                </div>
              </div>

              <div className="right-column">
                <div className="queue-wrapper">
                  <QueueList tracks={queueState.tracks} />
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
    </div>
  );
}

export default App;
