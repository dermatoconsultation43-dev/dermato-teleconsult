// Script à usage unique : crée un nouveau dossier dans le Drive déjà autorisé
// (voir authorizeDrive.mjs) et affiche son id, à coller dans .env. Utilisé pour
// provisionner le dossier "Réponses" (GOOGLE_DRIVE_RESPONSES_FOLDER_ID, voir
// services/pdfReport.ts#uploadConclusionPdfToDrive) séparé du dossier photos —
// réutilisable pour tout futur dossier Drive dédié.
import "dotenv/config";
import { google } from "googleapis";

const [, , folderName] = process.argv;
if (!folderName) {
  console.error("Usage: node scripts/createDriveFolder.mjs <NOM_DU_DOSSIER>");
  process.exit(1);
}

const requiredEnv = ["GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "GOOGLE_OAUTH_REFRESH_TOKEN"];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    console.error(`Variable manquante dans .env : ${key}`);
    process.exit(1);
  }
}

const oauth2Client = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: "v3", auth: oauth2Client });

const response = await drive.files.create({
  requestBody: { name: folderName, mimeType: "application/vnd.google-apps.folder" },
  fields: "id, webViewLink",
});

console.log(`Dossier "${folderName}" créé.`);
console.log(`id : ${response.data.id}`);
console.log(`lien : ${response.data.webViewLink}`);
