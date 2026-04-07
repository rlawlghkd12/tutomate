import { describe, it, expect, vi } from 'vitest';

// Mock supabase as null
vi.mock('../../config/supabase', () => ({
  supabase: null,
}));

import { reportError } from '../errorReporter';

describe('errorReporter — supabase null', () => {
  it('supabase null → 즉시 리턴, 에러 없음', async () => {
    await expect(reportError(new Error('test'))).resolves.toBeUndefined();
  });
});
