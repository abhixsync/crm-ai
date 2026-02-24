const path = require('path');
const XLSX = require('xlsx');

const sourcePath = path.resolve(process.cwd(), 'delhi.xlsx');
const outputPath = path.resolve(process.cwd(), 'public', 'samples', 'delhi-sample.xlsx');

const sourceWb = XLSX.readFile(sourcePath);
const sourceSheetName = sourceWb.SheetNames[0];
const sourceSheet = sourceWb.Sheets[sourceSheetName];

const rows = XLSX.utils.sheet_to_json(sourceSheet, { header: 1, defval: '' });
const headers = (rows[0] || []).map((value) => String(value || '').trim());

if (!headers.length || headers.every((h) => !h)) {
  throw new Error('No headers found in delhi.xlsx');
}

const cleanedHeaders = headers.filter((h) => h.length > 0);
const templateSheet = XLSX.utils.aoa_to_sheet([cleanedHeaders]);

const outWb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(outWb, templateSheet, sourceSheetName || 'Sheet1');
XLSX.writeFile(outWb, outputPath);

console.log(`Created ${outputPath} with ${cleanedHeaders.length} header columns and no data rows.`);
