'use strict';

// Suggerimento "Aggiungi alla schermata Home" per iPhone/iPad: logica pura, usata dal browser
// (window.IosHint) e dai test (require).
(function (root) {
  const OTHER_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS/;

  function isIos(userAgent, maxTouchPoints) {
    if (/iPhone|iPad|iPod/.test(userAgent)) return true;
    // iPadOS 13+ si presenta come un Mac: lo tradisce lo schermo touch
    return /Macintosh/.test(userAgent) && maxTouchPoints > 1;
  }

  // 'safari' = si può mostrare la guida, 'other' = serve Safari, null = nessun suggerimento
  function hintMode({ userAgent = '', maxTouchPoints = 0, standalone = false, hasNativeBridge = false, dismissed = false } = {}) {
    if (!isIos(userAgent, maxTouchPoints)) return null;
    if (standalone || hasNativeBridge || dismissed) return null;
    if (OTHER_BROWSERS.test(userAgent)) return 'other';
    return /Safari\//.test(userAgent) ? 'safari' : null;   // senza "Safari/" è una webview: niente da mostrare
  }

  const shouldShowIosHint = opts => hintMode(opts) === 'safari';

  root.hintMode = hintMode;
  root.shouldShowIosHint = shouldShowIosHint;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.IosHint = {}));
