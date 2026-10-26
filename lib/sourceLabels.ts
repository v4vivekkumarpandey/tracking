// Display names for traffic sources and channels (shared by all panels).

export const SOURCE_LABEL: Record<string, string> = {
  google_ads: 'Google Ads',
  google_organic: 'Google (organic)',
  bing_ads: 'Microsoft / Bing Ads',
  bing_organic: 'Bing (organic)',
  meta_ads: 'Meta Ads (Facebook/Instagram)',
  meta: 'Facebook / Instagram',
  tiktok_ads: 'TikTok Ads',
  tiktok: 'TikTok',
  x_ads: 'X Ads',
  x: 'X / Twitter',
  linkedin_ads: 'LinkedIn Ads',
  linkedin: 'LinkedIn',
  snapchat_ads: 'Snapchat Ads',
  snapchat: 'Snapchat',
  youtube: 'YouTube',
  youtube_ads: 'YouTube Ads',
  reddit: 'Reddit',
  reddit_ads: 'Reddit Ads',
  pinterest: 'Pinterest',
  pinterest_ads: 'Pinterest Ads',
  line: 'LINE',
  yahoo_organic: 'Yahoo (organic)',
  duckduckgo_organic: 'DuckDuckGo (organic)',
  yandex_organic: 'Yandex (organic)',
  baidu_organic: 'Baidu (organic)',
  ecosia_organic: 'Ecosia (organic)',
  email: 'Email',
  native: 'Native ads (Taboola, Outbrain…)',
  push: 'Push notifications',
  referral: 'Other website',
  direct: 'Direct / unknown',
};

export const CHANNEL_LABEL: Record<string, string> = {
  paid_search: 'Paid search',
  organic_search: 'Organic search',
  paid_social: 'Paid social',
  social: 'Social',
  email: 'Email',
  native: 'Native',
  push: 'Push',
  referral: 'Referral',
  direct: 'Direct / unknown',
};

/** Sources an offer can disallow, in the order shown on the edit form. */
export const RESTRICTABLE = [
  'google_ads', 'bing_ads', 'meta_ads', 'tiktok_ads', 'x_ads', 'linkedin_ads', 'snapchat_ads',
  'native', 'push', 'email', 'meta', 'tiktok', 'google_organic',
] as const;

export const sourceLabel = (s: string | null | undefined) => (s ? SOURCE_LABEL[s] ?? s : '–');
export const channelLabel = (c: string | null | undefined) => (c ? CHANNEL_LABEL[c] ?? c : '–');
