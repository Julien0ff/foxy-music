// En production (HTTPS obligatoire sur Vercel), utilisez l'adresse sécurisée de votre bot.
// Remplacez 'ID_SERVEUR' par votre identifiant numérique de serveur Bot-Hosting (ex: 12345)
// ou utilisez votre sous-domaine personnalisé (ex: https://api.foxymusic.lunaverse.fr) une fois configuré.
export const API_URL = import.meta.env.PROD
  ? 'https://api.foxymusic.lunaverse.fr'
  : 'http://localhost:3001';
