// Run: npm test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fraudScore } from '../lib/fraud.ts';
import { classify } from '../lib/trafficSource.ts';

const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36';
const c = (qs: string, referer = '', ua = CHROME) => classify({ params: new URLSearchParams(qs), referer, ua, selfHost: 'trk.ossaward.org' });
const pair = (r: { source: string; channel: string }) => `${r.source}/${r.channel}`;

test('ad click IDs', () => {
  assert.equal(pair(c('gclid=abc')), 'google_ads/paid_search');
  assert.equal(pair(c('gbraid=abc')), 'google_ads/paid_search');
  assert.equal(pair(c('wbraid=abc')), 'google_ads/paid_search');
  assert.equal(pair(c('msclkid=abc')), 'bing_ads/paid_search');
  assert.equal(pair(c('ttclid=abc')), 'tiktok_ads/paid_social');
  assert.equal(pair(c('twclid=abc')), 'x_ads/paid_social');
  assert.equal(pair(c('li_fat_id=abc')), 'linkedin_ads/paid_social');
  assert.equal(pair(c('ScCid=abc')), 'snapchat_ads/paid_social');
  assert.equal(c('gclid=abc').evidence, 'gclid parameter');
});

test('fbclid is Meta, paid only with a paid utm_medium', () => {
  assert.equal(pair(c('fbclid=x')), 'meta/social');
  assert.equal(pair(c('fbclid=x&utm_source=facebook&utm_medium=paid_social')), 'meta_ads/paid_social');
  assert.equal(pair(c('fbclid=x&utm_medium=cpc')), 'meta_ads/paid_social');
});

test('UTM tags', () => {
  assert.equal(pair(c('utm_source=google&utm_medium=cpc')), 'google_ads/paid_search');
  assert.equal(pair(c('utm_source=google')), 'google_organic/organic_search');
  assert.equal(pair(c('utm_source=bing&utm_medium=ppc')), 'bing_ads/paid_search');
  assert.equal(pair(c('utm_source=fb&utm_medium=paid')), 'meta_ads/paid_social');
  assert.equal(pair(c('utm_source=instagram')), 'meta/social');
  assert.equal(pair(c('utm_source=newsletter')), 'email/email');
  assert.equal(pair(c('utm_medium=email&utm_source=anything')), 'email/email');
  assert.equal(pair(c('utm_source=taboola&utm_medium=cpc')), 'native/native');
  assert.equal(pair(c('utm_medium=push')), 'push/push');
  assert.equal(pair(c('utm_source=tiktok&utm_medium=cpm')), 'tiktok_ads/paid_social');
});

test('in-app browsers', () => {
  assert.equal(pair(c('', '', 'Mozilla/5.0 (iPhone) [FBAN/FBIOS;FBAV/450.0]')), 'meta/social');
  assert.equal(pair(c('', '', 'Mozilla/5.0 (iPhone) Instagram 300.0')), 'meta/social');
  assert.equal(pair(c('', '', 'Mozilla/5.0 (Linux; Android 14) musical_ly_2023 BytedanceWebview')), 'tiktok/social');
  assert.equal(pair(c('', '', 'Mozilla/5.0 Snapchat/12.0')), 'snapchat/social');
});

test('referrers', () => {
  assert.equal(pair(c('', 'https://www.google.com/')), 'google_organic/organic_search');
  assert.equal(pair(c('', 'https://www.google.co.uk/search?q=x')), 'google_organic/organic_search');
  assert.equal(pair(c('', 'https://www.bing.com/search?q=x')), 'bing_organic/organic_search');
  assert.equal(pair(c('', 'https://duckduckgo.com/')), 'duckduckgo_organic/organic_search');
  assert.equal(pair(c('', 'https://mail.google.com/mail/u/0/')), 'email/email');
  assert.equal(pair(c('', 'https://outlook.live.com/mail/')), 'email/email');
  assert.equal(pair(c('', 'https://l.facebook.com/l.php?u=x')), 'meta/social');
  assert.equal(pair(c('', 'https://t.co/abc')), 'x/social');
  assert.equal(pair(c('', 'https://www.youtube.com/watch?v=1')), 'youtube/social');
  assert.equal(pair(c('', 'https://adclick.g.doubleclick.net/')), 'google_ads/paid_search');
  const r = c('', 'https://some-blog.example/post');
  assert.equal(pair(r), 'referral/referral');
  assert.equal(r.refererHost, 'some-blog.example');
  assert.equal(pair(c('', 'https://trk.ossaward.org/c/abc')), 'direct/direct'); // our own host
  assert.equal(pair(c('', 'not a url')), 'direct/direct');
});

test('no signals → direct; precedence', () => {
  assert.equal(pair(c('')), 'direct/direct');
  assert.equal(pair(c('gclid=1', 'https://www.facebook.com/')), 'google_ads/paid_search'); // click ID beats referrer
  assert.equal(pair(c('msclkid=1&utm_source=google&utm_medium=cpc')), 'bing_ads/paid_search'); // click ID beats UTM
  assert.equal(pair(c('utm_source=google&utm_medium=cpc', 'https://www.facebook.com/')), 'google_ads/paid_search'); // UTM beats referrer
  assert.equal(pair(c('', 'https://www.google.com/', 'Mozilla/5.0 [FBAN/FBIOS]')), 'meta/social'); // in-app beats referrer
});

const clean = { ctit: 600, clickExpected: true, clickBot: false, clickDuplicate: false, sameIpToday: 0,
  pubCrToday: 0.02, pubCr7d: 0.02, pubClicksToday: 100, pubConvToday: 2 };

test('disallowed source holds the conversion', () => {
  const r = fraudScore({ ...clean, disallowedSource: 'Google Ads' });
  assert.ok(r.score >= 70);
  assert.match(r.reasons[0], /disallowed traffic source: Google Ads/);
  assert.equal(fraudScore({ ...clean, disallowedSource: null }).score, 0);
});
