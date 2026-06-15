const fs = require("fs");

const file = "next.config.ts";

if (!fs.existsSync(file)) {
  throw new Error("next.config.ts not found");
}

let content = fs.readFileSync(file, "utf8");

fs.writeFileSync("next.config.ts.bak-remove-invalid-serveractions", content, "utf8");

content = content.replace(
  /\s*serverActions\s*:\s*\{\s*bodySizeLimit\s*:\s*["'`][^"'`]+["'`]\s*,?\s*\},\s*/g,
  "\n"
);

fs.writeFileSync(file, content, "utf8");

console.log("Removed invalid serverActions block from next.config.ts");
