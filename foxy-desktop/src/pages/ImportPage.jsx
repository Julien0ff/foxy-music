import React, { useState } from 'react';
import GlassPanel from '../components/GlassPanel';
import { DownloadCloud, CheckCircle } from 'lucide-react';

const ImportPage = () => {
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle, loading, success, error

  const handleImport = async () => {
    if (!url) return;
    setStatus('loading');
    
    // Simulating API call to /api/users/:id/import/spotify
    setTimeout(() => {
      setStatus('success');
    }, 2000);
  };

  return (
    <div className="import-page" style={{ maxWidth: '600px', margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: '3rem' }}>
        <h1 style={{ color: 'var(--fox-cream)', fontSize: '2.5rem', marginBottom: '1rem', fontWeight: 700 }}>
          Importer votre musique
        </h1>
        <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Collez le lien public de votre playlist Spotify ou Apple Music. 
          Nous trouverons automatiquement les titres sur Foxy Music.
        </p>
      </div>

      <GlassPanel style={{ padding: '2rem' }}>
        {status === 'success' ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <CheckCircle size={48} color="var(--fox-orange)" style={{ margin: '0 auto 1rem' }} />
            <h2 style={{ color: 'white', marginBottom: '0.5rem' }}>Importation réussie !</h2>
            <p style={{ color: 'var(--text-secondary)' }}>Vos titres ont été ajoutés à votre bibliothèque.</p>
            <button 
              onClick={() => { setStatus('idle'); setUrl(''); }}
              style={{
                marginTop: '2rem',
                background: 'rgba(255,255,255,0.1)',
                border: 'none',
                padding: '10px 24px',
                color: 'white',
                borderRadius: '20px',
                cursor: 'pointer'
              }}
            >
              Importer une autre playlist
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)', fontSize: '14px' }}>
                Lien de la playlist (Spotify ou Apple Music)
              </label>
              <input 
                type="text" 
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://open.spotify.com/playlist/..." 
                style={{
                  width: '100%',
                  padding: '14px 16px',
                  background: 'rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '8px',
                  color: 'white',
                  fontSize: '15px',
                  outline: 'none'
                }}
              />
            </div>
            
            <button 
              onClick={handleImport}
              disabled={!url || status === 'loading'}
              style={{
                background: 'var(--fox-orange)',
                color: 'white',
                border: 'none',
                padding: '14px',
                borderRadius: '8px',
                fontSize: '16px',
                fontWeight: 600,
                cursor: url && status !== 'loading' ? 'pointer' : 'not-allowed',
                opacity: url && status !== 'loading' ? 1 : 0.5,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <DownloadCloud size={20} />
              {status === 'loading' ? 'Importation en cours...' : 'Lancer l\'importation'}
            </button>
          </div>
        )}
      </GlassPanel>
    </div>
  );
};

export default ImportPage;
