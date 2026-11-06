// Language codes accepted by the M2M100 translation model. Use BCP 47 codes in the UI.
export const languages =
  "af am ar ast az ba be bg bn br bs ca ceb cs cy da de el en es et fa ff fi fr fy ga gd gl gu ha he hi hr ht hu hy id ig ilo is it ja jv ka kk km kn ko lb lg ln lo lt lv mg mk ml mn mr ms my ne nl no nso oc or pa pl ps pt ro ru sd si sk sl so sq sr ss su sv sw ta th tl tn tr uk ur uz vi wo xh yi yo zh zu".split(
    " ",
  );
export function languageFor(tags: readonly string[]) {
  for (const tag of tags) {
    try {
      const base = new Intl.Locale(tag).language;
      const language =
        ({ fil: "tl", nb: "no", nn: "no" } as Record<string, string>)[base] ||
        base;
      if (languages.includes(language)) return language;
    } catch {
      /* Try the next preferred language. */
    }
  }
  return "en";
}
