import { loadConfig } from "./config.js";
import { ZohoCrmClient } from "./zohoClient.js";

async function main() {
  const config = loadConfig();
  const client = new ZohoCrmClient(config);

  const tokenInfo = await client.refreshAccessToken();
  console.log(`Access Token renovado; validade: ${tokenInfo.expiresIn}s.`);

  const leads = await client.listLeads({ perPage: 5 });
  console.log(`Leads consultados: ${leads.info?.count ?? leads.data?.length ?? 0}.`);

  if (process.argv.includes("--create")) {
    const result = await client.createStudyLead();
    const created = result.data?.[0];

    if (created?.status !== "success") {
      throw new Error(`A criação não foi confirmada: ${created?.message ?? "resposta inesperada"}`);
    }

    console.log(`Lead fictício criado com sucesso. ID: ${created.details.id}`);
  } else {
    console.log("Modo somente leitura. Use 'npm start -- --create' para criar um Lead fictício.");
  }
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
