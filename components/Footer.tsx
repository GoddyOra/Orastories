import React from 'react';
import { ThemeMode } from '../types';

interface FooterProps {
  theme: ThemeMode;
}

const Footer: React.FC<FooterProps> = ({ theme }) => {
  const isLight = theme !== 'dark';
  return (
    <footer
      className={`border-t mt-16 py-8 text-center text-sm transition-colors duration-500 ${
        isLight ? 'border-gray-200 text-gray-600' : 'border-white/10 text-gray-400'
      }`}
    >
      <p>&copy; 2026 Orastories. All rights reserved.</p>
      <p className="mt-2 text-sm">
        <a href="/privacy" className={`transition-colors ${isLight ? 'hover:text-amber-700' : 'hover:text-amber-400'}`}>Privacy Policy</a>
        {' '}&middot;{' '}
        <a href="/terms" className={`transition-colors ${isLight ? 'hover:text-amber-700' : 'hover:text-amber-400'}`}>Terms of Service</a>
      </p>
    </footer>
  );
};

export default Footer;
