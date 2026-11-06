import { countries } from "../shared/regions";
import { locale } from "./locale";
const names = new Intl.DisplayNames(locale, { type: "region" });
export const countryName = (code?: string | null) =>
  code ? names.of(code) : "";
const ordered = countries
  .slice()
  .sort((a, b) => countryName(a)!.localeCompare(countryName(b)!, locale));
export function CountrySelect({
  value,
  onChange,
  all = false,
  required = false,
  disabled = false,
  allowed,
}: {
  value: string;
  onChange: (value: string) => void;
  all?: boolean;
  required?: boolean;
  disabled?: boolean;
  allowed?:string[];
}) {
  return (
    <label>
      Country or territory
      <select
        value={value}
        disabled={disabled}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">
          {all ? "All locations" : "Choose a country or territory"}
        </option>
        {ordered.filter(code=>!allowed || allowed.includes(code)).map((code) => (
          <option key={code} value={code}>
            {countryName(code)}
          </option>
        ))}
      </select>
    </label>
  );
}
