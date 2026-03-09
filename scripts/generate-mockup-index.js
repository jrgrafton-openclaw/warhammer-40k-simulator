const fs = require('fs');
const path = require('path');

const mockupsDir = path.join(__dirname, '../mockups');
const indexPath = path.join(mockupsDir, 'index.html');

const files = fs.readdirSync(mockupsDir)
  .filter(f => f.endsWith('.html') && f !== 'index.html')
  .sort();

let links = files.map(file => {
   const isBold = file.includes('v0.13');
   const title = file.replace('.html', '');
   const link = `<a href="./${file}" class="block p-4 bg-gray-800 rounded mb-2 hover:bg-gray-700 ${isBold ? 'border-l-4 border-emerald-500 font-bold' : ''}">${title}</a>`;
   return link;
}).join('\\n');

const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Mockups Index</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-900 text-gray-100 p-8">
    <div class="max-w-2xl mx-auto">
        <h1 class="text-3xl font-bold mb-6 text-emerald-400">Warhammer 40k Simulator - Mockups</h1>
        <div class="space-y-2">
            ${links}
        </div>
    </div>
</body>
</html>`;

fs.writeFileSync(indexPath, html);
