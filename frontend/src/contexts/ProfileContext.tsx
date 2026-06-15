import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

interface ProfileState {
  avatar: string | null;
  displayName: string;
  loading: boolean;
  refresh: () => Promise<void>;
}

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [avatar,      setAvatar]      = useState<string | null>(null);
  const [displayName, setDisplayName] = useState('');
  const [loading,     setLoading]     = useState(false);

  const refresh = useCallback(async () => {
    if (!user) { setAvatar(null); setDisplayName(''); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/api/profile');
      setAvatar(data.profile?.avatar || null);
      setDisplayName(data.profile?.display_name || data.username || '');
    } catch {
      setDisplayName(user.username || '');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <ProfileContext.Provider value={{ avatar, displayName, loading, refresh }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
