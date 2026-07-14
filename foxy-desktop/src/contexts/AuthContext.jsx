import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('discord_token'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Listen for OAuth callback from Electron main process
    if (window.electron) {
      window.electron.onOAuthCallback((newToken) => {
        setToken(newToken);
        localStorage.setItem('discord_token', newToken);
      });
    }

    // Check for token in URL hash (from Discord redirect)
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      const params = new URLSearchParams(hash.substring(1));
      const accessToken = params.get('access_token');
      if (accessToken) {
        setToken(accessToken);
        localStorage.setItem('discord_token', accessToken);
        // Clean URL
        window.history.replaceState(null, '', window.location.pathname);
        
        // Si on est dans une popup (window.opener existe), on la ferme après avoir passé le token
        if (window.opener) {
          window.close();
        }
      }
    }

    // Écouter les changements de localStorage pour synchroniser la popup avec la fenêtre principale
    const handleStorage = (e) => {
      if (e.key === 'discord_token' && e.newValue) {
        setToken(e.newValue);
      }
    };
    window.addEventListener('storage', handleStorage);

    if (token) {
      // Validate token and fetch user
      fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => {
          if (!res.ok) throw new Error('Token invalid');
          return res.json();
        })
        .then(data => {
          setUser(data);
          setLoading(false);
        })
        .catch(() => {
          setToken(null);
          setUser(null);
          localStorage.removeItem('discord_token');
          setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => window.removeEventListener('storage', handleStorage);
  }, [token]);

  const login = () => {
    // We use the root URL since the user is serving it from localhost:5174
    const CLIENT_ID = '1509947523949662380'; // Remplacez par votre vrai Client ID (celui du bot)
    const REDIRECT_URI = encodeURIComponent('http://localhost:5174');
    // We must use response_type=token so Discord returns the token in the URL hash
    const OAUTH_URL = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=token&scope=identify%20guilds`;

    // Open in a popup window instead of replacing the main app window
    const width = 500;
    const height = 750;
    const left = (window.screen.width / 2) - (width / 2);
    const top = (window.screen.height / 2) - (height / 2);
    
    window.open(OAUTH_URL, 'DiscordLogin', `width=${width},height=${height},top=${top},left=${left}`);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('discord_token');
  };

  return (
    <AuthContext.Provider value={{ token, user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
