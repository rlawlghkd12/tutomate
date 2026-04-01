import { ipcMain, BrowserWindow } from 'electron';

const ALLOWED_OAUTH_DOMAINS = [
  'accounts.google.com',
  'kauth.kakao.com',
  'nid.naver.com',
  '.supabase.co',
];

export function registerAuthHandlers(mainWindow: BrowserWindow) {
  ipcMain.handle('oauth-open-external', async (_event, url: string) => {
    const parsed = new URL(url);
    if (!ALLOWED_OAUTH_DOMAINS.some(domain => parsed.hostname.endsWith(domain))) {
      throw new Error(`Unauthorized OAuth URL: ${parsed.hostname}`);
    }

    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      show: true,
    });

    let handled = false;

    // 네트워크 레벨에서 Supabase의 302 redirect를 감지
    // Location 헤더에 access_token이 포함되어 있음
    authWindow.webContents.session.webRequest.onBeforeRedirect(
      { urls: ['*://*.supabase.co/*'] },
      (details) => {
        if (handled) return;
        const redirectURL = details.redirectURL;
        console.log('[OAuth] redirect detected:', redirectURL.substring(0, 80));
        if (redirectURL.includes('access_token=')) {
          handled = true;
          const hashIndex = redirectURL.indexOf('#');
          if (hashIndex !== -1) {
            const hash = redirectURL.substring(hashIndex);
            mainWindow.webContents.send('oauth-callback', hash);
          }
          setTimeout(() => {
            if (!authWindow.isDestroyed()) authWindow.close();
          }, 100);
        }
      }
    );

    authWindow.loadURL(url);

    authWindow.on('closed', () => {
      if (!handled) {
        mainWindow.webContents.send('oauth-callback', '__cancelled__');
      }
    });
  });
}
