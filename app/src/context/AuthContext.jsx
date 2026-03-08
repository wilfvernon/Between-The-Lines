/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const isLockTimeoutError = (error) => {
    const message = String(error?.message || '').toLowerCase();
    return message.includes('lockmanager lock timed out') || message.includes('navigator lock');
  };

  const runAuthWithRetry = async (operation) => {
    try {
      return await operation();
    } catch (error) {
      if (!isLockTimeoutError(error)) throw error;

      // Give any in-flight auth operation a moment to settle, then retry once.
      await new Promise((resolve) => window.setTimeout(resolve, 200));
      return operation();
    }
  };

  useEffect(() => {
    let isMounted = true;

    const initializeSession = async () => {
      try {
        // Check active sessions, but never allow bootstrap to leave loading stuck.
        const { data: { session }, error } = await runAuthWithRetry(() => supabase.auth.getSession());
        if (error) throw error;

        if (isMounted) {
          setUser(session?.user ?? null);
        }
      } catch (error) {
        console.error('Error initializing auth session:', error);
        if (isMounted) {
          setUser(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    initializeSession();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email, password) => {
    const { data, error } = await runAuthWithRetry(() =>
      supabase.auth.signInWithPassword({
        email,
        password,
      })
    );

    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await runAuthWithRetry(() =>
      supabase.auth.signOut({ scope: 'local' })
    );

    if (error) throw error;
  };

  const value = {
    user,
    loading,
    signIn,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};
