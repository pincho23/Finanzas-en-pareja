const fs = require("node:fs");
const path = require("node:path");

const indexPath = path.join(process.cwd(), "dist", "index.html");
const html = fs.readFileSync(indexPath, "utf8");
const installMetadata = [
  '<link rel="manifest" href="/Finanzas-en-pareja/manifest.json">',
  '<link rel="apple-touch-icon" href="/Finanzas-en-pareja/icon.png">',
  '<meta name="apple-mobile-web-app-capable" content="yes">',
  '<meta name="apple-mobile-web-app-status-bar-style" content="default">',
  '<meta name="apple-mobile-web-app-title" content="Finanzas">'
].join("\n");

const prepared = html
  .replace('<html lang="en">', '<html lang="es">')
  .replace(/<meta name="viewport"[^>]*>/, '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">')
  .replace("</head>", `${installMetadata}\n</head>`);

fs.writeFileSync(indexPath, prepared);
