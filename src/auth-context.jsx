import { useCallback, useEffect, useMemo, useState } from 'react';
import { getMe, loginUser, registerUser, setAuthToken } from './api-core';
import { AUTH_STORAGE_KEY, AuthContext, readStoredAuth } from './auth-core';

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => readStoredAuth());
  const [authModal, setAuthModal] = useState(null);
  // Lazy init: only "loading" when there's a stored session to validate.
  // Avoids a synchronous setState(false) inside the effect below.
  const [loading, setLoading] = useState(() => Boolean(readStoredAuth()));

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
