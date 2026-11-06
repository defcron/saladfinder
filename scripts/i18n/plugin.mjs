import { transformCopy } from "./extract.mjs";
import { resolve } from "node:path";
export default function localize() {
  return {
    name: "saladfinder-messages",
    enforce: "pre",
    transform(source, id) {
      if (!id.startsWith(resolve("src/client") + "/") || !id.endsWith(".tsx"))
        return;
      const { code } = transformCopy(source);
      return {
        code:
          'import {message as sfMessage} from "/src/client/locale.ts";\n' +
          code,
        map: null,
      };
    },
  };
}
