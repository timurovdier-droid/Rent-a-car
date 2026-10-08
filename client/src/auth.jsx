import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from './api';

const AuthContext = createContext(null);
const STORAGE_KEY = 'rac-user';

function readCachedUser() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const user = JSON.parse(raw);
    return user && user.role ? user : null;
  } catch {
    return null;
  }
}

function storeUser(user) {
  if (user) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  else sessionStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({ children }) {
  const cached = readCachedUser();
  const [user, setUser] = useState(cached);
  const [loading, setLoading] = useState(!cached);

  const fetchUser = useCallback(async () => {
    try {
      const data = await api.get('/auth/me');
      setUser(data);
      storeUser(data);
    } catch (err) {
      setUser(null);
      storeUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUser();
  }, [fetchUser]);

  const refreshUser = useCallback(() => {
    return fetchUser();
  }, [fetchUser]);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch (err) {
      // Игнорируем ошибку при выходе
    } finally {
      setUser(null);
      storeUser(null);
    }
  }, []);

  const value = {
    user,
    loading,
    refreshUser,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}