// V1 minimal : pas encore de react-native-config branché (ajout natif supplémentaire,
// prévu en Phase 6 avec le reste de la configuration de build). En attendant, l'URL
// de dev pointe sur localhost pour toutes les plateformes — sur Android (émulateur ou
// vrai téléphone en USB), il faut lancer `adb reverse tcp:8080 tcp:8080` avant de
// démarrer l'app pour que "localhost" côté device atteigne le backend sur la machine
// hôte (voir mobile/README.md). Préféré à l'alias 10.0.2.2 : celui-ci ne fonctionne
// qu'avec l'émulateur AVD par défaut, pas avec un téléphone physique.
const DEV_API_URL = "http://localhost:8080/api/v1";

// Backend hébergé sur Render, mais joint via un relais Vercel (voir proxy/) :
// certains opérateurs mobiles coupent les connexions vers les IP de Render, ce
// qui rendait l'app inutilisable en 4G. Le relais retransmet /api/* tel quel.
const PROD_API_URL = "https://dermato-teleconsult-proxy.vercel.app/api/v1";

export const env = {
  apiBaseUrl: __DEV__ ? DEV_API_URL : PROD_API_URL,
  consentTextVersion: "v1.0-2026-08-17",
};
