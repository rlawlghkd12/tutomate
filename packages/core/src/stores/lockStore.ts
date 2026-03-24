import { create } from 'zustand';

interface LockSettings {
  isEnabled: boolean;
  pin: string | null; // SHA-256 hashed PIN
  autoLockMinutes: number; // 0 = manual only
}

interface LockStore extends LockSettings {
  isLocked: boolean;
  setEnabled: (enabled: boolean) => void;
  setPin: (pin: string) => Promise<void>;
  setAutoLockMinutes: (minutes: number) => void;
  lock: () => void;
  unlock: (pin: string) => Promise<boolean>;
  verifyPin: (pin: string) => Promise<boolean>;
  loadLockSettings: () => void;
  saveLockSettings: () => void;
}

const LOCK_SETTINGS_KEY = 'app-lock-settings';

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

const defaultLockSettings: LockSettings = {
  isEnabled: false,
  pin: null,
  autoLockMinutes: 0,
};

export const useLockStore = create<LockStore>((set, get) => ({
  ...defaultLockSettings,
  isLocked: false,

  setEnabled: (enabled: boolean) => {
    if (!enabled) {
      set({ isEnabled: false, isLocked: false });
    } else {
      set({ isEnabled: true });
    }
    get().saveLockSettings();
  },

  setPin: async (pin: string) => {
    const hashed = await hashPin(pin);
    set({ pin: hashed });
    get().saveLockSettings();
  },

  setAutoLockMinutes: (minutes: number) => {
    set({ autoLockMinutes: minutes });
    get().saveLockSettings();
  },

  lock: () => {
    const { isEnabled, pin } = get();
    if (isEnabled && pin) {
      set({ isLocked: true });
    }
  },

  unlock: async (pin: string) => {
    const result = await get().verifyPin(pin);
    if (result) {
      set({ isLocked: false });
    }
    return result;
  },

  verifyPin: async (pin: string) => {
    const hashed = await hashPin(pin);
    return hashed === get().pin;
  },

  loadLockSettings: () => {
    try {
      const stored = localStorage.getItem(LOCK_SETTINGS_KEY);
      if (stored) {
        const settings = JSON.parse(stored) as LockSettings;
        set(settings);
      }
    } catch (error) {
      console.error('Failed to load lock settings:', error);
    }
  },

  saveLockSettings: () => {
    try {
      const { isEnabled, pin, autoLockMinutes } = get();
      const settings: LockSettings = { isEnabled, pin, autoLockMinutes };
      localStorage.setItem(LOCK_SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('Failed to save lock settings:', error);
    }
  },
}));
