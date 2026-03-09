import { useState, useEffect } from 'react';
import { isElectron } from '../utils/tauri';

export const APP_NAME = 'TutorMate';

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
