// Keep the intended meaning of the two-line home headline across languages.
// These editorial translations take precedence over machine-generated copy.
const headlines: Record<string, [string, string]> = {
  ar: ["فرص عمل محلية.", "انتظار أقصر للحصول على أجرك."],
  de: ["Gute Arbeit.", "Kürzer auf die Bezahlung warten."],
  es: ["Buen trabajo.", "Menos espera para cobrar."],
  fr: ["Du travail près de chez vous.", "Moins d’attente avant d’être payé."],
  hi: ["अच्छा काम।", "भुगतान के लिए कम इंतज़ार।"],
  it: ["Un buon lavoro.", "Meno attesa per il pagamento."],
  ja: ["地域で仕事を探す。", "報酬を受け取るまでの待ち時間を短く。"],
  ko: ["가까운 곳에서 일하세요.", "보수를 기다리는 시간을 줄이세요."],
  pt: ["Bom trabalho.", "Menos espera para receber."],
  zh: ["在附近找工作。", "缩短等待报酬的时间。"],
};
export function headline(language: string, source: string) {
  const pair = headlines[language];
  if (source === "Good work.") return pair?.[0];
  if (source === "A shorter wait for payday.") return pair?.[1];
}
