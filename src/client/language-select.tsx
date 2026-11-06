import { languages } from "../shared/languages";
import { language, override, setLanguage } from "./locale";
export function LanguageSelect() {
  return (
    <div>
      <label>
        Language
        <select
          aria-label="Language"
          value={override}
          onChange={(e) => setLanguage(e.target.value)}
        >
          <option value="">Browser language</option>
          {languages.map((code) => (
            <option key={code} value={code} lang={code}>
              {new Intl.DisplayNames(code, { type: "language" }).of(code)}
            </option>
          ))}
        </select>
      </label>
      {language !== "en" && (
        <small>
          Automatic translation. Choose English to read the original.
        </small>
      )}
    </div>
  );
}
