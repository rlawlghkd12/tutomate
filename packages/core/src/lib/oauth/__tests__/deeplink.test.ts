import { describe, it, expect } from 'vitest';
import { parseOAuthCallback } from '../deeplink';

describe('parseOAuthCallback', () => {
  it('유효한 callback URL → accessToken + refreshToken 추출', () => {
    const result = parseOAuthCallback(
      'https://example.com/callback#access_token=abc123&refresh_token=def456',
    );
    expect(result).toEqual({
      accessToken: 'abc123',
      refreshToken: 'def456',
    });
  });

  it('추가 파라미터 있어도 토큰 추출', () => {
    const result = parseOAuthCallback(
      'https://example.com/callback#access_token=token1&refresh_token=token2&expires_in=3600&token_type=bearer',
    );
    expect(result).toEqual({
      accessToken: 'token1',
      refreshToken: 'token2',
    });
  });

  it('error 파라미터 포함 → error 반환', () => {
    const result = parseOAuthCallback(
      'https://example.com/callback#error=access_denied&error_description=User+cancelled',
    );
    expect(result).toEqual({
      error: 'access_denied',
      errorDescription: 'User cancelled',
    });
  });

  it('error만 있고 description 없음 → errorDescription undefined', () => {
    const result = parseOAuthCallback(
      'https://example.com/callback#error=server_error',
    );
    expect(result).toEqual({
      error: 'server_error',
      errorDescription: undefined,
    });
  });

  it('access_token만 있고 refresh_token 없음 → missing_tokens', () => {
    const result = parseOAuthCallback(
      'https://example.com/callback#access_token=abc123',
    );
    expect(result).toEqual({
      error: 'missing_tokens',
      errorDescription: 'Missing access_token or refresh_token in callback URL',
    });
  });

  it('refresh_token만 있고 access_token 없음 → missing_tokens', () => {
    const result = parseOAuthCallback(
      'https://example.com/callback#refresh_token=def456',
    );
    expect(result).toEqual({
      error: 'missing_tokens',
      errorDescription: 'Missing access_token or refresh_token in callback URL',
    });
  });

  it('hash 비어있음 → missing_tokens', () => {
    const result = parseOAuthCallback('https://example.com/callback#');
    expect(result).toEqual({
      error: 'missing_tokens',
      errorDescription: 'Missing access_token or refresh_token in callback URL',
    });
  });

  it('hash 없는 URL → missing_tokens', () => {
    const result = parseOAuthCallback('https://example.com/callback');
    expect(result).toEqual({
      error: 'missing_tokens',
      errorDescription: 'Missing access_token or refresh_token in callback URL',
    });
  });
});
