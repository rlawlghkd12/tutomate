import { useState, useEffect } from 'react';
import { isTauri } from '../utils/tauri';

export const APP_NAME = 'TutorMate';

export function useAppVersion() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    if (isTauri()) {
      import('@tauri-apps/api/app').then((mod) => mod.getVersion()).then(setVersion);
    } else {
      setVersion('web');
    }
  }, []);

  return version;
}
