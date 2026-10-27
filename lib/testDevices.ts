// User agents the Link Test can send (shared by the server and the form).

export const TEST_DEVICES = {
  desktop: { label: 'Desktop (Windows, Chrome)', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36' },
  android: { label: 'Android phone (Chrome)', ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' },
  iphone: { label: 'iPhone (Safari)', ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' },
} as const;
export type TestDevice = keyof typeof TEST_DEVICES;
