// Usage: import { initThemeToggle } from "./theme.js"; initThemeToggle(document.querySelector("#theme-toggle"));
const COLORS = { dark: "#11150e", light: "#eef7f1" };

export function setTheme(t) {
  t = t === "light" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("theme", t); } catch { /* storage blocked */ }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", COLORS[t]);
  return t;
}

export function initThemeToggle(button) {
  if (!button) return;
  const sync = (t) => {
    button.setAttribute("aria-pressed", String(t === "light"));
    button.setAttribute("aria-label", t === "light" ? "Light theme on, switch to dark" : "Dark theme on, switch to light");
  };
  const cur = () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  sync(cur());
  button.addEventListener("click", () => sync(setTheme(cur() === "light" ? "dark" : "light")));
}
