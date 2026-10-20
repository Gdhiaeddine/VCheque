const fs = require('fs');
const path = require('path');

const configPath = path.join(process.env.APPDATA, 'com.chequestudio.algerie', 'cheque-templates.json');

const banksDataPath = path.join(__dirname, '..', 'src', 'banksData.ts');
const rawTs = fs.readFileSync(banksDataPath, 'utf8');

// Extraire elSalamPositions
const elSalamMatch = rawTs.match(/export const elSalamPositions: Positions = (\{[\s\S]*?\});/);
const elSalam = {
  numeric: { x: 138, y: 8.0, size: 3.8, align: "left" },
  words: { x: 37, y: 27.5, size: 3.2, align: "left" },
  wordsSecondLine: { x: 18, y: 32.5, size: 3.2, align: "left" },
  beneficiary: { x: 24, y: 38.2, size: 3.6, align: "left" },
  place: { x: 105, y: 45.6, size: 3.3, align: "left" },
  date: { x: 138, y: 45.6, size: 3.3, align: "left" },
  chequeNumber: { x: 25, y: 9.8, size: 3.0, align: "left" }
};

// Extraire les objets dans defaultBankTemplates
const templatesMatch = rawTs.match(/export const defaultBankTemplates: BankTemplate\[\] = (\[[\s\S]*?\n\];)/);
if (!templatesMatch) {
  console.error("Could not find defaultBankTemplates");
  process.exit(1);
}

// Convertir le bloc TS en JS évaluable
let jsBlock = templatesMatch[1].replace(/\];$/, ']');
// Remplacer elSalamPositions
jsBlock = jsBlock.replace(/elSalamPositions/g, JSON.stringify(elSalam));

const templates = eval(jsBlock);
console.log(`Trouvé ${templates.length} modèles de chèques.`);

const jsonOut = JSON.stringify(templates, null, 2);

if (fs.existsSync(path.dirname(configPath))) {
  fs.writeFileSync(configPath, jsonOut, 'utf8');
  console.log(`Enregistré dans ${configPath}`);
} else {
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, jsonOut, 'utf8');
  console.log(`Créé et enregistré dans ${configPath}`);
}
