import React, { createContext, useContext, useState, useRef, useEffect } from 'react';
import { API_URL } from '../config';

const PlayerContext = createContext(null);

export const PlayerProvider = ({ children }) => {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [queue, setQueue] = useState([]);
  
  const audioRef = useRef(null);

  useEffect(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio();
    }
    const audio = audioRef.current;

    const handleTimeUpdate = () => setPosition(audio.currentTime * 1000);
    const handleLoadedMetadata = () => setDuration(audio.duration * 1000);
    const handleEnded = () => playNext();
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume / 100;
    }
  }, [volume]);

  const playTrack = (track, newQueue = null) => {
    if (newQueue) setQueue(newQueue);
    
    setCurrentTrack(track);
    if (audioRef.current && track) {
      // Pass title and artist to backend to resolve full audio stream, with iTunes preview as fallback
      const query = encodeURIComponent(`${track.title} ${track.artist}`);
      const fallback = encodeURIComponent(track.url || '');
      audioRef.current.src = `${API_URL}/api/stream?q=${query}&fallback=${fallback}`;
      audioRef.current.play().catch(console.error);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !currentTrack) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  };

  const playNext = () => {
    if (!currentTrack || queue.length === 0) return;
    const currentIndex = queue.findIndex(t => t.url === currentTrack.url);
    if (currentIndex >= 0 && currentIndex < queue.length - 1) {
      playTrack(queue[currentIndex + 1]);
    } else {
      // End of queue
      setIsPlaying(false);
      setCurrentTrack(null);
    }
  };

  const playPrevious = () => {
    if (!currentTrack || queue.length === 0) return;
    const currentIndex = queue.findIndex(t => t.url === currentTrack.url);
    if (currentIndex > 0) {
      playTrack(queue[currentIndex - 1]);
    }
  };

  const seekTo = (ms) => {
    if (audioRef.current) {
      audioRef.current.currentTime = ms / 1000;
      setPosition(ms);
    }
  };

  return (
    <PlayerContext.Provider value={{
      currentTrack,
      isPlaying,
      volume,
      position,
      duration,
      queue,
      playTrack,
      togglePlay,
      playNext,
      playPrevious,
      seekTo,
      setVolume
    }}>
      {children}
    </PlayerContext.Provider>
  );
};

export const usePlayer = () => useContext(PlayerContext);
