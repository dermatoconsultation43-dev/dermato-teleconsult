import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { ConsultationStatus, type Prisma } from "@prisma/client";
import { prisma } from "../db/client.js";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";
import { drive } from "./googleAuth.js";
import { driveViewLink } from "./googleDrive.js";
import { BODY_ZONE_LABELS } from "./pdfReport.js";

// Export Excel de tous les dossiers soumis, pour l'analyse des données recueillies
// — en plus (jamais à la place) des PDF par dossier (voir services/pdfReport.ts).
// Contrairement à services/googleSheets.ts (une ligne ajoutée à la soumission, jamais
// mise à jour ensuite hormis le statut), le fichier est entièrement reconstruit
// depuis Postgres à chaque fois : corrections admin, conclusions et changements de
// statut y figurent toujours. Un seul fichier, remplacé en place dans Drive (même
// id, donc même lien partagé) plutôt qu'une nouvelle copie à chaque mise à jour.

const EXPORT_FILE_NAME = "Export_dossiers_dermato.xlsx";
const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Regroupe les changements rapprochés en une seule régénération : au retour d'une
// tournée terrain, 150 dossiers arrivent en quelques minutes — reconstruire le
// fichier complet après chacun serait 150 fois le même travail.
const EXPORT_DELAY_MS = 2 * 60 * 1000;

const exportInclude = {
  patient: { include: { createdByAdmin: { select: { prenom: true, nom: true } } } },
  lesionTypes: { include: { lesionType: true } },
  availabilities: { include: { availability: true } },
  photos: { where: { deletedAt: null, status: "uploaded" } },
  consent: true,
  appointment: { include: { availability: true } },
} satisfies Prisma.ConsultationInclude;

type ExportConsultation = Prisma.ConsultationGetPayload<{ include: typeof exportInclude }>;

const STATUS_LABELS: Record<ConsultationStatus, string> = {
  draft: "Brouillon",
  pending: "En attente",
  confirmed: "Confirmé",
  seen: "Vu",
  completed: "Terminé",
  cancelled: "Annulé",
};

const ENUM_LABELS: Record<string, string> = {
  celibataire: "Célibataire",
  marie: "Marié(e)",
  vie_en_couple: "Vie en couple",
  veuf_veuve: "Veuf / veuve",
  autre: "Autre",
  jours: "Jours",
  semaines: "Semaines",
  mois: "Mois",
  annees: "Années",
  oui: "Oui",
  non: "Non",
  parfois: "Parfois",
  nuit: "La nuit",
  ne_sait_pas: "Ne sait pas",
};

function enumLabel(value: string | null): string | null {
  return value === null ? null : (ENUM_LABELS[value] ?? value);
}

function yesNo(value: boolean | null): string | null {
  return value === null ? null : value ? "Oui" : "Non";
}

function decimal(value: Prisma.Decimal | null): number | null {
  return value === null ? null : value.toNumber();
}

interface ExportColumn {
  header: string;
  width: number;
  value: (c: ExportConsultation) => string | number | Date | null;
  dateFormat?: string;
}

// Une colonne par question du formulaire, dans l'ordre des écrans mobiles, puis
// le suivi admin. Nombres et dates gardés comme vraies valeurs Excel (pas du texte)
// pour que filtres, tris et tableaux croisés fonctionnent directement.
const COLUMNS: ExportColumn[] = [
  { header: "N° dossier", width: 11, value: (c) => c.refNumber },
  { header: "Statut", width: 12, value: (c) => STATUS_LABELS[c.status] },
  { header: "Soumis le", width: 17, value: (c) => c.submittedAt, dateFormat: "dd/mm/yyyy hh:mm" },
  { header: "Créé le", width: 17, value: (c) => c.createdAt, dateFormat: "dd/mm/yyyy hh:mm" },
  {
    header: "Saisi par",
    width: 20,
    value: (c) =>
      c.patient.createdByAdmin
        ? `Agent : ${`${c.patient.createdByAdmin.prenom} ${c.patient.createdByAdmin.nom}`.trim()}`
        : "Patient (appli)",
  },
  { header: "Nom complet", width: 24, value: (c) => c.nomComplet ?? (`${c.patient.prenom} ${c.patient.nom}`.trim() || null) },
  { header: "Sexe", width: 6, value: (c) => c.sexe },
  { header: "Statut matrimonial", width: 16, value: (c) => enumLabel(c.statutMatrimonial) },
  { header: "Âge", width: 6, value: (c) => c.age },
  { header: "Date de naissance", width: 13, value: (c) => c.dateNaissance, dateFormat: "dd/mm/yyyy" },
  { header: "Ville", width: 16, value: (c) => c.ville },
  { header: "Profession", width: 18, value: (c) => c.profession },
  { header: "Téléphone", width: 15, value: (c) => c.telephoneContact ?? c.patient.telephone },
  { header: "Email", width: 24, value: (c) => c.emailContact ?? c.patient.email },
  { header: "Confirmation WhatsApp", width: 12, value: (c) => yesNo(c.confirmationWhatsapp) },
  { header: "Poids (kg)", width: 9, value: (c) => decimal(c.poidsKg) },
  { header: "Taille (cm)", width: 9, value: (c) => decimal(c.tailleCm) },
  { header: "Température (°C)", width: 10, value: (c) => decimal(c.temperatureC) },
  { header: "Motif de consultation", width: 40, value: (c) => c.motif },
  { header: "Conseil cosmétique demandé", width: 12, value: (c) => yesNo(c.conseilCosmetiqueDemande) },
  { header: "Précision conseil cosmétique", width: 30, value: (c) => c.conseilCosmetiquePrecision },
  { header: "Durée", width: 7, value: (c) => c.dureeValeur },
  { header: "Unité de durée", width: 10, value: (c) => enumLabel(c.dureeUnite) },
  { header: "Localisation premières lésions", width: 30, value: (c) => c.localisationPremieresLesions },
  { header: "Démangeaisons", width: 12, value: (c) => enumLabel(c.demangeaison) },
  {
    header: "Zones du corps touchées",
    width: 35,
    value: (c) => c.lesionZones.map((z) => BODY_ZONE_LABELS[z] ?? z).join(", ") || null,
  },
  { header: "Autres localisations", width: 30, value: (c) => c.autresLesionsLocalisation },
  {
    header: "Aspect des lésions",
    width: 35,
    value: (c) =>
      c.lesionTypes
        .map((l) => (l.precision ? `${l.lesionType.labelFr} (${l.precision})` : l.lesionType.labelFr))
        .join(", ") || null,
  },
  { header: "Autres lésions", width: 9, value: (c) => yesNo(c.autresLesions) },
  { header: "Aspect autres lésions", width: 30, value: (c) => c.autresLesionsAspect },
  { header: "Zones sensibles atteintes", width: 11, value: (c) => yesNo(c.zonesSensiblesAtteintes) },
  { header: "Précision zones sensibles", width: 30, value: (c) => c.zonesSensiblesPrecision },
  { header: "Cas similaires entourage", width: 12, value: (c) => enumLabel(c.entourageStatus) },
  { header: "Précision entourage", width: 30, value: (c) => c.entouragePrecision },
  { header: "Produits utilisés", width: 9, value: (c) => yesNo(c.produitsUtilises) },
  { header: "Précision produits", width: 30, value: (c) => c.produitsPrecision },
  { header: "Antécédents médicaux", width: 11, value: (c) => yesNo(c.antecedentsMedicaux) },
  { header: "Précision antécédents", width: 30, value: (c) => c.antecedentsPrecision },
  { header: "Notes complémentaires", width: 40, value: (c) => c.notesComplementaires },
  { header: "Qualité photos confirmée", width: 11, value: (c) => yesNo(c.photosQualiteConfirmee) },
  { header: "Nombre de photos", width: 9, value: (c) => c.photos.length },
  { header: "Liens photos", width: 50, value: (c) => c.photos.map((p) => driveViewLink(p.driveFileId)).join("\n") || null },
  {
    header: "Disponibilités",
    width: 30,
    value: (c) => c.availabilities.map((a) => a.availability?.label ?? a.autrePrecision ?? "").join(", ") || null,
  },
  { header: "Consentement le", width: 17, value: (c) => c.consent?.consentedAt ?? null, dateFormat: "dd/mm/yyyy hh:mm" },
  { header: "Version consentement", width: 11, value: (c) => c.consent?.consentTextVersion ?? null },
  {
    header: "Rendez-vous",
    width: 17,
    value: (c) => c.appointment?.scheduledAt ?? null,
    dateFormat: "dd/mm/yyyy hh:mm",
  },
  { header: "Créneau rendez-vous", width: 20, value: (c) => c.appointment?.availability?.label ?? null },
  { header: "Conclusion médicale", width: 60, value: (c) => c.conclusionMedicale },
  { header: "Conclusion le", width: 17, value: (c) => c.conclusionSavedAt, dateFormat: "dd/mm/yyyy hh:mm" },
  {
    header: "PDF conclusion",
    width: 50,
    value: (c) => (c.conclusionDriveFileId ? driveViewLink(c.conclusionDriveFileId) : null),
  },
];

// Brouillons exclus (dossiers pas encore envoyés, souvent incomplets), comme les
// dossiers supprimés par un admin — seul ce qui a réellement été transmis compte
// pour l'analyse.
export async function buildConsultationsWorkbook(): Promise<Buffer> {
  const consultations = await prisma.consultation.findMany({
    where: { deletedAt: null, status: { not: ConsultationStatus.draft } },
    include: exportInclude,
    orderBy: { refNumber: "asc" },
  });

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("Dossiers", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });

  sheet.columns = COLUMNS.map((col) => ({
    header: col.header,
    width: col.width,
    style: col.dateFormat ? { numFmt: col.dateFormat } : {},
  }));
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  header.height = 32;

  for (const consultation of consultations) {
    sheet.addRow(COLUMNS.map((col) => col.value(consultation)));
  }
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

function exportFolderId(): string {
  return env.GOOGLE_DRIVE_EXPORT_FOLDER_ID ?? env.GOOGLE_DRIVE_RESPONSES_FOLDER_ID;
}

// Met à jour le fichier existant s'il est déjà dans le dossier (le lien partagé
// avec l'équipe reste valable), sinon le crée.
async function uploadWorkbookToDrive(buffer: Buffer): Promise<string> {
  const folderId = exportFolderId();
  const existing = await drive.files.list({
    q: `name = '${EXPORT_FILE_NAME}' and '${folderId}' in parents and trashed = false`,
    fields: "files(id)",
    pageSize: 1,
  });
  const existingId = existing.data.files?.[0]?.id;
  const media = { mimeType: XLSX_MIME_TYPE, body: Readable.from(buffer) };

  if (existingId) {
    await drive.files.update({ fileId: existingId, media });
    return existingId;
  }
  const created = await drive.files.create({
    requestBody: { name: EXPORT_FILE_NAME, parents: [folderId], mimeType: XLSX_MIME_TYPE },
    media,
    fields: "id",
  });
  if (!created.data.id) {
    throw new Error("Google Drive n'a pas renvoyé d'id de fichier après l'envoi de l'export Excel.");
  }
  return created.data.id;
}

export async function exportConsultationsToDrive(): Promise<void> {
  const buffer = await buildConsultationsWorkbook();
  const fileId = await uploadWorkbookToDrive(buffer);
  logger.info({ fileId, sizeBytes: buffer.length }, "Export Excel des dossiers mis à jour dans Google Drive.");
}

let pendingExport: NodeJS.Timeout | null = null;

// Appelé après chaque changement réussi (voir app.ts) et au démarrage du serveur.
// Une régénération déjà programmée n'est pas repoussée : pendant une longue synchro
// du soir, le fichier se met quand même à jour toutes les ~2 minutes au lieu
// d'attendre la fin. Jamais bloquant ni bruyant, même logique que services/sms.ts et
// googleSheets.ts : un aléa Drive ne doit jamais faire échouer l'action de
// l'utilisateur, juste retarder la mise à jour du fichier au prochain changement.
export function scheduleConsultationsExport(): void {
  if (env.NODE_ENV === "test" || pendingExport) return;
  pendingExport = setTimeout(() => {
    pendingExport = null;
    exportConsultationsToDrive().catch((error) => {
      logger.error({ err: error }, "Échec de la mise à jour de l'export Excel dans Google Drive.");
    });
  }, EXPORT_DELAY_MS);
  pendingExport.unref();
}
