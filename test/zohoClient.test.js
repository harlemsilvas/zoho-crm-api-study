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
