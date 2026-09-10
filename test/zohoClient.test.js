import assert from "node:assert/strict";
import test from "node:test";
import { ZohoCrmClient } from "../src/zohoClient.js";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
  accountsUrl: "https://accounts.zoho.com",
  apiDomain: "https://www.zohoapis.com",
  customSourceField: "Lista_de_op_es",
};

test("renova o token e lista Leads com o cabeçalho da Zoho", async () => {
  const calls = [];
  const responses = [
    new Response(
      JSON.stringify({
        access_token: "new-access-token",
        expires_in: 3600,
        api_domain: "https://www.zohoapis.com",
      }),
      { status: 200 },
    ),
    new Response(JSON.stringify({ data: [], info: { count: 0 } }), {
      status: 200,
    }),
  ];
  const fetchMock = async (url, options) => {
    calls.push({ url: String(url), options });
    return responses.shift();
  };
  const client = new ZohoCrmClient({ ...config }, fetchMock);

  await client.listLeads({ perPage: 5 });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "https://accounts.zoho.com/oauth/v2/token");
  assert.match(calls[1].url, /\/crm\/v8\/Leads\?/);
  assert.equal(
    calls[1].options.headers.get("Authorization"),
    "Zoho-oauthtoken new-access-token",
  );
});

test("cria Lead usando o API name configurado", async () => {
  const calls = [];
  const fetchMock = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(
      JSON.stringify({
        data: [{ status: "success", code: "SUCCESS", details: { id: "123" } }],
      }),
      { status: 201 },
    );
  };
  const client = new ZohoCrmClient({ ...config }, fetchMock);
  client.accessToken = "cached-token";
  client.accessTokenExpiresAt = Date.now() + 3_600_000;

  await client.createStudyLead();

  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.data[0].Lista_de_op_es, "API");
  assert.equal(body.trigger.length, 0);
});

test("atualiza Lead com confirmação explícita", async () => {
  const calls = [];

  const fetchMock = async (url, options) => {
    calls.push({
      url: String(url),
      options,
    });

    return new Response(
      JSON.stringify({
        data: [
          {
            status: "success",
            code: "SUCCESS",
            message: "record updated",
            details: {
              id: "7603449000000701003",
            },
          },
        ],
      }),
      { status: 200 },
    );
  };

  const client = new ZohoCrmClient({ ...config }, fetchMock);
  client.accessToken = "cached-token";
  client.accessTokenExpiresAt = Date.now() + 3_600_000;

  const result = await client.updateLead(
    "7603449000000701003",
    {
      Description: "Lead atualizado pelo teste automatizado",
      [config.customSourceField]: "API",
    },
    {
      confirm: true,
    },
  );

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    "https://www.zohoapis.com/crm/v8/Leads/7603449000000701003",
  );
  assert.equal(calls[0].options.method, "PUT");
  assert.equal(
    calls[0].options.headers.get("Authorization"),
    "Zoho-oauthtoken cached-token",
  );

  const body = JSON.parse(calls[0].options.body);

  assert.equal(
    body.data[0].Description,
    "Lead atualizado pelo teste automatizado",
  );
  assert.equal(body.data[0].Lista_de_op_es, "API");
  assert.deepEqual(body.trigger, []);
  assert.equal(result.data[0].status, "success");
});

test("bloqueia atualização sem confirmação explícita", async () => {
  let fetchCalled = false;

  const fetchMock = async () => {
    fetchCalled = true;
    throw new Error("O fetch não deveria ser executado.");
  };

  const client = new ZohoCrmClient({ ...config }, fetchMock);

  await assert.rejects(
    () =>
      client.updateLead("7603449000000701003", {
        Description: "Tentativa sem confirmação",
      }),
    /Atualização bloqueada/,
  );

  assert.equal(fetchCalled, false);
});

test("rejeita atualização com ID inválido", async () => {
  const client = new ZohoCrmClient({ ...config }, async () => {
    throw new Error("O fetch não deveria ser executado.");
  });

  await assert.rejects(
    () =>
      client.updateLead(
        "id-invalido",
        {
          Description: "Teste",
        },
        {
          confirm: true,
        },
      ),
    /ID do Lead deve conter somente números/,
  );
});

test("rejeita atualização sem campos", async () => {
  const client = new ZohoCrmClient({ ...config }, async () => {
    throw new Error("O fetch não deveria ser executado.");
  });

  await assert.rejects(
    () =>
      client.updateLead(
        "7603449000000701003",
        {},
        {
          confirm: true,
        },
      ),
    /Informe pelo menos um campo para atualizar/,
  );
});
