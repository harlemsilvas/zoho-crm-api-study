import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { ZohoCrmClient } from "./zohoClient.js";

const port = parsePort(process.env.PORT);
const config = loadConfig();
const crmClient = new ZohoCrmClient(config);
const app = createApp({ crmClient });

const server = app.listen(port, "127.0.0.1", () => {
  console.log(`API disponível em http://127.0.0.1:${port}`);
});

function parsePort(value) {
  const port = Number(value ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TypeError("PORT deve ser um número inteiro entre 1 e 65535.");
  }

  return port;
}

function shutdown(signal) {
  console.log(`${signal} recebido. Encerrando a API.`);

  server.close((error) => {
    if (error) {
      console.error(`Erro ao encerrar a API: ${error.message}`);
      process.exitCode = 1;
      return;
    }

    console.log("API encerrada.");
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
