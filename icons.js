// Original SVG icons used by the app. They are static, trusted strings written by
// the developer (never built from user input or API text), so it is safe for
// app.js to turn them into DOM nodes.
//
// Weather icons are 64x64 and take their colours from CSS variables (see style.css),
// which lets them adapt to the dark and light themes.

const weatherSvg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" focusable="false">${inner}</svg>`;

const uiSvg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${inner}</svg>`;

// Building blocks
const SUN_CORE = '<circle class="wx-sun" cx="32" cy="32" r="11"/>';
const SUN_RAYS =
  '<path class="wx-sun-ray" d="M32 8v6M32 50v6M8 32h6M50 32h6M15 15l4.2 4.2M44.8 44.8L49 49M15 49l4.2-4.2M44.8 19.2L49 15"/>';
const MOON_PATH = '<path class="wx-moon" d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>';
const CLOUD_SHAPES =
  '<circle cx="22" cy="36" r="9"/><circle cx="34" cy="28" r="12"/><circle cx="45" cy="36" r="9"/><rect x="22" y="36" width="23" height="9"/>';

const cloud = (className, transform) =>
  `<g class="${className}" transform="${transform}">${CLOUD_SHAPES}</g>`;

const RAIN_LONG = '<path class="wx-rain" d="M24 44l-3 9M34 44l-3 9M44 44l-3 9M29 54l-2 6M39 54l-2 6"/>';
const RAIN_SHORT = '<path class="wx-rain wx-rain--thin" d="M23 46l-1.5 4M33 48l-1.5 4M43 46l-1.5 4M28 54l-1.5 4M38 55l-1.5 4"/>';

const WEATHER_ICONS = {
  'clear-day': weatherSvg(SUN_RAYS + SUN_CORE),
  'clear-night': weatherSvg(
    `<g transform="translate(8 8) scale(2)">${MOON_PATH}</g>` +
      '<circle class="wx-star" cx="52" cy="13" r="1.6"/><circle class="wx-star" cx="57" cy="23" r="1.2"/>'
  ),
  'partly-cloudy-day': weatherSvg(
    `<g transform="translate(2.2 2.2) scale(.62)">${SUN_RAYS}${SUN_CORE}</g>` +
      cloud('wx-cloud', 'translate(11.2 15.6) scale(.8)')
  ),
  'partly-cloudy-night': weatherSvg(
    `<g transform="translate(6 4) scale(1.25)">${MOON_PATH}</g>` +
      cloud('wx-cloud', 'translate(11.2 15.6) scale(.8)')
  ),
  cloudy: weatherSvg(
    cloud('wx-cloud-back', 'translate(15 0) scale(.75)') + cloud('wx-cloud', 'translate(-2 8)')
  ),
  fog: weatherSvg(
    cloud('wx-cloud', 'translate(0 -6)') + '<path class="wx-fog" d="M16 46h28M22 52h28M16 58h24"/>'
  ),
  drizzle: weatherSvg(cloud('wx-cloud', 'translate(0 -6)') + RAIN_SHORT),
  rain: weatherSvg(cloud('wx-cloud', 'translate(0 -6)') + RAIN_LONG),
  sleet: weatherSvg(
    cloud('wx-cloud', 'translate(0 -6)') +
      '<path class="wx-rain" d="M25 44l-3 8M43 44l-3 8"/>' +
      '<circle class="wx-snow" cx="34" cy="49" r="2.6"/><circle class="wx-snow" cx="29" cy="58" r="2.6"/><circle class="wx-snow" cx="41" cy="58" r="2.6"/>'
  ),
  snow: weatherSvg(
    cloud('wx-cloud', 'translate(0 -6)') +
      '<circle class="wx-snow" cx="22" cy="48" r="2.7"/><circle class="wx-snow" cx="33" cy="48" r="2.7"/><circle class="wx-snow" cx="44" cy="48" r="2.7"/><circle class="wx-snow" cx="27" cy="57" r="2.7"/><circle class="wx-snow" cx="39" cy="57" r="2.7"/>'
  ),
  thunder: weatherSvg(
    cloud('wx-cloud', 'translate(0 -6)') +
      '<polygon class="wx-bolt" points="36,34 26,48 32,48 29,60 42,44 36,44 40,34"/>'
  ),
};

const UI_ICONS = {
  logo: WEATHER_ICONS['partly-cloudy-day'],
  search: uiSvg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'),
  locate: uiSvg(
    '<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>'
  ),
  pin: uiSvg('<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'),
  thermometer: uiSvg('<path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>'),
  droplet: uiSvg('<path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>'),
  wind: uiSvg('<path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/>'),
  umbrella: uiSvg('<path d="M3 12a9 9 0 0 1 18 0z"/><path d="M12 12v6.5a2 2 0 0 1-4 0"/>'),
  sun: uiSvg(
    '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'
  ),
  moon: uiSvg('<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'),
  alert: uiSvg('<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5v.01"/>'),
  close: uiSvg('<path d="M6 6l12 12M18 6L6 18"/>'),
};
