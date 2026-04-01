import type { OAuthCallbackResult, OAuthCallbackError } from './types';

export function parseOAuthCallback(callbackUrl: string): OAuthCallbackResult | OAuthCallbackError {
  const url = new URL(callbackUrl);
  const params = new URLSearchParams(url.hash.slice(1));

  const error = params.get('error');
  if (error) {
    return {
      error,
      errorDescription: params.get('error_description') || undefined,
    };
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken || !refreshToken) {
    return {
      error: 'missing_tokens',
      errorDescription: 'Missing access_token or refresh_token in callback URL',
    };
  }

  return { accessToken, refreshToken };
}
