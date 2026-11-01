'use strict';

const test   = require('node:test');
const assert = require('node:assert/strict');
const { hintMode, shouldShowIosHint } = require('../public/ios-hint');

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
const IPAD_AS_MAC   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/123.0.6312.52 Mobile/15E148 Safari/604.1';
const IPHONE_WEBVIEW = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ANDROID       = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Mobile Safari/537.36';
const DESKTOP       = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

test('iPhone Safari: mostra il suggerimento', () => {
  assert.equal(shouldShowIosHint({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 }), true);
  assert.equal(hintMode({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5 }), 'safari');
});

test('iPhone già installata (standalone): niente', () => {
  assert.equal(shouldShowIosHint({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5, standalone: true }), false);
});

test('iPad che si presenta come Mac, con touch: mostra il suggerimento', () => {
  assert.equal(shouldShowIosHint({ userAgent: IPAD_AS_MAC, maxTouchPoints: 5 }), true);
});

test('Mac vero (senza touch): niente', () => {
  assert.equal(shouldShowIosHint({ userAgent: IPAD_AS_MAC, maxTouchPoints: 0 }), false);
});

test('Android e desktop: niente', () => {
  assert.equal(hintMode({ userAgent: ANDROID, maxTouchPoints: 5 }), null);
  assert.equal(hintMode({ userAgent: DESKTOP, maxTouchPoints: 0 }), null);
});

test('Chrome su iOS: non il testo di Safari, ma l’invito ad aprire Safari', () => {
  assert.equal(shouldShowIosHint({ userAgent: IPHONE_CHROME, maxTouchPoints: 5 }), false);
  assert.equal(hintMode({ userAgent: IPHONE_CHROME, maxTouchPoints: 5 }), 'other');
  for (const tag of ['FxiOS/124.0', 'EdgiOS/123.0', 'OPiOS/16.0']) {
    assert.equal(hintMode({ userAgent: IPHONE_CHROME.replace('CriOS/123.0.6312.52', tag), maxTouchPoints: 5 }), 'other', tag);
  }
});

test('webview iOS senza "Safari/": niente', () => {
  assert.equal(hintMode({ userAgent: IPHONE_WEBVIEW, maxTouchPoints: 5 }), null);
});

test('dentro l’app Android (ParResBoNative): niente', () => {
  assert.equal(shouldShowIosHint({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5, hasNativeBridge: true }), false);
});

test('già chiuso dall’utente: niente, anche per gli altri browser iOS', () => {
  assert.equal(shouldShowIosHint({ userAgent: IPHONE_SAFARI, maxTouchPoints: 5, dismissed: true }), false);
  assert.equal(hintMode({ userAgent: IPHONE_CHROME, maxTouchPoints: 5, dismissed: true }), null);
});
