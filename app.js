'use strict';

/* ==========================================================================
   Skyward – weather app
   Sections: 1 Configuration · 2 Weather codes · 3 State & elements · 4 Errors
             5 Storage · 6 Formatting · 7 API · 8 Geolocation · 9 Rendering
             10 Requests · 11 Events & start-up
   ========================================================================== */

/* 1. Configuration -------------------------------------------------------- */
const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';

const STORAGE_KEYS = {
  theme: 'skyward:theme', // keep in sync with js/theme-init.js
  unit: 'skyward:unit',
  lastLocation: 'skyward:lastLocation',
};

const REQUEST_TIMEOUT_MS = 10000;
const GEOLOCATION_TIMEOUT_MS = 10000;
const SEARCH_RESULT_COUNT = 5;
const MIN_QUERY_LENGTH = 2; // the geocoding API returns nothing for 1 character
const HOURS_TO_SHOW = 24;
const FORECAST_DAYS = 7;

// Fields we ask Open-Meteo for. Names come from the official forecast docs.
const CURRENT_FIELDS = [
  'temperature_2m',
  'relative_humidity_2m',
  'apparent_temperature',
  'is_day',
  'precipitation',
  'weather_code',
  'wind_speed_10m',
];
const HOURLY_FIELDS = ['temperature_2m', 'precipitation_probability', 'weather_code', 'is_day'];
const DAILY_FIELDS = ['weather_code', 'temperature_2m_max', 'temperature_2m_min'];

/* 2. Weather codes -------------------------------------------------------- */
// Open-Meteo returns WMO weather codes (numbers). The API gives no text or icons,
// so we map each code to a description and one of our own icons (see js/icons.js).
const WEATHER_CODES = {
  0: { label: 'Clear sky', icon: 'clear' },
  1: { label: 'Mainly clear', icon: 'clear' },
  2: { label: 'Partly cloudy', icon: 'partly-cloudy' },
  3: { label: 'Overcast', icon: 'cloudy' },
  45: { label: 'Fog', icon: 'fog' },
  48: { label: 'Depositing rime fog', icon: 'fog' },
  51: { label: 'Light drizzle', icon: 'drizzle' },
  53: { label: 'Moderate drizzle', icon: 'drizzle' },
  55: { label: 'Dense drizzle', icon: 'drizzle' },
  56: { label: 'Light freezing drizzle', icon: 'sleet' },
  57: { label: 'Dense freezing drizzle', icon: 'sleet' },
  61: { label: 'Slight rain', icon: 'rain' },
  63: { label: 'Moderate rain', icon: 'rain' },
  65: { label: 'Heavy rain', icon: 'rain' },
  66: { label: 'Light freezing rain', icon: 'sleet' },
  67: { label: 'Heavy freezing rain', icon: 'sleet' },
  71: { label: 'Slight snowfall', icon: 'snow' },
  73: { label: 'Moderate snowfall', icon: 'snow' },
  75: { label: 'Heavy snowfall', icon: 'snow' },
  77: { label: 'Snow grains', icon: 'snow' },
  80: { label: 'Slight rain showers', icon: 'rain' },
  81: { label: 'Moderate rain showers', icon: 'rain' },
  82: { label: 'Violent rain showers', icon: 'rain' },
  85: { label: 'Slight snow showers', icon: 'snow' },
  86: { label: 'Heavy snow showers', icon: 'snow' },
  95: { label: 'Thunderstorm', icon: 'thunder' },
  96: { label: 'Thunderstorm with slight hail', icon: 'thunder' },
  97: { label: 'Heavy thunderstorm', icon: 'thunder' },
  99: { label: 'Thunderstorm with heavy hail', icon: 'thunder' },
};

const UNKNOWN_WEATHER = { label: 'Unknown conditions', icon: 'cloudy' };

function getWeatherInfo(code) {
  return WEATHER_CODES[code] ?? UNKNOWN_WEATHER;
}

// Only clear and partly-cloudy skies look different at night.
function getIconKey(code, isDay) {
  const { icon } = getWeatherInfo(code);
  const hasNightVariant = icon === 'clear' || icon === 'partly-cloudy';
  return hasNightVariant ? `${icon}-${isDay ? 'day' : 'night'}` : icon;
}

/* 3. State & elements ----------------------------------------------------- */
const state = {
  unit: 'celsius', // 'celsius' | 'fahrenheit' – display preference only
  location: null, // the place currently shown
  weather: null, // parsed forecast for that place (always in °C)
  candidates: [], // other places that matched the last search
  isLoading: false,
  controller: null, // AbortController of the request in flight
  pendingKey: null, // identifies the request in flight (to ignore exact duplicates)
};

const $ = (selector) => document.querySelector(selector);

const els = {
  main: $('#main'),
  searchForm: $('#search-form'),
  searchInput: $('#search-input'),
  searchButton: $('#search-button'),
  candidates: $('#candidates'),
  candidatesList: $('#candidates-list'),
  errorBanner: $('#error-banner'),
  errorMessage: $('#error-message'),
  errorDismiss: $('#error-dismiss'),
  status: $('#status'),
  welcome: $('#welcome'),
  skeleton: $('#skeleton'),
  dashboard: $('#dashboard'),
  hero: $('#hero'),
  locationName: $('#location-name'),
  locationDetail: $('#location-detail'),
  dayNightIcon: $('#day-night-icon'),
  dayNightText: $('#day-night-text'),
  currentTemp: $('#current-temp'),
  currentUnit: $('#current-unit'),
  currentDescription: $('#current-description'),
  currentRange: $('#current-range'),
  currentIcon: $('#current-icon'),
  localTime: $('#local-time'),
  statFeelsLike: $('#stat-feels-like'),
  statFeelsLikeNote: $('#stat-feels-like-note'),
  statHumidity: $('#stat-humidity'),
  statWind: $('#stat-wind'),
  statPrecipitation: $('#stat-precipitation'),
  statPrecipitationNote: $('#stat-precipitation-note'),
  hourlyTimezone: $('#hourly-timezone'),
  hourlyList: $('#hourly-list'),
  dailyList: $('#daily-list'),
  themeToggle: $('#theme-toggle'),
  themeToggleIcon: $('#theme-toggle-icon'),
  themeColorMeta: $('meta[name="theme-color"]'),
  unitButtons: document.querySelectorAll('[data-unit]'),
};

/* 4. Errors --------------------------------------------------------------- */
// Every failure we expect is thrown as an AppError with a short code. Raw technical
// details never reach the screen: getErrorMessage() turns a code into plain language.
class AppError extends Error {
  constructor(code, details = {}) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}

function getErrorMessage(error) {
  if (!(error instanceof AppError)) {
    return 'Something went wrong. Please try again.';
  }

  switch (error.code) {
    case 'EMPTY_QUERY':
      return 'Enter a city name to search.';
    case 'QUERY_TOO_SHORT':
      return `Enter at least ${MIN_QUERY_LENGTH} characters.`;
    case 'NOT_FOUND':
      return `We couldn’t find “${error.details.query}”. Check the spelling, or add a country like “Lagos, Nigeria”.`;
    case 'NETWORK':
      return 'Can’t reach the weather service. Check your internet connection and try again.';
    case 'TIMEOUT':
      return 'The weather service took too long to respond. Please try again.';
    case 'API_ERROR':
      if (error.details.status === 429) {
        return 'Too many requests right now. Wait a moment, then try again.';
      }
      if (error.details.status >= 500) {
        return 'The weather service is having problems. Try again in a few minutes.';
      }
      return 'The weather service couldn’t handle that request. Please try again.';
    case 'BAD_DATA':
      return 'The weather service sent back data we couldn’t read. Try again in a moment.';
    case 'GEO_DENIED':
      return 'Location access is blocked. Allow location for this site in your browser settings (usually under the lock icon next to the address), then choose “My location” again. You can still search for a city.';
    case 'GEO_UNAVAILABLE':
      return 'Your device couldn’t work out where you are. Make sure location services are turned on, or search for a city instead.';
    case 'GEO_TIMEOUT':
      return 'Finding your location took too long. Try again, or search for a city instead.';
    case 'GEO_UNSUPPORTED':
      return 'This browser can’t share your location. Search for a city instead.';
    default:
      return 'Something went wrong. Please try again.';
  }
}

function showError(message) {
  els.errorMessage.textContent = message;
  els.errorBanner.hidden = false;
}

function clearError() {
  els.errorBanner.hidden = true;
  els.errorMessage.textContent = '';
  els.searchInput.removeAttribute('aria-invalid');
}

function reportError(error) {
  if (!(error instanceof AppError)) console.error(error); // keep details for developers
  showError(getErrorMessage(error));
}

/* 5. Storage -------------------------------------------------------------- */
// localStorage can throw (private mode, blocked cookies), so every access is guarded.
function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    // The preference simply won't persist. Nothing else depends on it.
  }
}

// Only the place is saved – never weather data – so we always show fresh conditions.
function saveLastLocation(location) {
  writeStorage(
    STORAGE_KEYS.lastLocation,
    JSON.stringify({
      name: location.name,
      admin1: location.admin1,
      country: location.country,
      latitude: location.latitude,
      longitude: location.longitude,
      isCurrentPosition: Boolean(location.isCurrentPosition),
    })
  );
}

function readLastLocation() {
  const raw = readStorage(STORAGE_KEYS.lastLocation);
  if (!raw) return null;

  try {
    const saved = JSON.parse(raw);
    const isValid =
      typeof saved.name === 'string' &&
      saved.name.length > 0 &&
      isNumber(saved.latitude) &&
      saved.latitude >= -90 &&
      saved.latitude <= 90 &&
      isNumber(saved.longitude) &&
      saved.longitude >= -180 &&
      saved.longitude <= 180;
    if (!isValid) return null;

    return {
      name: saved.name,
      admin1: typeof saved.admin1 === 'string' ? saved.admin1 : '',
      country: typeof saved.country === 'string' ? saved.country : '',
      latitude: saved.latitude,
      longitude: saved.longitude,
      isCurrentPosition: saved.isCurrentPosition === true,
    };
  } catch (error) {
    return null; // corrupted value: ignore it
  }
}

/* 6. Formatting ----------------------------------------------------------- */
function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

const celsiusToFahrenheit = (celsius) => (celsius * 9) / 5 + 32;

function convertTemperature(celsius, unit) {
  return unit === 'fahrenheit' ? celsiusToFahrenheit(celsius) : celsius;
}

function formatTemperature(celsius) {
  return `${Math.round(convertTemperature(celsius, state.unit))}°`;
}

// Open-Meteo returns local wall-clock times such as "2026-10-28T14:00" for the
// requested place (we ask for timezone=auto). We must NOT hand these strings to
// `new Date()` directly, because the browser would read them in the *visitor's*
// timezone. Instead we build a Date whose UTC fields equal the wall-clock fields
// and always format it with timeZone: 'UTC', so the numbers are shown unchanged.
function wallClockToDate(isoString) {
  const [datePart, timePart = '00:00'] = isoString.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hour, minute] = timePart.split(':').map(Number);
  return new Date(Date.UTC(year, month - 1, day, hour, minute));
}

const hourFormatter = new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: 'UTC' });
const weekdayFormatter = new Intl.DateTimeFormat(undefined, { weekday: 'short', timeZone: 'UTC' });
const localTimeFormatter = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'UTC',
});

const formatHour = (iso) => hourFormatter.format(wallClockToDate(iso));
const formatWeekday = (iso) => weekdayFormatter.format(wallClockToDate(iso));

function formatCoordinates(latitude, longitude) {
  const northSouth = latitude >= 0 ? 'N' : 'S';
  const eastWest = longitude >= 0 ? 'E' : 'W';
  return `${Math.abs(latitude).toFixed(2)}° ${northSouth}, ${Math.abs(longitude).toFixed(2)}° ${eastWest}`;
}

function describeLocation(location) {
  const parts = [location.name, location.admin1, location.country].filter(Boolean);
  return [...new Set(parts)].join(', ');
}

function normalizeQuery(rawQuery) {
  return rawQuery.trim().replace(/\s+/g, ' ');
}

/* 7. API ------------------------------------------------------------------ */
// Fetches a URL and returns parsed JSON. It checks the HTTP status, enforces a
// timeout and turns every failure into an AppError.
async function fetchJson(url, signal) {
  signal.throwIfAborted();

  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort(), REQUEST_TIMEOUT_MS);
  const forwardAbort = () => timeoutController.abort(); // caller cancelled -> cancel fetch
  signal.addEventListener('abort', forwardAbort, { once: true });

  try {
    const response = await fetch(url, { signal: timeoutController.signal });
    if (!response.ok) {
      throw new AppError('API_ERROR', { status: response.status });
    }
    return await response.json();
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (signal.aborted) throw error; // replaced by a newer request: let the caller ignore it
    if (error.name === 'AbortError') throw new AppError('TIMEOUT');
    if (error instanceof SyntaxError) throw new AppError('BAD_DATA'); // body wasn't valid JSON
    throw new AppError('NETWORK');
  } finally {
    clearTimeout(timeoutId);
    signal.removeEventListener('abort', forwardAbort);
  }
}

// Geocoding: city name -> list of matching places with coordinates.
async function fetchLocations(query, signal) {
  const params = new URLSearchParams({
    name: query,
    count: SEARCH_RESULT_COUNT,
    language: 'en',
    format: 'json',
  });
  const data = await fetchJson(`${GEOCODING_URL}?${params}`, signal);

  // When nothing matches, the API leaves out the "results" key entirely.
  if (!Array.isArray(data?.results) || data.results.length === 0) {
    throw new AppError('NOT_FOUND', { query });
  }

  const locations = data.results
    .filter((place) => place && typeof place.name === 'string' && isNumber(place.latitude) && isNumber(place.longitude))
    .map((place) => ({
      id: place.id,
      name: place.name,
      admin1: place.admin1 ?? '',
      country: place.country ?? '',
      latitude: place.latitude,
      longitude: place.longitude,
    }));

  if (locations.length === 0) throw new AppError('BAD_DATA');
  return locations;
}

// Forecast: coordinates -> current conditions, hourly and daily forecast.
// Data is always requested in °C and km/h; the °F toggle converts in the browser.
async function fetchWeather(location, signal) {
  const params = new URLSearchParams({
    latitude: location.latitude,
    longitude: location.longitude,
    current: CURRENT_FIELDS.join(','),
    hourly: HOURLY_FIELDS.join(','),
    daily: DAILY_FIELDS.join(','),
    timezone: 'auto', // times come back in the place's own local time
    forecast_days: FORECAST_DAYS,
    temperature_unit: 'celsius',
    wind_speed_unit: 'kmh',
    precipitation_unit: 'mm',
  });
  const data = await fetchJson(`${FORECAST_URL}?${params}`, signal);
  return parseForecast(data);
}

// Validates the raw response and reshapes it into objects that are easy to render.
function parseForecast(data) {
  const { current, hourly, daily } = data ?? {};
  if (!current || !hourly || !daily) throw new AppError('BAD_DATA');

  const hasCurrent =
    typeof current.time === 'string' && isNumber(current.temperature_2m) && isNumber(current.weather_code);
  const hasHourly =
    Array.isArray(hourly.time) && Array.isArray(hourly.temperature_2m) && Array.isArray(hourly.weather_code);
  const hasDaily =
    Array.isArray(daily.time) &&
    Array.isArray(daily.weather_code) &&
    Array.isArray(daily.temperature_2m_max) &&
    Array.isArray(daily.temperature_2m_min);
  if (!hasCurrent || !hasHourly || !hasDaily) throw new AppError('BAD_DATA');

  // Hourly arrays start at midnight today, so find where "now" is and take 24 hours from there.
  const currentHourPrefix = current.time.slice(0, 13); // "2026-10-28T14"
  const startIndex = Math.max(0, hourly.time.findIndex((time) => time.startsWith(currentHourPrefix)));

  const hours = [];
  for (let i = startIndex; i < hourly.time.length && hours.length < HOURS_TO_SHOW; i += 1) {
    if (!isNumber(hourly.temperature_2m[i])) continue;
    hours.push({
      time: hourly.time[i],
      temperatureC: hourly.temperature_2m[i],
      weatherCode: hourly.weather_code[i],
      isDay: hourly.is_day?.[i] !== 0,
      precipitationProbability: isNumber(hourly.precipitation_probability?.[i])
        ? hourly.precipitation_probability[i]
        : null,
    });
  }

  const days = daily.time
    .map((date, i) => ({
      date,
      weatherCode: daily.weather_code[i],
      maxC: daily.temperature_2m_max[i],
      minC: daily.temperature_2m_min[i],
    }))
    .filter((day) => isNumber(day.maxC) && isNumber(day.minC));

  if (hours.length === 0 || days.length === 0) throw new AppError('BAD_DATA');

  return {
    timezone: typeof data.timezone === 'string' ? data.timezone : '',
    units: {
      wind: data.current_units?.wind_speed_10m ?? 'km/h',
      precipitation: data.current_units?.precipitation ?? 'mm',
    },
    current: {
      time: current.time,
      intervalSeconds: isNumber(current.interval) ? current.interval : null,
      temperatureC: current.temperature_2m,
      feelsLikeC: isNumber(current.apparent_temperature) ? current.apparent_temperature : null,
      humidity: isNumber(current.relative_humidity_2m) ? current.relative_humidity_2m : null,
      windSpeed: isNumber(current.wind_speed_10m) ? current.wind_speed_10m : null,
      precipitation: isNumber(current.precipitation) ? current.precipitation : null,
      weatherCode: current.weather_code,
      isDay: current.is_day === 1 ? true : current.is_day === 0 ? false : null,
    },
    hours,
    days,
  };
}

/* 8. Geolocation ---------------------------------------------------------- */
function getCurrentCoordinates() {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new AppError('GEO_UNSUPPORTED'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position.coords),
      (positionError) => {
        // PERMISSION_DENIED = 1, POSITION_UNAVAILABLE = 2, TIMEOUT = 3
        const codes = { 1: 'GEO_DENIED', 2: 'GEO_UNAVAILABLE', 3: 'GEO_TIMEOUT' };
        reject(new AppError(codes[positionError.code] ?? 'GEO_UNAVAILABLE'));
      },
      { enableHighAccuracy: false, timeout: GEOLOCATION_TIMEOUT_MS, maximumAge: 5 * 60 * 1000 }
    );
  });
}

function createLocationFromCoordinates(coords) {
  // Four decimals is roughly 10 m: plenty for weather, and no more precise than needed.
  return {
    name: 'Your location',
    admin1: '',
    country: '',
    latitude: Number(coords.latitude.toFixed(4)),
    longitude: Number(coords.longitude.toFixed(4)),
    isCurrentPosition: true,
  };
}

/* 9. Rendering ------------------------------------------------------------ */
// Rule for this file: text from the API or the user is only ever inserted with
// textContent / createTextNode, never innerHTML. Only our own static icon markup
// (js/icons.js) is parsed as HTML.
function createSvgIcon(markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  return template.content.firstElementChild;
}

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function createHiddenText(text) {
  return createElement('span', 'visually-hidden', text);
}

function createWeatherIcon(code, isDay) {
  const key = getIconKey(code, isDay);
  const label = getWeatherInfo(code).label;
  const svg = createSvgIcon(WEATHER_ICONS[key]);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', label);
  return { svg, key, label };
}

function hydrateStaticIcons() {
  document.querySelectorAll('[data-icon]').forEach((node) => {
    const markup = UI_ICONS[node.dataset.icon];
    if (markup) node.replaceChildren(createSvgIcon(markup));
  });
}

function updateView() {
  const hasWeather = state.weather !== null;
  els.welcome.hidden = hasWeather || state.isLoading;
  els.skeleton.hidden = hasWeather || !state.isLoading;
  els.dashboard.hidden = !hasWeather;
  els.dashboard.classList.toggle('is-loading', state.isLoading);
}

function announce(message) {
  els.status.textContent = message;
}

function setLoading(isLoading, message) {
  state.isLoading = isLoading;
  els.main.setAttribute('aria-busy', String(isLoading));
  els.searchButton.classList.toggle('is-loading', isLoading);
  if (message) announce(message);
  updateView();
}

function renderWeather() {
  if (!state.weather || !state.location) return;
  renderHero();
  renderStats();
  renderHourly();
  renderDaily();
}

function renderHero() {
  const { location, weather } = state;
  const { current } = weather;
  const today = weather.days[0];
  const icon = createWeatherIcon(current.weatherCode, current.isDay !== false);

  els.locationName.textContent = location.name;
  els.locationDetail.textContent = location.isCurrentPosition
    ? `${formatCoordinates(location.latitude, location.longitude)} · from your device`
    : [...new Set([location.admin1, location.country].filter((part) => part && part !== location.name))].join(', ');

  els.currentTemp.textContent = String(Math.round(convertTemperature(current.temperatureC, state.unit)));
  els.currentUnit.textContent = state.unit === 'fahrenheit' ? '°F' : '°C';
  els.currentDescription.textContent = icon.label;
  els.currentRange.textContent = `High ${formatTemperature(today.maxC)} · Low ${formatTemperature(today.minC)}`;
  els.currentIcon.replaceChildren(icon.svg);
  els.hero.dataset.sky = icon.key;

  const dayNightBadge = els.dayNightText.closest('.badge');
  dayNightBadge.hidden = current.isDay === null;
  if (current.isDay !== null) {
    els.dayNightText.textContent = current.isDay ? 'Daytime' : 'Night';
    els.dayNightIcon.replaceChildren(createSvgIcon(current.isDay ? UI_ICONS.sun : UI_ICONS.moon));
  }

  els.localTime.textContent = `As of ${localTimeFormatter.format(wallClockToDate(current.time))}, local time`;
}

function renderStats() {
  const { current, units } = state.weather;

  if (current.feelsLikeC === null) {
    els.statFeelsLike.textContent = '–';
    els.statFeelsLikeNote.textContent = '';
  } else {
    els.statFeelsLike.textContent = formatTemperature(current.feelsLikeC);
    const difference = current.feelsLikeC - current.temperatureC; // compared in °C, whatever is displayed
    els.statFeelsLikeNote.textContent =
      Math.abs(difference) < 1
        ? 'Close to the actual temperature'
        : difference > 0
          ? 'Warmer than the actual temperature'
          : 'Cooler than the actual temperature';
  }

  els.statHumidity.textContent = current.humidity === null ? '–' : `${Math.round(current.humidity)}%`;
  els.statWind.textContent = current.windSpeed === null ? '–' : `${Math.round(current.windSpeed)} ${units.wind}`;

  if (current.precipitation === null) {
    els.statPrecipitation.textContent = '–';
    els.statPrecipitationNote.textContent = '';
  } else {
    els.statPrecipitation.textContent = `${current.precipitation.toFixed(1)} ${units.precipitation}`;
    els.statPrecipitationNote.textContent = current.intervalSeconds
      ? `In the last ${Math.round(current.intervalSeconds / 60)} minutes`
      : 'Recent precipitation';
  }
}

function renderHourly() {
  const { hours, timezone } = state.weather;
  els.hourlyTimezone.textContent = timezone ? `Local time · ${timezone.replace(/_/g, ' ')}` : 'Local time';

  const items = hours.map((hour, index) => {
    const item = createElement('li', index === 0 ? 'hour hour--now' : 'hour');

    const time = createElement('time', 'hour__time', index === 0 ? 'Now' : formatHour(hour.time));
    time.dateTime = hour.time;

    const iconWrapper = createElement('span', 'hour__icon');
    iconWrapper.append(createWeatherIcon(hour.weatherCode, hour.isDay).svg);

    const temperature = createElement('span', 'hour__temp', formatTemperature(hour.temperatureC));

    const rain = createElement('span', 'hour__rain');
    if (hour.precipitationProbability !== null) {
      const dropIcon = createElement('span', 'icon');
      dropIcon.setAttribute('aria-hidden', 'true');
      dropIcon.append(createSvgIcon(UI_ICONS.droplet));
      rain.append(
        dropIcon,
        createHiddenText('Chance of precipitation '),
        document.createTextNode(`${Math.round(hour.precipitationProbability)}%`)
      );
    }

    item.append(time, iconWrapper, temperature, rain);
    return item;
  });

  els.hourlyList.replaceChildren(...items);
  els.hourlyList.parentElement.scrollLeft = 0;
}

function renderDaily() {
  const { days } = state.weather;

  // The bars share one scale (coldest low to warmest high of the week).
  const weekMin = Math.min(...days.map((day) => day.minC));
  const weekMax = Math.max(...days.map((day) => day.maxC));
  const span = weekMax - weekMin;

  const rows = days.map((day, index) => {
    const row = createElement('li', 'day');
    const icon = createWeatherIcon(day.weatherCode, true);

    const name = createElement('div', 'day__name');
    name.append(
      createElement('span', 'day__weekday', index === 0 ? 'Today' : formatWeekday(day.date)),
      createElement('span', 'day__description', icon.label)
    );

    const iconWrapper = createElement('div', 'day__icon');
    iconWrapper.append(icon.svg);

    const low = createElement('span', 'day__min');
    low.append(createHiddenText('Low '), document.createTextNode(formatTemperature(day.minC)));
    const high = createElement('span', 'day__max');
    high.append(createHiddenText('High '), document.createTextNode(formatTemperature(day.maxC)));

    const bar = createElement('span', 'range');
    bar.setAttribute('aria-hidden', 'true');
    const fill = createElement('span', 'range__fill');
    const start = span === 0 ? 0 : ((day.minC - weekMin) / span) * 100;
    const width = span === 0 ? 100 : ((day.maxC - day.minC) / span) * 100;
    fill.style.setProperty('--start', `${start}%`);
    fill.style.setProperty('--width', `${width}%`);
    bar.append(fill);

    const temperatures = createElement('div', 'day__temps');
    temperatures.append(low, bar, high);

    row.append(name, iconWrapper, temperatures);
    return row;
  });

  els.dailyList.replaceChildren(...rows);
}

// Chips for other places that matched the search (e.g. several cities called "Lagos").
function renderCandidates() {
  const { candidates, location } = state;
  els.candidates.hidden = candidates.length < 2;
  if (candidates.length < 2) {
    els.candidatesList.replaceChildren();
    return;
  }

  const chips = candidates.map((candidate) => {
    const item = createElement('li');
    const chip = createElement('button', 'chip', describeLocation(candidate));
    chip.type = 'button';
    if (location && candidate.latitude === location.latitude && candidate.longitude === location.longitude) {
      chip.setAttribute('aria-current', 'true');
    }
    chip.addEventListener('click', () => loadWeatherForLocation(candidate));
    item.append(chip);
    return item;
  });
  els.candidatesList.replaceChildren(...chips);
}

function showWeather(location, weather, candidates) {
  state.location = location;
  state.weather = weather;
  state.candidates = candidates;

  renderWeather();
  renderCandidates();
  updateView();
  saveLastLocation(location);

  document.title = `${location.name} – Skyward`;
  announce(`Showing weather for ${describeLocation(location)}.`);
}

/* 10. Requests ------------------------------------------------------------ */
// Every network task goes through here, which guarantees:
//  - only the newest request may update the screen (older ones are aborted);
//  - an identical request that is already running is not started twice;
//  - the loading state is always switched off by its own request, even after errors.
async function runRequest({ key, loadingMessage }, task) {
  if (state.pendingKey === key) return;

  state.controller?.abort();
  const controller = new AbortController();
  state.controller = controller;
  state.pendingKey = key;

  clearError();
  setLoading(true, loadingMessage);

  try {
    await task(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) return; // replaced by a newer request: not an error
    reportError(error);
  } finally {
    // If a newer request took over, it owns the loading state now.
    if (state.controller === controller) {
      state.controller = null;
      state.pendingKey = null;
      setLoading(false);
    }
  }
}

function validateQuery(query) {
  let error = null;
  if (query.length === 0) error = new AppError('EMPTY_QUERY');
  else if (query.length < MIN_QUERY_LENGTH) error = new AppError('QUERY_TOO_SHORT');

  if (error) {
    showError(getErrorMessage(error));
    els.searchInput.setAttribute('aria-invalid', 'true');
    els.searchInput.focus();
    return false;
  }
  return true;
}

function searchForCity(rawQuery) {
  const query = normalizeQuery(rawQuery);
  if (!validateQuery(query)) return;

  runRequest({ key: `search:${query.toLowerCase()}`, loadingMessage: `Searching for ${query}…` }, async (signal) => {
    const matches = await fetchLocations(query, signal); // 1. name -> coordinates
    const weather = await fetchWeather(matches[0], signal); // 2. coordinates -> weather
    signal.throwIfAborted();
    showWeather(matches[0], weather, matches);
  });
}

function loadWeatherForLocation(location) {
  // Keep the list of alternatives only if this place is one of them (user tapped a chip).
  const isCandidate = state.candidates.some(
    (candidate) => candidate.latitude === location.latitude && candidate.longitude === location.longitude
  );
  const candidates = isCandidate ? state.candidates : [];

  runRequest(
    { key: `place:${location.latitude},${location.longitude}`, loadingMessage: `Loading weather for ${location.name}…` },
    async (signal) => {
      const weather = await fetchWeather(location, signal);
      signal.throwIfAborted();
      showWeather(location, weather, candidates);
    }
  );
}

function useCurrentPosition() {
  runRequest({ key: 'geolocation', loadingMessage: 'Finding your location…' }, async (signal) => {
    const coords = await getCurrentCoordinates(); // the permission prompt appears here
    signal.throwIfAborted();
    const location = createLocationFromCoordinates(coords);
    const weather = await fetchWeather(location, signal);
    signal.throwIfAborted();
    showWeather(location, weather, []);
  });
}

/* 11. Events & start-up --------------------------------------------------- */
function applyTheme(theme) {
  const isDark = theme === 'dark';
  document.documentElement.dataset.theme = theme;
  els.themeToggle.setAttribute('aria-label', isDark ? 'Switch to light theme' : 'Switch to dark theme');
  els.themeToggleIcon.replaceChildren(createSvgIcon(isDark ? UI_ICONS.sun : UI_ICONS.moon));
  els.themeColorMeta.setAttribute('content', isDark ? '#0a111f' : '#eef3fa');
}

function toggleTheme() {
  const nextTheme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(nextTheme);
  writeStorage(STORAGE_KEYS.theme, nextTheme);
}

function setUnit(unit) {
  state.unit = unit;
  els.unitButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.unit === unit));
  });
  renderWeather(); // re-render from the stored °C values: no new API call needed
}

function init() {
  hydrateStaticIcons();
  applyTheme(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark');

  const savedUnit = readStorage(STORAGE_KEYS.unit);
  setUnit(savedUnit === 'fahrenheit' ? 'fahrenheit' : 'celsius');

  els.searchForm.addEventListener('submit', (event) => {
    event.preventDefault(); // stop the browser from reloading the page
    searchForCity(els.searchInput.value);
  });
  els.searchInput.addEventListener('input', () => els.searchInput.removeAttribute('aria-invalid'));

  document.querySelectorAll('[data-city]').forEach((button) => {
    button.addEventListener('click', () => {
      els.searchInput.value = button.textContent;
      searchForCity(button.dataset.city);
    });
  });

  document.querySelectorAll('[data-action="locate"]').forEach((button) => {
    button.addEventListener('click', useCurrentPosition);
  });

  els.unitButtons.forEach((button) => {
    button.addEventListener('click', () => {
      setUnit(button.dataset.unit);
      writeStorage(STORAGE_KEYS.unit, button.dataset.unit);
    });
  });

  els.themeToggle.addEventListener('click', toggleTheme);
  els.errorDismiss.addEventListener('click', clearError);

  updateView();

  // Restore the last place, but always fetch fresh weather for it.
  const lastLocation = readLastLocation();
  if (lastLocation) loadWeatherForLocation(lastLocation);
}

init();
