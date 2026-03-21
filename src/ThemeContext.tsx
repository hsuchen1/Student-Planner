import React, { createContext, useContext, useState, useEffect } from 'react';

export type ThemeColor = {
  name: string;
  primary: string;
  secondary: string;
  darkPrimary: string;
  darkSecondary: string;
};

export const themeColors: ThemeColor[] = [
  { name: '經典藍', primary: '#2563eb', secondary: '#dbeafe', darkPrimary: '#3b82f6', darkSecondary: '#1e3a8a' },
  { name: '翡翠綠', primary: '#059669', secondary: '#d1fae5', darkPrimary: '#10b981', darkSecondary: '#064e3b' },
  { name: '活力橘', primary: '#ea580c', secondary: '#ffedd5', darkPrimary: '#f97316', darkSecondary: '#7c2d12' },
  { name: '玫瑰紅', primary: '#e11d48', secondary: '#ffe4e6', darkPrimary: '#f43f5e', darkSecondary: '#881337' },
  { name: '優雅紫', primary: '#7c3aed', secondary: '#ede9fe', darkPrimary: '#8b5cf6', darkSecondary: '#4c1d95' },
  { name: '石板灰', primary: '#475569', secondary: '#f1f5f9', darkPrimary: '#64748b', darkSecondary: '#1e293b' },
];

interface ThemeContextType {
  currentColor: ThemeColor;
  setThemeColor: (color: ThemeColor) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [currentColor, setCurrentColor] = useState<ThemeColor>(() => {
    const saved = localStorage.getItem('theme-color');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return themeColors[0];
      }
    }
    return themeColors[0];
  });

  useEffect(() => {
    localStorage.setItem('theme-color', JSON.stringify(currentColor));
    
    // Apply to CSS variables
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');
    
    if (isDark) {
      root.style.setProperty('--theme-color', currentColor.darkPrimary);
      root.style.setProperty('--theme-color-secondary', currentColor.darkSecondary);
    } else {
      root.style.setProperty('--theme-color', currentColor.primary);
      root.style.setProperty('--theme-color-secondary', currentColor.secondary);
    }
  }, [currentColor]);

  // Listen for dark mode changes to re-apply colors
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.attributeName === 'class') {
          const isDark = document.documentElement.classList.contains('dark');
          if (isDark) {
            document.documentElement.style.setProperty('--theme-color', currentColor.darkPrimary);
            document.documentElement.style.setProperty('--theme-color-secondary', currentColor.darkSecondary);
          } else {
            document.documentElement.style.setProperty('--theme-color', currentColor.primary);
            document.documentElement.style.setProperty('--theme-color-secondary', currentColor.secondary);
          }
        }
      });
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [currentColor]);

  return (
    <ThemeContext.Provider value={{ currentColor, setThemeColor: setCurrentColor }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
