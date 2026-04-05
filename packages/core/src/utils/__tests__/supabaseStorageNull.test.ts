import { describe, it, expect, vi } from 'vitest';

// supabase를 null로 모킹 — !supabase 가드 분기 테스트
vi.mock('../../config/supabase', () => ({
  supabase: null,
}));

vi.mock('../logger', () => ({
  logError: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
}));

import {
  supabaseLoadData,
  supabaseInsert,
  supabaseUpdate,
  supabaseDelete,
  supabaseBulkInsert,
} from '../supabaseStorage';

describe('supabaseStorage — supabase null', () => {
  it('supabaseLoadData → throw "Supabase not configured"', async () => {
    await expect(supabaseLoadData('courses')).rejects.toThrow('Supabase not configured');
  });

  it('supabaseInsert → throw "Supabase not configured"', async () => {
    await expect(supabaseInsert('courses', { id: '1' })).rejects.toThrow('Supabase not configured');
  });

  it('supabaseUpdate → throw "Supabase not configured"', async () => {
    await expect(supabaseUpdate('courses', '1', {})).rejects.toThrow('Supabase not configured');
  });

  it('supabaseDelete → throw "Supabase not configured"', async () => {
    await expect(supabaseDelete('courses', '1')).rejects.toThrow('Supabase not configured');
  });

  it('supabaseBulkInsert → throw "Supabase not configured"', async () => {
    await expect(supabaseBulkInsert('courses', [{ id: '1' }])).rejects.toThrow('Supabase not configured');
  });

  it('supabaseBulkInsert 빈 배열 → supabase null이므로 throw', async () => {
    // supabase null 체크가 items.length 체크보다 먼저 실행됨
    await expect(supabaseBulkInsert('courses', [])).rejects.toThrow('Supabase not configured');
  });
});
