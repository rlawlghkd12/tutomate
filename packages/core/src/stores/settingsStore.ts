import { create } from 'zustand';
import { logError } from '../utils/logger';
import { resolveTheme, type ThemeId } from '../config/themes';

export type FontSize = 'xs' | 'small' | 'medium' | 'large' | 'xl' | 'xxl' | 'xxxl';
/** 확장된 테마 ID — light/dark 외에 sepia/high-contrast/slate 지원 */
export type Theme = ThemeId;

interface Settings {
  theme: Theme;
  fontSize: FontSize;
  notificationsEnabled: boolean;
  /** OS 라이트/다크 모드 자동 연동 (true면 수동 theme 선택을 덮어씀) */
  autoThemeSync: boolean;
}

interface SettingsStore extends Settings {
  setTheme: (theme: Theme) => void;
  setFontSize: (fontSize: FontSize) => void;
  setNotificationsEnabled: (enabled: boolean) => void;
  setAutoThemeSync: (enabled: boolean) => void;
  loadSettings: () => void;
  saveSettings: () => void;
}

const SETTINGS_KEY = 'app-settings';

const defaultSettings: Settings = {
  theme: 'light',
  fontSize: 'medium',
  notificationsEnabled: true,
  autoThemeSync: false,
};

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  ...defaultSettings,

  setTheme: (theme: Theme) => {
    set({ theme: resolveTheme(theme) });
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

  setAutoThemeSync: (enabled: boolean) => {
    set({ autoThemeSync: enabled });
    get().saveSettings();
  },

  loadSettings: () => {
    try {
      const stored = localStorage.getItem(SETTINGS_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<Settings>;
        const { theme, fontSize, notificationsEnabled, autoThemeSync } = parsed;
        set({
          // 하위 호환: 구 버전 'light'/'dark' 그대로 유효, 알 수 없는 값은 'light'로
          ...(theme !== undefined && { theme: resolveTheme(theme) }),
          ...(fontSize !== undefined && { fontSize }),
          ...(notificationsEnabled !== undefined && { notificationsEnabled }),
          ...(autoThemeSync !== undefined && { autoThemeSync }),
        });
      }
    } catch (error) {
      logError('Failed to load settings', { error });
    }
  },

  saveSettings: () => {
    try {
      const { theme, fontSize, notificationsEnabled, autoThemeSync } = get();
      const settings: Settings = { theme, fontSize, notificationsEnabled, autoThemeSync };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      logError('Failed to save settings', { error });
    }
  },
}));
