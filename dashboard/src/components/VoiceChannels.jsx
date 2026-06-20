import { Headphones, LogIn } from 'lucide-react';

export default function VoiceChannels({ voiceData, onConnect, userId }) {
  const loading = !voiceData || !voiceData.channels;

  if (loading) return <div className="voice-channels-loading">Chargement des salons vocaux...</div>;

  // Find the channel the current user is in (if any)
  const userChannel = userId
    ? voiceData.channels.find(c => c.members.some(m => m.id === userId))
    : null;

  const isBotInUserChannel = userChannel && voiceData.botVoiceChannel === userChannel.id;

  // Group channels by parent category for Discord-like display
  const grouped = [];
  let currentParent = undefined; // using undefined to distinguish from null (no category)
  for (const channel of voiceData.channels) {
    if (channel.parentName !== currentParent) {
      currentParent = channel.parentName;
      if (currentParent) {
        grouped.push({ type: 'category', name: currentParent });
      }
    }
    grouped.push({ type: 'channel', data: channel });
  }

  return (
    <div className="voice-channels">
      <h3>Salons Vocaux</h3>

      {/* Auto-join banner: shown if the user is in a VC and the bot isn't already there */}
      {userChannel && !isBotInUserChannel && (
        <button
          className="auto-join-banner"
          onClick={() => onConnect(userChannel.id)}
        >
          <LogIn size={16} />
          <span>Rejoindre <strong>{userChannel.name}</strong></span>
        </button>
      )}

      <div className="channels-list">
        {grouped.map((item, idx) => {
          if (item.type === 'category') {
            return (
              <div key={`cat-${idx}`} className="channel-category-header">
                {item.name}
              </div>
            );
          }

          const channel = item.data;
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
