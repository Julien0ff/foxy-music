import React, { useState, useEffect } from 'react';
import { Settings, X, Loader2, Music, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || '';

export default function SettingsModal({ onClose, selectedGuildId }) {
    const [activeTab, setActiveTab] = useState('import');
    
    // Import state
    const [playlistUrl, setPlaylistUrl] = useState('');
    const [isImporting, setIsImporting] = useState(false);
    const [importProgress, setImportProgress] = useState(null);
    
    // Config state
    const [config, setConfig] = useState(null);
    const [roles, setRoles] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [saveStatus, setSaveStatus] = useState(null); // 'success' | 'error' | null

    useEffect(() => {
        if (!selectedGuildId) return;
        
        // Fetch config
        fetch(`${API_URL}/api/guilds/${selectedGuildId}/config`)
            .then(res => res.json())
            .then(data => setConfig(data))
            .catch(console.error);
            
        // Fetch roles
        fetch(`${API_URL}/api/guilds/${selectedGuildId}/roles`)
            .then(res => res.json())
            .then(data => {
                if (!data.error) setRoles(data);
            })
            .catch(console.error);

        // Socket for import progress
        const socket = io(API_URL);
        socket.on('connect', () => {
            socket.emit('subscribe_queue', selectedGuildId);
        });

        socket.on('import_progress', (data) => {
            setImportProgress(data);
        });

        return () => socket.disconnect();
    }, [selectedGuildId]);

    const handleImportPlaylist = async () => {
        if (!playlistUrl.trim() || !selectedGuildId) return;

        setIsImporting(true);
        setImportProgress(null);
        try {
            const res = await fetch(`${API_URL}/api/guilds/${selectedGuildId}/playlist-import`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: playlistUrl.trim() })
            });

            const data = await res.json();
            if (!data.success) {
                setImportProgress({ status: 'error', message: data.error || 'Erreur lors de l\'importation' });
            }
        } catch (e) {
            console.error(e);
            setImportProgress({ status: 'error', message: 'Erreur réseau' });
        } finally {
            setIsImporting(false);
        }
    };

    const handleSaveConfig = async () => {
        if (!config || !selectedGuildId) return;
        setIsSaving(true);
        setSaveStatus(null);
        try {
            const res = await fetch(`${API_URL}/api/guilds/${selectedGuildId}/config`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    twentyFourSeven: config.twentyFourSeven,
                    djRoleId: config.djRoleId,
                    defaultVolume: config.defaultVolume,
                    autoplay: config.autoplay
                })
            });
            const data = await res.json();
            if (data.success) {
                setConfig(data.config);
                setSaveStatus('success');
                setTimeout(() => setSaveStatus(null), 3000);
            } else {
                setSaveStatus('error');
            }
        } catch (e) {
            console.error(e);
            setSaveStatus('error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleConfigChange = (key, value) => {
        setConfig(prev => ({ ...prev, [key]: value }));
    };

    const getPlatformIcon = (url) => {
        if (url.includes('spotify.com')) return 'https://storage.googleapis.com/pr-newsroom-wp/1/2018/11/Spotify_Logo_RGB_Green.png';
        if (url.includes('youtube.com') || url.includes('youtu.be')) return 'https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg';
        if (url.includes('deezer.com')) return 'https://upload.wikimedia.org/wikipedia/commons/d/db/Deezer_logo.svg';
        if (url.includes('soundcloud.com')) return 'https://upload.wikimedia.org/wikipedia/commons/a/a2/SoundCloud_logo.svg';
        if (url.includes('music.apple.com')) return 'https://upload.wikimedia.org/wikipedia/commons/f/fa/Apple_logo_black.svg';
        return null;
    };

    return (
        <div className="settings-modal" onClick={onClose}>
            <div className="settings-card" onClick={(e) => e.stopPropagation()}>
                <div className="settings-header">
                    <div className="settings-title-group">
                        <Settings size={20} className="settings-title-icon" />
                        <span className="settings-title">Paramètres</span>
                    </div>
                    <button className="settings-close" onClick={onClose}>
                        <X size={20} />
                    </button>
                </div>

                <div className="settings-tabs">
                    <button 
                        className={`settings-tab ${activeTab === 'import' ? 'active' : ''}`}
                        onClick={() => setActiveTab('import')}
                    >
                        Import de Playlist
                    </button>
                    <button 
                        className={`settings-tab ${activeTab === 'config' ? 'active' : ''}`}
                        onClick={() => setActiveTab('config')}
                    >
                        Serveur
                    </button>
                </div>

                <div className="settings-body">
                    {activeTab === 'import' && (
                        <div className="settings-section">
                            <h3 className="settings-section-title">Importer des Playlists</h3>
                            <p className="settings-section-desc">
                                Supporte <strong>Spotify</strong>, <strong>YouTube</strong>, <strong>Deezer</strong>, <strong>SoundCloud</strong> et <strong>Apple Music</strong>.
                            </p>
                            
                            <div className="playlist-import-form">
                                <div className="input-with-platform">
                                    {getPlatformIcon(playlistUrl) && (
                                        <img src={getPlatformIcon(playlistUrl)} alt="platform" className="platform-icon" />
                                    )}
                                    <input 
                                        type="text" 
                                        placeholder="Ex: https://open.spotify.com/playlist/..."
                                        value={playlistUrl}
                                        onChange={(e) => setPlaylistUrl(e.target.value)}
                                        className="playlist-import-input"
                                        disabled={isImporting}
                                    />
                                </div>
                                <button 
                                    onClick={handleImportPlaylist}
                                    disabled={isImporting || !playlistUrl.trim()}
                                    className="playlist-import-btn"
                                >
                                    {isImporting ? (
                                        <>
                                            <Loader2 size={16} className="animate-spin" />
                                            <span>Importation...</span>
                                        </>
                                    ) : (
                                        <span>Importer</span>
                                    )}
                                </button>
                            </div>

                            {importProgress && (
                                <div className={`import-progress-box ${importProgress.status}`}>
                                    <div className="import-progress-header">
                                        <div className="import-progress-status">
                                            {importProgress.status === 'parsing' && <Loader2 size={16} className="animate-spin text-blue" />}
                                            {importProgress.status === 'parsed' && <Loader2 size={16} className="animate-spin text-yellow" />}
                                            {importProgress.status === 'done' && <CheckCircle2 size={16} className="text-green" />}
                                            {importProgress.status === 'error' && <AlertCircle size={16} className="text-red" />}
                                            <span>{importProgress.message}</span>
                                        </div>
                                        {importProgress.name && (
                                            <span className="import-progress-name">{importProgress.name}</span>
                                        )}
                                    </div>
                                    {importProgress.total && importProgress.status !== 'error' && (
                                        <div className="progress-bar-container">
                                            <div 
                                                className={`progress-bar-fill ${importProgress.status}`}
                                                style={{ width: importProgress.status === 'done' ? '100%' : '50%' }}
                                            ></div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'config' && config && (
                        <div className="settings-section server-settings">
                            <div className="setting-row">
                                <div className="setting-info">
                                    <h4>Mode 24/7</h4>
                                    <p>Le bot reste connecté dans le salon même s'il n'y a plus de musique.</p>
                                </div>
                                <label className="toggle-switch">
                                    <input 
                                        type="checkbox" 
                                        checked={config.twentyFourSeven} 
                                        onChange={(e) => handleConfigChange('twentyFourSeven', e.target.checked)}
                                    />
                                    <span className="slider round"></span>
                                </label>
                            </div>

                            <div className="setting-row">
                                <div className="setting-info">
                                    <h4>Lecture Automatique (Autoplay)</h4>
                                    <p>Joue des titres recommandés quand la file d'attente est vide.</p>
                                </div>
                                <label className="toggle-switch">
                                    <input 
                                        type="checkbox" 
                                        checked={config.autoplay} 
                                        onChange={(e) => handleConfigChange('autoplay', e.target.checked)}
                                    />
                                    <span className="slider round"></span>
                                </label>
                            </div>

                            <div className="setting-row">
                                <div className="setting-info">
                                    <h4>Rôle DJ</h4>
                                    <p>Restreindre les commandes de musique à un rôle spécifique.</p>
                                </div>
                                <div className="setting-control">
                                    <select 
                                        value={config.djRoleId || ''} 
                                        onChange={(e) => handleConfigChange('djRoleId', e.target.value || null)}
                                        className="role-select"
                                    >
                                        <option value="">-- Aucun rôle (Tout le monde) --</option>
                                        {roles.map(role => (
                                            <option key={role.id} value={role.id} style={{ color: role.color !== '#000000' ? role.color : 'inherit' }}>
                                                {role.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="setting-row">
                                <div className="setting-info">
                                    <h4>Volume par défaut</h4>
                                    <p>Volume initial lors de la connexion ({config.defaultVolume}%)</p>
                                </div>
                                <div className="setting-control">
                                    <input 
                                        type="range" 
                                        min="10" 
                                        max="200" 
                                        value={config.defaultVolume} 
                                        onChange={(e) => handleConfigChange('defaultVolume', parseInt(e.target.value))}
                                        className="volume-slider"
                                    />
                                </div>
                            </div>

                            <div className="settings-footer">
                                {saveStatus === 'success' && <span className="save-status success"><CheckCircle2 size={16}/> Sauvegardé</span>}
                                {saveStatus === 'error' && <span className="save-status error"><AlertCircle size={16}/> Erreur</span>}
                                <button 
                                    className="save-btn" 
                                    onClick={handleSaveConfig}
                                    disabled={isSaving}
                                >
                                    {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    <span>Enregistrer</span>
                                </button>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === 'config' && !config && (
                        <div className="settings-loading">
                            <Loader2 size={24} className="animate-spin" />
                            <span>Chargement des paramètres...</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
