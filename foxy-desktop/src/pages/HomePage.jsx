import React from 'react';
import { Search } from 'lucide-react';

const HomePage = () => {
  return (
    <div className="home-page" style={{ 
      display: 'flex', flexDirection: 'column', alignItems: 'center', 
      justifyContent: 'center', height: '100%', textAlign: 'center' 
    }}>
      <h1 style={{ color: 'var(--fox-orange)', fontSize: '3rem', marginBottom: '1rem', fontWeight: 800, letterSpacing: '-1px' }}>
        Bienvenue sur Foxy Music
      </h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', maxWidth: '600px', lineHeight: '1.6' }}>
        Toute la musique du monde, à portée de main. <br/>
        Utilisez la barre de recherche dans le menu pour trouver un morceau ou un artiste.
      </p>
      
      <div style={{ marginTop: '3rem', color: 'var(--text-secondary)', opacity: 0.5 }}>
        <Search size={64} />
      </div>
    </div>
  );
};

export default HomePage;
