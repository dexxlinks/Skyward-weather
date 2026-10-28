// Runs before the page is painted so a saved light theme doesn't flash dark first.
// Keep this file tiny and keep the storage key in sync with js/app.js.
(function () {
  var theme = 'dark'; // dark is the default
  try {
    var saved = localStorage.getItem('skyward:theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
  } catch (error) {
    // localStorage can be blocked (private mode, strict settings). Keep the default.
  }
  document.documentElement.setAttribute('data-theme', theme);
})();
