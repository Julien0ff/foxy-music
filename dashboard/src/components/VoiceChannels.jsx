import { Headphones } from 'lucide-react';

export default function VoiceChannels({ voiceData, onConnect }) {
  const loading = !voiceData || !voiceData.channels;

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
