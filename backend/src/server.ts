import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { scheduleConsultationsExport } from "./services/excelExport.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, env: env.NODE_ENV }, "API démarrée");
  // Rattrape une mise à jour de l'export Excel perdue si le serveur a redémarré
  // (déploiement, mise en veille Render) avant qu'elle ne parte.
  scheduleConsultationsExport();
});
