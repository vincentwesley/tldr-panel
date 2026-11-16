// Pre-paint: apply the saved logo form before first paint (external, since extension pages allow no inline script).
try {
  var logo = localStorage.getItem("logo-form");
  if (logo === "short" || logo === "middle" || logo === "long") document.documentElement.setAttribute("data-logo", logo);
} catch {
  /* storage blocked: default form */
}
