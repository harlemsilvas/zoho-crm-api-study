import {
  validateLeadForCreate,
  validateLeadForUpdate,
} from "./leadValidation.js";

export class ZohoApiError extends Error {
  constructor(message, { status, code, details } = {}) {
    super(message);
    this.name = "ZohoApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ZohoCrmClient {
  constructor(config, fetchImpl = globalThis.fetch) {
    if (typeof fetchImpl !== "function") {
      throw new TypeError("Uma implementação de fetch é obrigatória.");
    }

    this.config = config;
    this.fetch = fetchImpl;
    this.accessToken = null;
    this.accessTokenExpiresAt = 0;
  }

  async refreshAccessToken() {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      refresh_token: this.config.refreshToken,
    });

    const response = await this.fetch(
      `${this.config.accountsUrl}/oauth/v2/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      },
    );

    const payload = await readJson(response);
    assertSuccess(response, payload, "Não foi possível renovar o Access Token");

    if (!payload.access_token) {
      throw new ZohoApiError("A Zoho não retornou access_token.", {
        status: response.status,
        details: payload,
      });
    }

    this.accessToken = payload.access_token;
    const expiresInSeconds = Number(payload.expires_in ?? 3600);
    this.accessTokenExpiresAt = Date.now() + expiresInSeconds * 1000;

    if (payload.api_domain) {
      this.config.apiDomain = payload.api_domain.replace(/\/$/, "");
    }

    return {
      apiDomain: this.config.apiDomain,
      expiresIn: expiresInSeconds,
      scope: payload.scope,
    };
  }

  async getAccessToken() {
    const safetyWindowMs = 60_000;

    if (
      !this.accessToken ||
      Date.now() >= this.accessTokenExpiresAt - safetyWindowMs
    ) {
      await this.refreshAccessToken();
    }

    return this.accessToken;
  }

  async request(path, options = {}) {
    const token = await this.getAccessToken();
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Zoho-oauthtoken ${token}`);

    if (options.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await this.fetch(`${this.config.apiDomain}${path}`, {
      ...options,
      headers,
    });
    const payload = await readJson(response);

    assertSuccess(
      response,
      payload,
      `Falha na chamada ${options.method ?? "GET"} ${path}`,
    );
    return payload;
  }

  async listLeads({ perPage = 10 } = {}) {
    const fields = [
      "First_Name",
      "Last_Name",
      "Company",
      "Email",
      this.config.customSourceField,
      "Created_Time",
      "Modified_Time",
    ];
    const params = new URLSearchParams({
      fields: fields.join(","),
      per_page: String(perPage),
    });

    return this.request(`/crm/v8/Leads?${params}`);
  }

  async getLead(leadId) {
    const normalizedLeadId = validateLeadId(leadId);

    const fields = [
      "First_Name",
      "Last_Name",
      "Company",
      "Email",
      "Description",
      this.config.customSourceField,
      "Created_Time",
      "Modified_Time",
    ];

    const params = new URLSearchParams({
      fields: fields.join(","),
    });

    return this.request(`/crm/v8/Leads/${normalizedLeadId}?${params}`);
  }

  async createLead(data) {
    const validatedData = validateLeadForCreate(data, {
      customSourceField: this.config.customSourceField,
      allowedSourceValues: ["API"],
    });

    const body = {
      data: [validatedData],
      trigger: [],
    };

    return this.request("/crm/v8/Leads", {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async createStudyLead() {
    const uniqueSuffix = Date.now();

    return this.createLead({
      First_Name: "Cliente",
      Last_Name: "Laboratório Node.js",
      Company: "HDev Soluções - Estudo Zoho",
      Email: `estudo.zoho+${uniqueSuffix}@example.com`,
      [this.config.customSourceField]: "API",
    });
  }

  // async createStudyLead() {
  //   const uniqueSuffix = Date.now();

  //   const leadData = validateLeadForCreate(
  //     {
  //       First_Name: "Cliente",
  //       Last_Name: "Laboratório Node.js",
  //       Company: "HDev Soluções - Estudo Zoho",
  //       Email: `estudo.zoho+${uniqueSuffix}@example.com`,
  //       [this.config.customSourceField]: "API",
  //     },
  //     {
  //       customSourceField: this.config.customSourceField,
  //       allowedSourceValues: ["API"],
  //     },
  //   );

  //   const body = {
  //     data: [leadData],
  //     trigger: [],
  //   };

  //   return this.request("/crm/v8/Leads", {
  //     method: "POST",
  //     body: JSON.stringify(body),
  //   });
  // }

  async updateLead(leadId, data, { confirm = false } = {}) {
    const normalizedLeadId = validateLeadId(leadId);

    const validatedData = validateLeadForUpdate(data, {
      customSourceField: this.config.customSourceField,
      allowedSourceValues: ["API"],
    });

    if (!confirm) {
      throw new TypeError(
        "Atualização bloqueada. Informe a confirmação explícita.",
      );
    }

    const body = {
      data: [validatedData],
      trigger: [],
    };

    return this.request(`/crm/v8/Leads/${normalizedLeadId}`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  }
}

function validateLeadId(leadId) {
  const normalizedLeadId = String(leadId ?? "").trim();

  if (!normalizedLeadId) {
    throw new TypeError("O ID do Lead é obrigatório.");
  }

  if (!/^\d{10,30}$/.test(normalizedLeadId)) {
    throw new TypeError("O ID do Lead deve conter somente números.");
  }

  return normalizedLeadId;
}

async function readJson(response) {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ZohoApiError("A API retornou uma resposta que não é JSON.", {
      status: response.status,
    });
  }
}

function assertSuccess(response, payload, context) {
  if (response.ok) {
    return;
  }

  throw new ZohoApiError(
    `${context}: ${payload.message ?? payload.error ?? response.statusText}`,
    {
      status: response.status,
      code: payload.code ?? payload.error,
      details: payload.details,
    },
  );
}
