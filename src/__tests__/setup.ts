import { vi } from 'vitest';

// Mock window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: undefined,
  writable: true,
});

// Mock antd message/notification (used by errors.ts)
vi.mock('antd', () => ({
  message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  notification: { error: vi.fn(), success: vi.fn() },
}));
