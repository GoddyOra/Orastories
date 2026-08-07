import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import { ThemeMode } from '../types';

interface NavAccountControlProps {
  theme: ThemeMode;
  onOpenPortal: () => void;
}

const NavAccountControl: React.FC<NavAccountControlProps> = ({ theme, onOpenPortal }) => {
  const { user, profile, loading } = useAuth();
  const [target, setTarget] = useState<HTMLElement | null>(() => document.getElementById('siteNavControls'));

  useEffect(() => {
    if (target) return;
    const frame = requestAnimationFrame(() => {
      setTarget(document.getElementById('siteNavControls'));
    });
    return () => cancelAnimationFrame(frame);
  }, [target]);

  if (!target || loading) return null;

  const isLight = theme !== 'dark';
  const label = user ? (profile?.displayName || user.email?.split('@')[0] || 'Account') : 'Sign In';

  return createPortal(
    <button
      onClick={onOpenPortal}
      className={`text-sm sm:text-base font-medium transition-colors ${
        isLight ? 'text-gray-900 hover:text-amber-700' : 'text-gray-100 hover:text-amber-400'
      }`}
    >
      {label}
    </button>,
    target
  );
};

export default NavAccountControl;
