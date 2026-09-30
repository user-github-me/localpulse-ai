import { useEffect, useState } from 'react';
import { getSettings, watchSettings, type Settings } from '@/storage/settings';

/** Current settings, kept in sync with changes made in any extension page. */
export function useSettings(): Settings | null {
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    let active = true;
    void getSettings().then((value) => active && setSettings(value));
    const unwatch = watchSettings(setSettings);
    return () => {
      active = false;
      unwatch();
    };
  }, []);
  return settings;
}
