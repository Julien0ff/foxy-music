import React, { useState, useEffect } from 'react';
import GlassPanel from '../components/GlassPanel';
import TrackList from '../components/TrackList';
import { API_URL } from '../config';
import { usePlayer } from '../contexts/PlayerContext';
import { Radio } from 'lucide-react';

const RadioPage = () => {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { playTrack } = usePlayer();

  useEffect(() => {
    // Fetch a generic "radio" mix via Lavalink search
    fetch(`${API_URL}/api/search?q=lofi+hip+hop+radio+mix`)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setTracks(data);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  return (
    <div className="radio-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
        <Radio size={40} color="var(--fox-orange)" />
        <h1 style={{ color: 'var(--fox-cream)', fontSize: '2.5rem', fontWeight: 700, margin: 0 }}>
          Radio Foxy
        </h1>
      </div>
      <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '1.1rem' }}>
        Une sélection musicale continue, basée sur vos goûts et les tendances actuelles.
      </p>

      <section>
        <h2 style={{ fontSize: '1.25rem', color: 'var(--text-secondary)', marginBottom: '1rem', fontWeight: 600 }}>
          {loading ? 'Connexion à la fréquence...' : 'En direct'}
        </h2>
        <GlassPanel style={{ padding: 0 }}>
          <TrackList tracks={tracks} onPlayTrack={(track) => playTrack(track, tracks)} />
        </GlassPanel>
      </section>
    </div>
  );
};

export default RadioPage;
