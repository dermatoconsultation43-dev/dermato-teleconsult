// Script à usage unique : range les photos déjà envoyées avant le nouveau nommage
// (voir services/googleDrive.ts#buildPhotoFileName). Les anciennes photos sont
// nommées "<id consultation>_<id photo>.jpg" et posées à côté des PDF ; elles sont
// renommées "000083 - CAM_MMP1141 - photo 1.jpg" et déplacées dans le sous-dossier
// "Photos". Un fichier Drive garde son id quand on le renomme ou le déplace : l'écran
// admin et la génération des PDF, qui relisent les photos par id, continuent de marcher.
//
// Le numéro de dossier et le code patient viennent de l'API admin de production
// (la base de production n'est pas joignable depuis un poste local).
//
// Usage (depuis backend/, avec le .env qui contient les accès Drive) :
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... FIREBASE_WEB_API_KEY=... node scripts/organizeDrivePhotos.mjs
//   ... node scripts/organizeDrivePhotos.mjs --apply   (applique vraiment les changements)
// Sans --apply, rien n'est modifié : le script affiche seulement ce qu'il ferait.
import "dotenv/config";
import { google } from "googleapis";

const APPLY = process.argv.includes("--apply");
const API_BASE = process.env.API_BASE_URL ?? "https://dermato-teleconsult.onrender.com/api/v1";
const PARENT_ID = process.env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID;
const SUBFOLDER_NAME = "Photos";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";
const EXTENSIONS = { "image/jpeg": "jpg", "image/png": "png", "image/heic": "heic", "image/webp": "webp" };
const OLD_NAME = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_[0-9a-f-]{36}\.[a-z]+$/i;

for (const name of ["ADMIN_EMAIL", "ADMIN_PASSWORD", "FIREBASE_WEB_API_KEY", "GOOGLE_DRIVE_PHOTOS_FOLDER_ID"]) {
  if (!process.env[name]) {
    console.error(`Variable manquante : ${name}`);
    process.exit(1);
  }
}

// Même règle que services/googleDrive.ts#sanitizeFileNamePart.
function sanitize(text, maxLength) {
  const cleaned = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}…` : cleaned;
}

function photoFileName(consultation, photoNumber, mimeType) {
  const ref = String(consultation.refNumber).padStart(6, "0");
  const nom = sanitize(consultation.nomComplet?.trim() || "Sans nom", 40);
  return `${ref} - ${nom} - photo ${photoNumber}.${EXTENSIONS[mimeType] ?? "bin"}`;
}

async function adminToken() {
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.FIREBASE_WEB_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, returnSecureToken: true }),
    },
  );
  const body = await response.json();
  if (!body.idToken) throw new Error(`Connexion admin refusée : ${body.error?.message ?? response.status}`);
  return body.idToken;
}

async function fetchAllConsultations(token) {
  const byId = new Map();
  let cursor;
  for (;;) {
    const url = new URL(`${API_BASE}/admin/consultations`);
    url.searchParams.set("limit", "100");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Liste des dossiers refusée : HTTP ${response.status}`);
    const { items } = await response.json();
    for (const item of items) byId.set(item.id, { refNumber: item.refNumber, nomComplet: item.nomComplet });
    if (items.length < 100) return byId;
    cursor = items[items.length - 1].id;
  }
}

async function listFiles(drive, q) {
  const files = [];
  let pageToken;
  do {
    const { data } = await drive.files.list({
      q,
      fields: "nextPageToken, files(id, name, mimeType, createdTime)",
      pageSize: 1000,
      pageToken,
    });
    files.push(...(data.files ?? []));
    pageToken = data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

async function findOrCreateSubfolder(drive) {
  const [existing] = await listFiles(
    drive,
    `name = '${SUBFOLDER_NAME}' and mimeType = '${FOLDER_MIME_TYPE}' and '${PARENT_ID}' in parents and trashed = false`,
  );
  if (existing) return existing.id;
  if (!APPLY) return "(sera créé)";
  const { data } = await drive.files.create({
    requestBody: { name: SUBFOLDER_NAME, mimeType: FOLDER_MIME_TYPE, parents: [PARENT_ID] },
    fields: "id",
  });
  return data.id;
}

const auth = new google.auth.OAuth2(process.env.GOOGLE_OAUTH_CLIENT_ID, process.env.GOOGLE_OAUTH_CLIENT_SECRET);
auth.setCredentials({ refresh_token: process.env.GOOGLE_OAUTH_REFRESH_TOKEN });
const drive = google.drive({ version: "v3", auth });

const consultations = await fetchAllConsultations(await adminToken());
const images = await listFiles(drive, `'${PARENT_ID}' in parents and trashed = false and mimeType contains 'image/'`);
console.log(`${consultations.size} dossiers en production, ${images.length} images à côté des PDF.\n`);

// Numérotées par ordre d'envoi, dossier par dossier.
const byConsultation = new Map();
const skipped = [];
for (const file of images) {
  const match = OLD_NAME.exec(file.name);
  const consultation = match && consultations.get(match[1]);
  if (!consultation) {
    skipped.push(`${file.name} (${match ? "dossier introuvable ou supprimé" : "nom non reconnu"})`);
    continue;
  }
  if (!byConsultation.has(match[1])) byConsultation.set(match[1], { consultation, files: [] });
  byConsultation.get(match[1]).files.push(file);
}

const plan = [];
for (const { consultation, files } of byConsultation.values()) {
  files.sort((a, b) => a.createdTime.localeCompare(b.createdTime));
  files.forEach((file, index) => plan.push({ file, newName: photoFileName(consultation, index + 1, file.mimeType) }));
}
plan.sort((a, b) => a.newName.localeCompare(b.newName));

const subfolderId = await findOrCreateSubfolder(drive);
for (const { file, newName } of plan) console.log(`${file.name}  ->  ${SUBFOLDER_NAME}/${newName}`);
if (skipped.length) console.log(`\nLaissées en place (${skipped.length}) :\n  ${skipped.join("\n  ")}`);

if (!APPLY) {
  console.log(`\nEssai à blanc : ${plan.length} images seraient renommées et déplacées. Rien n'a été modifié.`);
  console.log("Relancez avec --apply pour appliquer.");
  process.exit(0);
}

let done = 0;
for (const { file, newName } of plan) {
  await drive.files.update({
    fileId: file.id,
    addParents: subfolderId,
    removeParents: PARENT_ID,
    requestBody: { name: newName },
    fields: "id",
  });
  done += 1;
}
console.log(`\n${done} images renommées et déplacées dans ${SUBFOLDER_NAME}.`);
