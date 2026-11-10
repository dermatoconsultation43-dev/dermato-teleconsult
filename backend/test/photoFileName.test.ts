import { describe, expect, it } from "vitest";
import { buildPhotoFileName } from "../src/services/googleDrive.js";
import { buildReportFileName } from "../src/services/pdfReport.js";

// Pas de base de données ni de Drive ici : uniquement le nom donné aux photos, qui
// doit commencer comme le PDF du même dossier pour que les deux se retrouvent
// ensemble dans Drive (tri par nom, recherche par numéro).
describe("Nom des photos dans Drive", () => {
  it("reprend le numéro et le code patient du PDF, puis le numéro de photo", () => {
    const consultation = { refNumber: 83, nomComplet: "CAM_MMP1141", motif: "Papules au niveau du cou" };

    expect(buildPhotoFileName(consultation, 1, "image/jpeg")).toBe("000083 - CAM_MMP1141 - photo 1.jpg");
    expect(buildReportFileName(consultation)).toBe("000083 - CAM_MMP1141 - Papules au niveau du cou.pdf");
  });

  it("garde l'extension du format reçu", () => {
    expect(buildPhotoFileName({ refNumber: 7, nomComplet: "X1" }, 3, "image/png")).toBe("000007 - X1 - photo 3.png");
    expect(buildPhotoFileName({ refNumber: 7, nomComplet: "X1" }, 3, "image/heic")).toBe("000007 - X1 - photo 3.heic");
  });

  it("nettoie un code patient vide ou contenant des caractères interdits", () => {
    expect(buildPhotoFileName({ refNumber: 12, nomComplet: null }, 1, "image/jpeg")).toBe("000012 - Sans nom - photo 1.jpg");
    expect(buildPhotoFileName({ refNumber: 12, nomComplet: "  A/B:é  " }, 2, "image/jpeg")).toBe("000012 - A B e - photo 2.jpg");
  });
});
