import { useState } from 'react';
import { Settings, LogOut } from 'lucide-react';

export default function Sidebar({ guilds, selectedGuildId, onSelectGuild, botAvatar, user, onLogout, onOpenSettings }) {
  const [showUserPopup, setShowUserPopup] = useState(false);
  const defaultAvatar = 'https://cdn.discordapp.com/embed/avatars/0.png';
  const avatarUrl = botAvatar || defaultAvatar;

  const userAvatarUrl = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
    : defaultAvatar;

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <img src={avatarUrl} alt="Foxy" className="bot-avatar-sidebar" />
      </div>

      <div className="sidebar-list">
        {guilds.map(guild => (
          <button 
            key={guild.id} 
            className={`sidebar-item ${selectedGuildId === guild.id ? 'active' : ''}`}
            onClick={() => onSelectGuild(guild.id)}
            title={guild.name}
          >
            {guild.icon ? (
              <img src={guild.icon} alt={guild.name} className="guild-icon" />
            ) : (
              <div className="guild-icon-placeholder">
                {guild.name.substring(0, 2).toUpperCase()}
              </div>
            )}
          </button>
        ))}
        {guilds.length === 0 && (
          <div className="sidebar-empty">
            <p>—</p>
          </div>
        )}
      </div>

      {user && (
        <div className="sidebar-footer">
          <div className="sidebar-user" onClick={() => setShowUserPopup(!showUserPopup)}>
            <img src={userAvatarUrl} alt="User" className="sidebar-user-avatar" />
          </div>
          {showUserPopup && (
            <div className="user-popup">
              <div className="user-popup-header">
                <img src={userAvatarUrl} alt="User" className="popup-avatar" />
                <div className="popup-info">
                  <span className="popup-name">{user.global_name || user.username}</span>
                  <span className="popup-tag">@{user.username}</span>
                </div>
              </div>
              <button 
                className="popup-settings" 
                onClick={() => {
                  setShowUserPopup(false);
                  onOpenSettings();
                }}
              >
                <Settings size={16} className="popup-settings-icon" />
                <span>Paramètres</span>
              </button>
              <button 
                className="popup-logout" 
                onClick={() => {
                  setShowUserPopup(false);
                  onLogout();
                }}
              >
                <LogOut size={16} className="popup-logout-icon" />
                <span>Déconnexion</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

