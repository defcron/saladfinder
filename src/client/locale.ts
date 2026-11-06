import { headline } from "./brand-copy";
import catalog from "../shared/messages.json";
import i18next from "i18next";
import { languageFor, languages } from "../shared/languages";
const preferenceKey = "saladfinder-language";
function preference() {
  try {
    return localStorage.getItem(preferenceKey) || "";
  } catch {
    return "";
  }
}
export const override = preference();
const preferred =
  typeof navigator === "undefined" ? ["en-CA"] : navigator.languages;
export const language = languageFor(override ? [override] : preferred);
export const locale =
  (override && languages.includes(override)
    ? preferred.find(
        (tag) =>
          languageFor([tag]) === override &&
          new Intl.Locale(tag).language === override,
      ) || override
    : preferred[0]) || "en-CA";
export function setLanguage(value: string) {
  if (value && !languages.includes(value)) return;
  try {
    if (value) localStorage.setItem(preferenceKey, value);
    else localStorage.removeItem(preferenceKey);
    location.reload();
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
}
void i18next.init({
  lng: language,
  fallbackLng: "en",
  resources: {},
  initAsync: false,
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
});
if (typeof document !== "undefined") {
  document.documentElement.lang = language;
  document.documentElement.dir = [
    "ar",
    "fa",
    "he",
    "ps",
    "sd",
    "ur",
    "yi",
  ].includes(language)
    ? "rtl"
    : "ltr";
}
const requested = new Set<string>();
const pending = new Set<string>();
let loading = false;
let version = 0;
const listeners = new Set<() => void>();
export const subscribeLocale = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const localeVersion = () => version;
async function fetchMessages() {
  if (loading) return;
  loading = true;
  try {
    while (pending.size) {
      const ids = Array.from(pending).slice(0, 8);
      ids.forEach((id) => pending.delete(id));
      const response = await fetch(
        "/api/translations/" + language + "?ids=" + ids.sort().join(","),
        { credentials: "omit" },
      );
      if (!response.ok) break;
      const messages: Record<string, string> = await response.json();
      i18next.addResources(language, "translation", messages);
      version++;
      listeners.forEach((fn) => fn());
    }
  } catch {
    /* English source remains usable offline. */
  } finally {
    loading = false;
  }
}
export function message(id: string, source: string) {
  if (language === "en") return source;
  const editorial = headline(language, source);
  if (editorial) return editorial;
  if (!requested.has(id)) {
    requested.add(id);
    pending.add(id);
    queueMicrotask(fetchMessages);
  }
  return i18next.t(id, { defaultValue: source });
}

// Look up only known product copy. Unknown text stays on the device.
const lookup = new Map(Object.entries(catalog).map(([id, text]) => [text, id]));
export function displayLabel(source: string) {
  const id = lookup.get(source);
  return id ? message(id, source) : source;
}
