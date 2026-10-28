import rateLimit from "express-rate-limit";
import { env } from "../config/env.js";

// Limite en mémoire, par instance Cloud Run. Utile contre un client isolé qui
// s'emballe, mais N'EST PAS une protection fiable contre un abus distribué une fois
// que le service tourne sur plusieurs instances (chacune a son propre compteur) —
// voir la note "Arbitrage technique" de la Phase 1. Cloud Armor en périmètre et,
// si le volume le justifie, un compteur partagé (Memorystore) sont les évolutions.
const AGENT_SYNC_PATH_PREFIX = "/admin/agent-consultations";

export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Trop de requêtes, réessayez dans quelques instants." } },
  // Compté à part par agentSyncRateLimiter : sans ça, la synchro du soir d'un
  // agent terrain épuisait le compteur partagé (tout le trafic arrive via le relais
  // Vercel, donc souvent depuis la même IP) et bloquait patients et médecins.
  skip: (req) => req.path.startsWith(AGENT_SYNC_PATH_PREFIX),
});

// Routes réservées aux comptes agent/admin authentifiés (voir agent.routes.ts) :
// un quota bien plus large reste raisonnable, et permet de rejouer d'un coup une
// journée entière de dossiers saisis hors ligne.
export const agentSyncRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MINUTES * 60 * 1000,
  max: env.AGENT_SYNC_RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "rate_limited", message: "Trop de requêtes, réessayez dans quelques instants." } },
});
