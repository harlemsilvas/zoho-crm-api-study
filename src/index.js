import { loadConfig } from "./config.js";
import { ZohoCrmClient } from "./zohoClient.js";

function getArgumentValue(argumentName) {
  const prefix = `${argumentName}=`;
  const argument = process.argv.find((item) => item.startsWith(prefix));

  return argument?.slice(prefix.length);
}

async function main() {
  const wantsCreate = process.argv.includes("--create");
  const wantsUpdate = process.argv.includes("--update");
  const confirmsUpdate = process.argv.includes("--confirm-update");
  const leadId = getArgumentValue("--id");

  if (wantsCreate && wantsUpdate) {
    throw new Error("Use somente uma operação por vez: --create ou --update.");
  }

  if (wantsUpdate && !confirmsUpdate) {
    throw new Error(
      "Atualização bloqueada. Use --confirm-update para confirmar.",
    );
  }

  if (wantsUpdate && !leadId) {
    throw new Error("Informe o ID usando --id=ID_DO_LEAD.");
  }

  const config = loadConfig();
  const client = new ZohoCrmClient(config);

  const tokenInfo = await client.refreshAccessToken();

  console.log(`Access Token renovado; validade: ${tokenInfo.expiresIn}s.`);

  const leads = await client.listLeads({ perPage: 5 });

  console.log(
    `Leads consultados: ${leads.info?.count ?? leads.data?.length ?? 0}.`,
  );

  if (wantsCreate) {
    const result = await client.createStudyLead();
    const created = result.data?.[0];

    if (created?.status !== "success") {
      throw new Error(
        `A criação não foi confirmada: ${
          created?.message ?? "resposta inesperada"
        }`,
      );
    }

    console.log(`Lead fictício criado com sucesso. ID: ${created.details.id}`);

    return;
  }

  if (wantsUpdate) {
    const result = await client.updateLead(
      leadId,
      {
        Description: "Lead atualizado pelo laboratório Node.js",
        [config.customSourceField]: "API",
      },
      {
        confirm: true,
      },
    );

    const updated = result.data?.[0];

    if (updated?.status !== "success") {
      throw new Error(
        `A atualização não foi confirmada: ${
          updated?.message ?? "resposta inesperada"
        }`,
      );
    }

    console.log(`Lead atualizado com sucesso. ID: ${updated.details.id}`);

    return;
  }

  console.log(
    "Modo somente leitura. Use '--create' ou '--update' com confirmação explícita.",
  );
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
