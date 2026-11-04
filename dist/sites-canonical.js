// Sites is the static origin; the canonical domain supplies the same-origin API.
if (location.hostname === "saladfinder.defcron.chatgpt.site") {
  const target = new URL("https://saladfinder.com");
  target.pathname = location.pathname;
  target.search = location.search;
  target.hash = location.hash;
  location.replace(target.href);
}
