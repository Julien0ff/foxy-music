import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { API_URL } from '../config';
import './LoginPage.css';

const LoginPage = () => {
  const { login } = useAuth();
  const [botAvatar, setBotAvatar] = useState("https://cdn.discordapp.com/embed/avatars/4.png"); // Default orange

  useEffect(() => {
    fetch(`${API_URL}/api/bot/info`)
      .then(res => res.json())
      .then(data => {
        if (data && data.avatar) {
          setBotAvatar(data.avatar);
        }
      })
      .catch(console.error);
  }, []);

  return (
    <div className="login-page">
      <div className="login-content glass-panel">
        <div className="logo-container">
          <img 
            src={botAvatar} 
            alt="Foxy Music" 
            className="login-logo" 
          />
        </div>
        <h1 className="login-title">Foxy Music</h1>
        <p className="login-subtitle">Connecte-toi pour accéder à toute ta musique.</p>
        
        <button className="discord-btn" onClick={login}>
          Se connecter avec Discord
        </button>
      </div>
    </div>
  );
};

export default LoginPage;
