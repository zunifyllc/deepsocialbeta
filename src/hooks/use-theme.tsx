import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";

export type ThemeMode = "dark" | "black";

export const ACCENT_PRESETS: { label: string; value: string }[] = [
  { label: "Blue", value: "#1d9bf0" },
  { label: "Yellow", value: "#ffd400" },
  { label: "Pink", value: "#f91880" },
  { label: "Purple", value: "#7856ff" },
  { label: "Orange", value: "#ff7a00" },
  { label: "Green", value: "#00ba7c" },
];

export const DEFAULT_ACCENT = "#1d9bf0";
const STORAGE_KEY = "deepsocial.theme";

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

interface ThemeContextValue {
  accentColor: string;
  themeMode: ThemeMode;
  setTheme: (next: { accentColor?: string; themeMode?: ThemeMode }) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(accentColor: string, themeMode: ThemeMode) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.style.setProperty("--primary", accentColor);
  root.style.setProperty("--ring", accentColor);
  root.style.setProperty("--sidebar-primary", accentColor);
  root.style.setProperty("--sidebar-ring", accentColor);
  root.dataset["accent"] = accentColor;
  root.classList.toggle("theme-black", themeMode === "black");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { profile } = useAuth();
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { accentColor?: string; themeMode?: ThemeMode };
      if (saved.accentColor && isHexColor(saved.accentColor)) setAccentColor(saved.accentColor);
      if (saved.themeMode === "black" || saved.themeMode === "dark") setThemeMode(saved.themeMode);
    } catch {
      /* ignore malformed storage */
    }
  }, []);

  // Profile is the source of truth once it loads.
  useEffect(() => {
    if (!profile) return;
    if (profile.accent_color && isHexColor(profile.accent_color)) setAccentColor(profile.accent_color);
    if (profile.theme_mode === "black" || profile.theme_mode === "dark") setThemeMode(profile.theme_mode);
  }, [profile]);

  useEffect(() => {
    applyTheme(accentColor, themeMode);
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ accentColor, themeMode }));
    } catch {
      /* storage unavailable */
    }
  }, [accentColor, themeMode]);

  const setTheme = useCallback((next: { accentColor?: string; themeMode?: ThemeMode }) => {
    if (next.accentColor && isHexColor(next.accentColor)) setAccentColor(next.accentColor);
    if (next.themeMode) setThemeMode(next.themeMode);
  }, []);

  return <ThemeContext.Provider value={{ accentColor, themeMode, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
