'use strict';

// Ring colours for apps whose icon colour is wrong or missing (black/white or multi-colour icons).
// null = no ring colour: the knob is released to the Stream Dock app's own colour. Browsers get
// null because their icon says nothing about what plays; a detected site's colour still wins.
const APP_COLORS = {
  'com.spotify.client': [30, 215, 96],
  'com.apple.Music': [250, 36, 60],
  'com.apple.TV': [255, 255, 255],
  'com.apple.iBooksX': [255, 149, 0],
  'com.apple.podcasts': [146, 56, 222],
  'ru.yandex.desktop.music': [255, 204, 0],
  'com.soundcloud.desktop': [255, 85, 0],
  'org.videolan.vlc': [255, 136, 0],
  'com.colliderli.iina': [108, 92, 231],
  'com.tidal.desktop': [255, 255, 255],
  'com.deezer.deezer-desktop': [162, 56, 255],
  'com.amazon.music': [37, 209, 218],
  'com.apple.Safari': null,
  'com.google.Chrome': null,
  'com.google.Chrome.beta': null,
  'com.google.Chrome.canary': null,
  'com.brave.Browser': null,
  'com.microsoft.edgemac': null,
  'company.thebrowser.Browser': null,
  'com.vivaldi.Vivaldi': null,
  'com.operasoftware.Opera': null,
  'ru.yandex.desktop.yandex-browser': null,
  'org.mozilla.firefox': null
};

// rgb, null (no colour) or undefined (no override: use the icon colour).
function appColorOverride(bundleId) {
  return Object.prototype.hasOwnProperty.call(APP_COLORS, bundleId) ? APP_COLORS[bundleId] : undefined;
}

module.exports = { APP_COLORS, appColorOverride };
