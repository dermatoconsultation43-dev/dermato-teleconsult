# Relais Vercel vers l'API Render

Certains opérateurs mobiles coupent les connexions vers les adresses IP de Render
(216.24.57.x) : l'application n'atteignait plus le serveur en 4G. Ce dossier est
déployé sur Vercel (Root Directory = `proxy`) et retransmet `/api/*` tel quel vers
le backend Render — aucune logique, aucune donnée stockée ici. L'application
mobile pointe sur l'adresse Vercel (voir `mobile/src/config/env.ts`).
