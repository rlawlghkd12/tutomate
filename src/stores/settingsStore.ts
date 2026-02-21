import { create } from 'zustand';

export type FontSize = 'small' | 'medium' | 'large' | 'extra-large';
export type Theme = 'light' | 'dark';

interface Settings {
  theme: Theme;
  fontSize: FontSize;
  notificationsEnabled: boolean;
  organizationName: string;
}

interface SettingsStore extends Settings {
  setTheme: (theme: Theme) => void;
  setFontSize: (fontSize: FontSize) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setOrganizationName: (name: string) => void;
  loadSettings: () => void;
  saveSettings: () => void;
}

const SETTINGS_KEY = 'app-settings';

const defaultSettings: Settings = {
  theme: 'light',
  fontSize: 'medium',
  notificationsEnabled: true,
  organizationName: '수강생 관리 프로그램',
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...defaultSettings,

  setTheme: (theme: Theme) => {
    set({ theme });
    get().saveSettings();
  },

  setFontSize: (fontSize: FontSize) => {
    set({ fontSize });
    get().saveSettings();
  },

  setNotificationsEnabled: (enabled: boolean) => {
    set({ notificationsEnabled: enabled });
    get().saveSettings();
  },

  setOrganizationName: (name: string) => {
    set({ organizationName: name });
    get().saveSettings();
  },

  loadSettings: () => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const settings = JSON.parse(stored) as Settings;
        set(settings);
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  },

  saveSettings: () => {
    try {
      const { theme, fontSize, notificationsEnabled, organizationName } = get();
      const settings: Settings = { theme, fontSize, notificationsEnabled, organizationName };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save settings:', error);
    }
  },
}));
