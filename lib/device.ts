// Small user-agent parser: device class and OS family, enough for targeting.

export type Device = 'mobile' | 'tablet' | 'desktop';
export type Os = 'android' | 'ios' | 'windows' | 'mac' | 'linux' | 'other';

export function deviceOf(ua: string): Device {
  if (/iPad|Tablet|PlayBook|Silk|Kindle|(Android(?!.*Mobile))/i.test(ua)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android.*Mobile|Windows Phone|BlackBerry|Opera Mini/i.test(ua)) return 'mobile';
  return 'desktop';
}

export function osOf(ua: string): Os {
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Windows/i.test(ua)) return 'windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac';
  if (/Linux|X11|CrOS/i.test(ua)) return 'linux';
  return 'other';
}
