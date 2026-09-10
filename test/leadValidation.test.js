import assert from "node:assert/strict";
import test from "node:test";
import {
  validateLeadForCreate,
  validateLeadForUpdate,
} from "../src/leadValidation.js";

const options = {
  customSourceField: "Lista_de_op_es",
  allowedSourceValues: ["API"],
};

test("valida e normaliza dados para criação", () => {
  const result = validateLeadForCreate(
    {
      First_Name: "  Cliente  ",
      Last_Name: "  Laboratório  ",
      Company: "  HDev Soluções  ",
      Email: "  cliente@example.com  ",
      Description: "  Lead para estudo  ",
      Lista_de_op_es: "API",
    },
    options,
  );

  assert.deepEqual(result, {
    First_Name: "Cliente",
    Last_Name: "Laboratório",
    Company: "HDev Soluções",
    Email: "cliente@example.com",
    Description: "Lead para estudo",
    Lista_de_op_es: "API",
  });
});

test("exige sobrenome e empresa na criação", () => {
  assert.throws(
    () =>
      validateLeadForCreate(
        {
          Company: "HDev Soluções",
        },
        options,
      ),
    /Last_Name é obrigatório/,
  );

  assert.throws(
    () =>
      validateLeadForCreate(
        {
          Last_Name: "Laboratório",
        },
        options,
      ),
    /Company é obrigatório/,
  );
});

test("rejeita campos obrigatórios contendo somente espaços", () => {
  assert.throws(
    () =>
      validateLeadForCreate(
        {
          Last_Name: "   ",
          Company: "HDev Soluções",
        },
        options,
      ),
    /Last_Name é obrigatório/,
  );
});

test("rejeita e-mail inválido", () => {
  assert.throws(
    () =>
      validateLeadForCreate(
        {
          Last_Name: "Laboratório",
          Company: "HDev Soluções",
          Email: "email-invalido",
        },
        options,
      ),
    /Email possui formato inválido/,
  );
});

test("rejeita campo desconhecido", () => {
  assert.throws(
    () =>
      validateLeadForCreate(
        {
          Last_Name: "Laboratório",
          Company: "HDev Soluções",
          Campo_Inexistente: "Teste",
        },
        options,
      ),
    /Campo não permitido: Campo_Inexistente/,
  );
});

test("rejeita valor não permitido para Sistema origem", () => {
  assert.throws(
    () =>
      validateLeadForCreate(
        {
          Last_Name: "Laboratório",
          Company: "HDev Soluções",
          Lista_de_op_es: "Valor inválido",
        },
        options,
      ),
    /Valor não permitido para Sistema origem/,
  );
});

test("valida e normaliza dados para atualização", () => {
  const result = validateLeadForUpdate(
    {
      Description: "  Atualizado pelo laboratório  ",
      Lista_de_op_es: "API",
    },
    options,
  );

  assert.deepEqual(result, {
    Description: "Atualizado pelo laboratório",
    Lista_de_op_es: "API",
  });
});

test("rejeita campos controlados pelo Zoho na atualização", () => {
  for (const field of ["id", "Created_Time", "Modified_Time"]) {
    assert.throws(
      () =>
        validateLeadForUpdate(
          {
            Description: "Teste",
            [field]: "valor",
          },
          options,
        ),
      new RegExp(`Campo não permitido: ${field}`),
    );
  }
});

test("rejeita atualização sem campos", () => {
  assert.throws(
    () => validateLeadForUpdate({}, options),
    /Informe pelo menos um campo para atualizar/,
  );
});

test("rejeita textos acima do limite da aplicação", () => {
  assert.throws(
    () =>
      validateLeadForUpdate(
        {
          Description: "a".repeat(5001),
        },
        options,
      ),
    /Description excede o limite de 5000 caracteres/,
  );
});
