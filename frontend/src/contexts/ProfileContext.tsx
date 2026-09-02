import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import api from '../lib/api';
import { useAuth } from './AuthContext';

type ActivityStatus = 'active' | 'away';

interface ProfileState {
  avatar: string | null;
  displayName: string;
  loading: boolean;
  refresh: () => Promise<void>;
  activityStatus: ActivityStatus;
  setActivityStatus: (s: ActivityStatus) => Promise<void>;
  profile: any;
}

const ProfileContext = createContext<ProfileState | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [avatar,         setAvatar]         = useState<string | null>(null);
  const [displayName,    setDisplayName]    = useState('');
  const [loading,        setLoading]        = useState(false);
  const [activityStatus, setActivityState]  = useState<ActivityStatus>('active');
  const [profile,        setProfile]        = useState<any>(null);

  const refresh = useCallback(async () => {
    if (!user) { setAvatar(null); setDisplayName(''); return; }
    setLoading(true);
    try {
      const { data } = await api.get('/api/profile');
      setAvatar(data.profile?.avatar || null);
      setDisplayName(data.profile?.display_name || data.username || '');
      setActivityState(data.profile?.activity_status === 'away' ? 'away' : 'active');
      setProfile(data);
    } catch {
      setDisplayName(user.username || '');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const setActivityStatus = useCallback(async (s: ActivityStatus) => {
    const prev = activityStatus;
    setActivityState(s); // optimistic
    try {
      await api.put('/api/profile/status', { activity_status: s });
    } catch {
      setActivityState(prev); // revert on failure
    }
  }, [activityStatus]);

  return (
    <ProfileContext.Provider value={{ avatar, displayName, loading, refresh, activityStatus, setActivityStatus, profile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile(): ProfileState {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider');
  return ctx;
}
