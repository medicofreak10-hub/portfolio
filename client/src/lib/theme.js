import { useEffect, useState } from 'react';
export function useTheme() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('theme') || 'system'; } catch { return 'system'; } });
  useEffect(() => {
    const el = document.documentElement;
    if (theme === 'system') el.removeAttribute('data-theme'); else el.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme === 'system' ? '' : theme); if (theme === 'system') localStorage.removeItem('theme'); } catch {}
  }, [theme]);
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return { theme, setTheme, isDark, toggle: () => setTheme(isDark ? 'light' : 'dark') };
}
