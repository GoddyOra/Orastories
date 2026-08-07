import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { ensureProfile, fetchProfile, signIn, signOut, signUp } from '../lib/auth';
import { Profile } from '../types';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signUp: typeof signUp;
  signIn: typeof signIn;
  signOut: typeof signOut;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let lastUserId: string | null = null;

    const syncProfile = async (userId: string | null) => {
      if (userId === lastUserId) return;
      lastUserId = userId;

      if (!userId) {
        if (!cancelled) setProfile(null);
        return;
      }

      await ensureProfile(userId);
      const nextProfile = await fetchProfile(userId);
      if (!cancelled) setProfile(nextProfile);
    };

    // onAuthStateChange fires an INITIAL_SESSION event immediately on
    // subscribe with the current (possibly null) session, so a separate
    // getSession() call is redundant. Avoiding it also sidesteps a real bug
    // this caused: under StrictMode's dev-mode double-invoke, the redundant
    // getSession() call plus a second subscription left two concurrent auth
    // operations in flight, which deadlocked a later signOut() call
    // (observed hanging indefinitely, never resolving or rejecting).
    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (cancelled) return;
      setSession(nextSession);
      await syncProfile(nextSession?.user.id ?? null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const value: AuthContextValue = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    signUp,
    signIn,
    signOut
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
