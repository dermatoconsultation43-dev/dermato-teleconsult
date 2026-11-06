import { describe, expect, it, vi } from "vitest";
import ExcelJS from "exceljs";
import { Prisma } from "@prisma/client";

// Pas de base de données ici : on vérifie uniquement la mise en forme du fichier
// (en-têtes, libellés français, vrais nombres/dates Excel) à partir d'un dossier
// fictif, sans dépendre du Postgres de test.
const findMany = vi.fn();
vi.mock("../src/db/client.js", () => ({ prisma: { consultation: { findMany } } }));

const { buildConsultationsWorkbook } = await import("../src/services/excelExport.js");

function fakeConsultation(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    refNumber: 42,
    status: "pending",
    submittedAt: new Date("2026-10-20T10:30:00Z"),
    createdAt: new Date("2026-10-20T09:00:00Z"),
    nomComplet: "Awa Diallo",
    sexe: "F",
    statutMatrimonial: "marie",
    age: 34,
    dateNaissance: null,
    ville: "Kaolack",
    profession: "Commerçante",
    telephoneContact: "+221770000000",
    emailContact: null,
    confirmationWhatsapp: true,
    poidsKg: new Prisma.Decimal("62.5"),
    tailleCm: null,
    temperatureC: new Prisma.Decimal("37.2"),
    motif: "Taches sur les bras",
    conseilCosmetiqueDemande: false,
    conseilCosmetiquePrecision: null,
    dureeValeur: 3,
    dureeUnite: "semaines",
    localisationPremieresLesions: null,
    demangeaison: "nuit",
    lesionZones: ["bras_gauche", "bras_droit"],
    autresLesions: false,
    autresLesionsAspect: null,
    autresLesionsLocalisation: null,
    zonesSensiblesAtteintes: null,
    zonesSensiblesPrecision: null,
    entourageStatus: "ne_sait_pas",
    entouragePrecision: null,
    produitsUtilises: true,
    produitsPrecision: "Crème éclaircissante",
    antecedentsMedicaux: false,
    antecedentsPrecision: null,
    notesComplementaires: null,
    photosQualiteConfirmee: true,
    conclusionMedicale: "Dermatite de contact probable.",
    conclusionSavedAt: new Date("2026-10-21T08:00:00Z"),
    conclusionDriveFileId: "drive-conclusion-id",
    patient: { prenom: "", nom: "", telephone: null, email: null, createdByAdmin: { prenom: "Agent", nom: "Un" } },
    lesionTypes: [
      { precision: null, lesionType: { labelFr: "Taches" } },
      { precision: "croûtes", lesionType: { labelFr: "Autre" } },
    ],
    availabilities: [{ availability: { label: "Lundi 19h30–20h30" }, autrePrecision: null }],
    photos: [{ driveFileId: "photo-a" }, { driveFileId: "photo-b" }],
    consent: { consentedAt: new Date("2026-10-20T10:00:00Z"), consentTextVersion: "v1" },
    appointment: null,
    ...overrides,
  };
}

async function readBack(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const sheet = workbook.getWorksheet("Dossiers")!;
  const headers = (sheet.getRow(1).values as unknown[]).slice(1) as string[];
  const row = sheet.getRow(2);
  const cell = (header: string) => row.getCell(headers.indexOf(header) + 1).value;
  return { sheet, headers, cell };
}

describe("Export Excel des dossiers", () => {
  it("exclut brouillons et dossiers supprimés de la requête", async () => {
    findMany.mockResolvedValueOnce([]);
    await buildConsultationsWorkbook();
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { deletedAt: null, status: { not: "draft" } } }),
    );
  });

  it("écrit une ligne par dossier avec libellés français, nombres et dates exploitables", async () => {
    findMany.mockResolvedValueOnce([fakeConsultation()]);
    const { sheet, cell } = await readBack(await buildConsultationsWorkbook());

    expect(sheet.rowCount).toBe(2);
    expect(cell("N° dossier")).toBe(42);
    expect(cell("Statut")).toBe("En attente");
    expect(cell("Saisi par")).toBe("Agent : Agent Un");
    expect(cell("Statut matrimonial")).toBe("Marié(e)");
    expect(cell("Poids (kg)")).toBe(62.5);
    expect(cell("Démangeaisons")).toBe("La nuit");
    expect(cell("Cas similaires entourage")).toBe("Ne sait pas");
    expect(cell("Aspect des lésions")).toBe("Taches, Autre (croûtes)");
    expect(cell("Zones du corps touchées")).toBe("Bras gauche (avant), Bras droit (avant)");
    expect(cell("Nombre de photos")).toBe(2);
    expect(cell("Conclusion médicale")).toBe("Dermatite de contact probable.");
    expect(cell("PDF conclusion")).toBe("https://drive.google.com/file/d/drive-conclusion-id/view");
    expect(cell("Soumis le")).toBeInstanceOf(Date);
  });

  it("indique un dossier saisi par le patient lui-même", async () => {
    findMany.mockResolvedValueOnce([
      fakeConsultation({
        nomComplet: null,
        patient: { prenom: "Moussa", nom: "Ba", telephone: "+221771111111", email: "m@ex.com", createdByAdmin: null },
        telephoneContact: null,
      }),
    ]);
    const { cell } = await readBack(await buildConsultationsWorkbook());
    expect(cell("Saisi par")).toBe("Patient (appli)");
    expect(cell("Code du patient")).toBe("Moussa Ba");
    expect(cell("Téléphone")).toBe("+221771111111");
  });
});
