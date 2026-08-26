import PDFDocument from "pdfkit";
import { drive } from "./googleAuth.js";
import { env } from "../config/env.js";
import type { Prisma } from "@prisma/client";

// Le dossier Drive ne contenait jusqu'ici que des photos brutes nommées par id
// technique (consultationId_photoId.jpg) — illisible pour un dermatologue qui
// parcourt le dossier à la main (voir demande explicite). Ce PDF regroupe tout
// ce que le patient/agent a saisi, dans l'ordre du questionnaire, avec les
// photos intégrées, sous un nom de fichier lisible — voir buildReportFileName.
// Embarqué directement dans le même dossier Drive que les photos (pas de
// nouveau dossier à créer) : le filtre "Type > PDF" dans l'UI Drive suffit à
// isoler ces rapports du reste.

const SEXE_LABELS: Record<string, string> = { M: "Masculin", F: "Féminin" };
const STATUT_LABELS: Record<string, string> = {
  celibataire: "Célibataire",
  marie: "Marié(e)",
  vie_en_couple: "Vie en couple",
  veuf_veuve: "Veuf/Veuve",
  autre: "Autre",
};
const DEMANGEAISON_LABELS: Record<string, string> = {
  oui: "Oui",
  non: "Non",
  parfois: "Parfois",
  nuit: "Principalement le soir ou la nuit",
};
const ENTOURAGE_LABELS: Record<string, string> = { oui: "Oui", non: "Non", ne_sait_pas: "Je ne sais pas" };
const DUREE_UNITE_LABELS: Record<string, string> = { jours: "jour(s)", semaines: "semaine(s)", mois: "mois", annees: "année(s)" };
const PHOTO_SLOT_LABELS: Record<string, string> = {
  vue_generale: "Vue générale",
  vue_rapprochee: "Vue rapprochée",
  complementaire: "Photo complémentaire",
};
const BODY_ZONE_LABELS: Record<string, string> = {
  tete: "Tête / visage",
  cou: "Cou",
  torse: "Torse (avant)",
  dos: "Dos",
  bras_droit: "Bras droit",
  bras_gauche: "Bras gauche",
  main_droite: "Main droite",
  main_gauche: "Main gauche",
  jambe_droite: "Jambe droite",
  jambe_gauche: "Jambe gauche",
  pied_droit: "Pied droit",
  pied_gauche: "Pied gauche",
};

// pdfkit n'intègre nativement que JPEG/PNG — HEIC/WEBP (autorisés à l'envoi,
// voir googleDrive.ts#ALLOWED_PHOTO_MIME_TYPES) sont listés dans le PDF avec un
// lien Drive plutôt qu'omis silencieusement, plutôt que d'ajouter une
// dépendance de conversion d'image lourde pour un cas marginal.
const EMBEDDABLE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

function oui(value: boolean | null | undefined): string {
  return value === true ? "Oui" : value === false ? "Non" : "—";
}

function val(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === "" ? "—" : String(value);
}

// Filtre les caractères interdits/gênants dans un nom de fichier (Drive comme
// Windows) et plafonne la longueur — un motif de consultation est un champ
// libre, potentiellement long ou farci de ponctuation.
function sanitizeFileNamePart(text: string, maxLength: number): string {
  const cleaned = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[/\\:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > maxLength ? `${cleaned.slice(0, maxLength).trim()}…` : cleaned;
}

export function buildReportFileName(consultation: { refNumber: number; nomComplet: string | null; motif: string | null }): string {
  const ref = String(consultation.refNumber).padStart(6, "0");
  const nom = sanitizeFileNamePart(consultation.nomComplet?.trim() || "Sans nom", 40);
  const motif = consultation.motif?.trim() ? sanitizeFileNamePart(consultation.motif, 50) : null;
  return motif ? `${ref} - ${nom} - ${motif}.pdf` : `${ref} - ${nom}.pdf`;
}

async function fetchPhotoBuffer(fileId: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const { stream, mimeType } = await streamPhotoFromDriveForPdf(fileId);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return { buffer: Buffer.concat(chunks), mimeType };
}

// Duplique volontairement drive.files.get plutôt que de réutiliser
// streamPhotoFromDrive (googleDrive.ts) : cette dernière est déjà exportée pour
// la route de visualisation admin, aucune raison de la faire dépendre en plus
// de la génération de PDF.
async function streamPhotoFromDriveForPdf(fileId: string) {
  const meta = await drive.files.get({ fileId, fields: "mimeType" });
  const content = await drive.files.get({ fileId, alt: "media" }, { responseType: "stream" });
  return { stream: content.data as unknown as NodeJS.ReadableStream, mimeType: meta.data.mimeType ?? "application/octet-stream" };
}

type ConsultationForPdf = Prisma.ConsultationGetPayload<{
  include: {
    lesionTypes: { include: { lesionType: true } };
    availabilities: { include: { availability: true } };
    photos: true;
    consent: true;
  };
}>;

export async function generateConsultationReportPdf(
  consultation: ConsultationForPdf,
  patientFallback: { telephone: string; email: string | null } | null,
): Promise<Buffer> {
  const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const ref = String(consultation.refNumber).padStart(6, "0");

  doc.fontSize(18).fillColor("#0A5148").text("DermaConsult — Dossier de consultation", { align: "left" });
  doc.moveDown(0.2);
  doc.fontSize(11).fillColor("#55655D").text(`Dossier n°${ref} — ${consultation.status}`);
  if (consultation.submittedAt) {
    doc.text(`Soumis le ${new Date(consultation.submittedAt).toLocaleString("fr-FR")}`);
  }
  doc.moveDown();
  doc.strokeColor("#DCE3DE").moveTo(40, doc.y).lineTo(555, doc.y).stroke();
  doc.moveDown();

  function section(title: string) {
    doc.moveDown(0.5);
    doc.fontSize(13).fillColor("#0A5148").text(title);
    doc.moveDown(0.2);
    doc.fontSize(10).fillColor("#16211D");
  }

  function row(label: string, value: string) {
    doc.font("Helvetica-Bold").text(`${label} : `, { continued: true }).font("Helvetica").text(value);
  }

  section("Informations personnelles");
  row("Nom complet", val(consultation.nomComplet));
  row("Sexe", consultation.sexe ? (SEXE_LABELS[consultation.sexe] ?? consultation.sexe) : "—");
  row("Statut matrimonial", consultation.statutMatrimonial ? (STATUT_LABELS[consultation.statutMatrimonial] ?? consultation.statutMatrimonial) : "—");
  row("Âge", val(consultation.age));
  row("Date de naissance", consultation.dateNaissance ? consultation.dateNaissance.toLocaleDateString("fr-FR") : "—");
  row("Ville", val(consultation.ville));
  row("Profession", val(consultation.profession));
  row("Téléphone", val(consultation.telephoneContact ?? patientFallback?.telephone));
  row("Email", val(consultation.emailContact ?? patientFallback?.email));
  row("Confirmation par WhatsApp", oui(consultation.confirmationWhatsapp));
  if (consultation.poidsKg) row("Poids", `${consultation.poidsKg} kg`);
  if (consultation.tailleCm) row("Taille", `${consultation.tailleCm} cm`);
  if (consultation.temperatureC) row("Température", `${consultation.temperatureC} °C`);

  section("Motif de consultation");
  row("Plainte", val(consultation.motif));
  row("Conseil cosmétique demandé", oui(consultation.conseilCosmetiqueDemande));
  if (consultation.conseilCosmetiquePrecision) row("Précision conseil cosmétique", consultation.conseilCosmetiquePrecision);

  section("Histoire du problème");
  row(
    "Depuis",
    consultation.dureeValeur && consultation.dureeUnite
      ? `${consultation.dureeValeur} ${DUREE_UNITE_LABELS[consultation.dureeUnite] ?? consultation.dureeUnite}`
      : "—",
  );
  row("Localisation des premières lésions", val(consultation.localisationPremieresLesions));
  row("Démangeaisons", consultation.demangeaison ? (DEMANGEAISON_LABELS[consultation.demangeaison] ?? consultation.demangeaison) : "—");

  section("Aspect des lésions");
  const aspects = consultation.lesionTypes.map((l) => l.lesionType.labelFr + (l.precision ? ` (${l.precision})` : "")).join(", ");
  row("Aspects sélectionnés", aspects || "—");
  const zones = consultation.lesionZones.map((z) => BODY_ZONE_LABELS[z] ?? z).join(", ");
  row("Zones du corps touchées", zones || "—");

  section("Autres lésions et zones sensibles");
  row("Autres lésions ailleurs", oui(consultation.autresLesions));
  if (consultation.autresLesionsAspect) row("Aspect des autres lésions", consultation.autresLesionsAspect);
  row("Zones sensibles atteintes", oui(consultation.zonesSensiblesAtteintes));
  if (consultation.zonesSensiblesPrecision) row("Précision zones sensibles", consultation.zonesSensiblesPrecision);

  section("Entourage");
  row(
    "Cas similaires dans l'entourage",
    consultation.entourageStatus ? (ENTOURAGE_LABELS[consultation.entourageStatus] ?? consultation.entourageStatus) : "—",
  );
  if (consultation.entouragePrecision) row("Précision", consultation.entouragePrecision);

  section("Produits et traitements utilisés");
  row("Produits utilisés", oui(consultation.produitsUtilises));
  if (consultation.produitsPrecision) row("Précision", consultation.produitsPrecision);

  section("Antécédents médicaux");
  row("Maladie chronique / traitement suivi", oui(consultation.antecedentsMedicaux));
  if (consultation.antecedentsPrecision) row("Précision", consultation.antecedentsPrecision);
  if (consultation.notesComplementaires) row("Notes complémentaires", consultation.notesComplementaires);

  section("Disponibilités sélectionnées");
  if (consultation.availabilities.length === 0) {
    doc.text("Aucune disponibilité sélectionnée.");
  } else {
    for (const a of consultation.availabilities) {
      doc.text(`• ${a.availability?.label ?? a.autrePrecision ?? "—"}`);
    }
  }

  section("Consentement");
  row("Version du texte de consentement", val(consultation.consent?.consentTextVersion));
  row("Consenti le", consultation.consent ? new Date(consultation.consent.consentedAt).toLocaleString("fr-FR") : "—");

  // Photos : chacune sur sa propre zone, avec un saut de page si elle ne
  // rentre pas sur la page courante — évite qu'une image soit coupée en deux.
  const activePhotos = consultation.photos.filter((p) => p.status === "uploaded");
  if (activePhotos.length > 0) {
    doc.addPage();
    doc.fontSize(13).fillColor("#0A5148").text("Photos");
    doc.moveDown(0.5);

    for (const photo of activePhotos) {
      const label = PHOTO_SLOT_LABELS[photo.slot] ?? photo.slot;
      if (doc.y > 620) doc.addPage();
      doc.fontSize(11).fillColor("#16211D").font("Helvetica-Bold").text(label);
      doc.moveDown(0.2);

      try {
        if (EMBEDDABLE_MIME_TYPES.has(photo.mimeType)) {
          const { buffer } = await fetchPhotoBuffer(photo.driveFileId);
          const remainingHeight = 780 - doc.y;
          const imgHeight = Math.min(320, remainingHeight);
          if (imgHeight < 120) doc.addPage();
          doc.image(buffer, { fit: [480, Math.min(320, 780 - doc.y)] as [number, number] });
          doc.moveDown(0.5);
        } else {
          doc.fontSize(9).font("Helvetica").fillColor("#55655D").text(
            `Format ${photo.mimeType} non prévisualisable ici — voir sur Drive : https://drive.google.com/file/d/${photo.driveFileId}/view`,
          );
          doc.moveDown(0.5);
        }
      } catch {
        doc.fontSize(9).font("Helvetica").fillColor("#A83A3A").text("Impossible de charger cette photo depuis Drive.");
        doc.moveDown(0.5);
      }
    }
  }

  doc.end();
  return done;
}

export async function uploadReportPdfToDrive(buffer: Buffer, fileName: string): Promise<{ fileId: string }> {
  const { Readable } = await import("node:stream");
  const response = await drive.files.create({
    requestBody: { name: fileName, parents: [env.GOOGLE_DRIVE_PHOTOS_FOLDER_ID] },
    media: { mimeType: "application/pdf", body: Readable.from(buffer) },
    fields: "id",
  });
  if (!response.data.id) {
    throw new Error("Google Drive n'a pas renvoyé d'id de fichier après l'envoi du rapport PDF.");
  }
  return { fileId: response.data.id };
}
