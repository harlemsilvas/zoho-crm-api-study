const requiredVariables = [
  "ZOHO_CLIENT_ID",
  "ZOHO_CLIENT_SECRET",
  "ZOHO_REFRESH_TOKEN",
  "ZOHO_ACCOUNTS_URL",
  "ZOHO_API_DOMAIN",
  "ZOHO_CUSTOM_SOURCE_FIELD",
];

export function loadConfig(env = process.env) {
  const missing = requiredVariables.filter((name) => !env[name]?.trim());

  if (missing.length > 0) {
    throw new Error(`Variáveis obrigatórias ausentes: ${missing.join(", ")}`);
  }

  return {
    clientId: env.ZOHO_CLIENT_ID.trim(),
    clientSecret: env.ZOHO_CLIENT_SECRET.trim(),
    refreshToken: env.ZOHO_REFRESH_TOKEN.trim(),
    accountsUrl: env.ZOHO_ACCOUNTS_URL.trim().replace(/\/$/, ""),
    apiDomain: env.ZOHO_API_DOMAIN.trim().replace(/\/$/, ""),
    customSourceField: env.ZOHO_CUSTOM_SOURCE_FIELD.trim(),
  };
}
