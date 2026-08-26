import express from "express";
import cors from "cors";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { apiRateLimiter } from "./middleware/rateLimit.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { patientsRouter } from "./modules/patients/patients.routes.js";
import { consultationsRouter } from "./modules/consultations/consultations.routes.js";
import { photosRouter } from "./modules/photos/photos.routes.js";
import { messagesRouter } from "./modules/messages/messages.routes.js";
import { availabilitiesRouter } from "./modules/availabilities/availabilities.routes.js";
import { lesionTypesRouter } from "./modules/lesionTypes/lesionTypes.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { agentConsultationsRouter } from "./modules/agent/agent.routes.js";

export function createApp() {
  const app = express();

  // Cloud Run est derrière un load balancer HTTPS géré par Google — la terminaison
  // TLS n'est pas gérée ici. `trust proxy` permet à req.ip / req.secure de refléter
  // le client réel plutôt que le proxy interne.
  app.set("trust proxy", 1);

  // Photo.sizeBytes est un BigInt côté Prisma (colonne SQL potentiellement > 32
  // bits) — JSON.stringify plante dessus par défaut ("Do not know how to serialize
  // a BigInt"). Sans conversion globale ici, toute route qui renvoie une photo déjà
  // confirmée (confirm, GET consultation, détail admin...) répond 500. 25 Mo max par
  // photo (voir MAX_PHOTO_SIZE_BYTES) : la conversion en Number est toujours sûre.
  app.set("json replacer", (_key: string, value: unknown) => (typeof value === "bigint" ? Number(value) : value));

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : false,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === "/api/v1/health/live" } }));

  app.use("/api/v1/health", healthRouter);

  app.use("/api/v1", apiRateLimiter);
  app.use("/api/v1/patients", patientsRouter);
  app.use("/api/v1/consultations", consultationsRouter);
  app.use("/api/v1/consultations/:consultationId/photos", photosRouter);
  app.use("/api/v1/consultations/:consultationId/messages", messagesRouter);
  app.use("/api/v1/availabilities", availabilitiesRouter);
  app.use("/api/v1/lesion-types", lesionTypesRouter);
  // Ordre important : /admin/agent-consultations doit être monté AVANT le
  // préfixe plus général /admin, sinon adminRouter (maintenant restreint au rôle
  // admin via requireAdminRole sur la plupart de ses routes) intercepterait ces
  // requêtes en premier et bloquerait les comptes agent avant même d'atteindre
  // agentConsultationsRouter.
  app.use("/api/v1/admin/agent-consultations", agentConsultationsRouter);
  app.use("/api/v1/admin", adminRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
