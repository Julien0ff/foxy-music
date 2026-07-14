import React from 'react';
import GlassPanel from '../components/GlassPanel';

const SettingsPage = () => {
  return (
    <div className="settings-page">
      <h1 style={{ color: 'var(--fox-orange)', fontSize: '2.5rem', marginBottom: '2rem' }}>
        Paramètres
      </h1>
      <GlassPanel>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Application</h2>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Qualité audio</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Haute (iTunes Preview Stream)</div>
          </div>
          <select style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.2)', color: 'white', padding: '8px', borderRadius: '6px' }}>
            <option>Haute</option>
            <option>Standard</option>
          </select>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1rem 0' }}>
          <div>
            <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>Moteur de recherche</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Utiliser Apple Music API par défaut</div>
          </div>
          <input type="checkbox" checked readOnly style={{ width: '18px', height: '18px' }} />
        </div>
      </GlassPanel>
    </div>
  );
};

export default SettingsPage;
