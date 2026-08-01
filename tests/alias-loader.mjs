import path from "node:path";
import { pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "server-only") {
    return {
      url: "data:text/javascript,export default {};",
      shortCircuit: true,
    };
  }
  if (specifier.startsWith("@/")) {
    return {
      url: pathToFileURL(
        path.join(process.cwd(), "src", `${specifier.slice(2)}.ts`),
      ).href,
      shortCircuit: true,
    };
  }
  return nextResolve(specifier, context);
}
