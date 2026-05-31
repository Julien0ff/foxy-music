import { useEffect, useState } from 'react';
import { Headphones } from 'lucide-react';
import { API_URL } from '../config';

export default function VoiceChannels({ guildId, onConnect }) {
  const [voiceData, setVoiceData] = useState({ channels: [], botVoiceChannel: null });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guildId) return;
    
    const fetchVoice = async () => {
      try {
        const res = await fetch(`${API_URL}/api/guilds/${guildId}/voice`);
        const data = await res.json();
        if (data && !data.error) {
          setVoiceData(data);
        }
      } catch (e) {
        console.error('Error fetching voice channels:', e);
      } finally {
        setLoading(false);
      }
    };
    
    fetchVoice();
    const interval = setInterval(fetchVoice, 5000); // Polling for now
    
    return () => clearInterval(interval);
  }, [guildId]);

  if (loading) return <div className="voice-channels-loading">Chargement des salons vocaux...</div>;

  return (
    <div className="voice-channels">
      <h3>Salons Vocaux</h3>
      <div className="channels-list">
        {voiceData.channels.map(channel => {
          const isBotActive = voiceData.botVoiceChannel === channel.id;
          const canConnect = !isBotActive;
          
          return (
            <div 
              key={channel.id} 
              className={`channel-item ${isBotActive ? 'bot-active' : ''} ${canConnect ? 'can-connect' : ''}`}
              onClick={canConnect ? () => onConnect(channel.id) : undefined}
            >
              <div className="channel-header">
                <Headphones size={18} />
                <span className="channel-name">{channel.name}</span>
              </div>
              
              {channel.members.length > 0 && (
                <div className="channel-members">
                  {channel.members.map(member => (
                    <div key={member.id} className="member-item">
                      <img src={member.avatar || `https://cdn.discordapp.com/embed/avatars/${parseInt(member.id) % 5}.png`} alt={member.name} className="member-avatar" />
                      <span className="member-name">{member.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {voiceData.channels.length === 0 && (
          <p className="no-channels">Aucun salon vocal disponible.</p>
        )}
      </div>
    </div>
  );
}
