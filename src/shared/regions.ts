import codes from "i18n-iso-countries/codes.json";
export const countries = codes.map(([code]) => code);
export const isCountry = (value: string) => countries.includes(value);
export function calendarDate(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    calendar: "gregory",
    numberingSystem: "latn",
  }).format(date);
}
// Canadian Connect platform, destination charges without on_behalf_of.
// Stripe also checks the individual account and requested capabilities.
export const payoutCountries =
  "CA US GB CH AT BE BG HR CY CZ DK EE FI FR DE GR HU IS IE IT LV LI LT LU MT NL NO PL PT RO SK SI ES SE".split(
    " ",
  );
export const supportsPayouts = (country?: string | null) =>
  payoutCountries.includes(country || "");
export function enabledCountries(crossBorderFlag?:string) {
  return crossBorderFlag === "true" ? payoutCountries : ["CA"];
}
