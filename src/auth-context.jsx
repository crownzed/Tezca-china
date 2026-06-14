import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMe, loginUser, registerUser, setAuthToken } from './api-core';

const AUTH_STORAGE_KEY = 'hanziAuth';

const AuthContext = createContext(null);

function readStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => readStoredAuth());
  const [authModal, setAuthModal] = useState(null);
  const [loading, setLoading] = useState(true);

  const persistAuth = useCallback((next) => {
    if (next) {
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
      setAuthToken(next.token);
    } else {
      localStorage.removeItem(AUTH_STORAGE_KEY);
      setAuthToken(null);
    }
    setAuth(next);
  }, []);

  useEffect(() => {
    const stored = readStoredAuth();
    if (!stored) {
      setAuthToken(null);
      setLoading(false);
      return;
    }
    setAuthToken(stored.token);
    getMe()
      .then(user => persistAuth({ token: stored.token, user }))
      .catch(() => persistAuth(null))
      .finally(() => setLoading(false));
  }, [persistAuth]);

  const login = useCallback(async (loginValue, password) => {
    const data = await loginUser({ login: loginValue, password });
    persistAuth(data);
    setAuthModal(null);
    return data.user;
  }, [persistAuth]);

  const register = useCallback(async (payload) => {
    const data = await registerUser(payload);
    persistAuth(data);
    setAuthModal(null);
    return data.user;
  }, [persistAuth]);

  const logout = useCallback(() => {
    persistAuth(null);
  }, [persistAuth]);

  const updateLocalUser = useCallback((patch) => {
    setAuth(current => {
      if (!current) return current;
      const next = { ...current, user: { ...current.user, ...patch } };
      localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(() => ({
    user: auth?.user ?? null,
    token: auth?.token ?? null,
    userId: auth?.user?.id ?? 'local-user',
    isAuthenticated: Boolean(auth?.user),
    loading,
    authModal,
    openLogin: () => setAuthModal('login'),
    openRegister: () => setAuthModal('register'),
    closeAuthModal: () => setAuthModal(null),
    login,
    register,
    logout,
    updateLocalUser,
  }), [auth, loading, authModal, login, register, logout, updateLocalUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
