// House theme pre-paint (external: extension pages allow no inline script). Dark unless stored 'light'; never reads prefers-color-scheme.
(function () {
  var t = "dark";
  try { if (localStorage.getItem("theme") === "light") t = "light"; } catch { /* storage blocked: dark */ }
  document.documentElement.setAttribute("data-theme", t);
  try { var logo = localStorage.getItem("logo-form"); if (logo === "short" || logo === "middle" || logo === "long") document.documentElement.setAttribute("data-logo", logo); } catch { /* default form */ }
})();
