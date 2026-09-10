import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config.js";

const validEnv = {
  ZOHO_CLIENT_ID: "client-id",
  ZOHO_CLIENT_SECRET: "client-secret",
  ZOHO_REFRESH_TOKEN: "refresh-token",
  ZOHO_ACCOUNTS_URL: "https://accounts.zoho.com/",
  ZOHO_API_DOMAIN: "https://www.zohoapis.com/",
  ZOHO_CUSTOM_SOURCE_FIELD: "Lista_de_op_es",
};

test("carrega e normaliza a configuração", () => {
  const config = loadConfig(validEnv);

  assert.equal(config.accountsUrl, "https://accounts.zoho.com");
  assert.equal(config.apiDomain, "https://www.zohoapis.com");
  assert.equal(config.customSourceField, "Lista_de_op_es");
});

test("informa as variáveis ausentes sem mostrar segredos", () => {
  assert.throws(
    () => loadConfig({}),
    /ZOHO_CLIENT_ID.*ZOHO_CLIENT_SECRET.*ZOHO_REFRESH_TOKEN/,
  );
});
