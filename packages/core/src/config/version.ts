import { useState, useEffect } from 'react';
import { isElectron } from '../utils/tauri';
import { appConfig } from './appConfig';

export const APP_NAME = appConfig.appName;

export function useAppVersion() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (isElectron()) {
      window.electronAPI.getAppVersion().then(setVersion);
    } else {
      setVersion('web');
    }
  }, []);

  return version;
}
