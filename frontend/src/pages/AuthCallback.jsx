import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const API = process.env.REACT_APP_BACKEND_URL + '/api';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', '?'));
    const sessionId = params.get('session_id');

    if (!sessionId) {
      navigate('/');
      return;
    }

    const processSession = async () => {
      try {
        const res = await fetch(`${API}/auth/session`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ session_id: sessionId }),
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data.user);
          if (data.user?.onboarding_complete) {
            navigate('/dashboard', { replace: true, state: { user: data.user } });
          } else {
            navigate('/onboarding', { replace: true, state: { user: data.user } });
          }
        } else {
          navigate('/');
        }
      } catch {
        navigate('/');
      }
    };

    processSession();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-lg font-medium text-foreground">Signing you in...</p>
        <p className="text-sm text-muted-foreground">Setting up your account</p>
      </div>
    </div>
  );
}
