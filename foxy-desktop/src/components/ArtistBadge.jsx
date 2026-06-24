import React from 'react';
import { CheckCircle } from 'lucide-react';

const ArtistBadge = ({ style = {}, size = 16, className = '' }) => {
  return (
    <div 
      className={`artist-badge ${className}`} 
      style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        color: 'var(--fox-orange)', 
        ...style 
      }}
      title="Artiste Vérifié Foxy Music"
    >
      <CheckCircle size={size} fill="currentColor" stroke="var(--bg-deep)" strokeWidth={2} />
    </div>
  );
};

export default ArtistBadge;
