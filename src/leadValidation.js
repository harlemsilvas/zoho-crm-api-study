const FIELD_LIMITS = {
  First_Name: 100,
  Last_Name: 100,
  Company: 200,
  Email: 254,
  Description: 5000,
};

const DEFAULT_CUSTOM_SOURCE_FIELD = "Lista_de_op_es";
const DEFAULT_ALLOWED_SOURCE_VALUES = ["API"];

export function validateLeadForCreate(data, options = {}) {
  const validationOptions = normalizeOptions(options);
  const normalizedData = normalizeLeadData(data, validationOptions, {
    requiredFields: ["Last_Name", "Company"],
  });

  requireField(normalizedData, "Last_Name");
  requireField(normalizedData, "Company");

  return normalizedData;
}

export function validateLeadForUpdate(data, options = {}) {
  const validationOptions = normalizeOptions(options);
  const normalizedData = normalizeLeadData(data, validationOptions);

  if (Object.keys(normalizedData).length === 0) {
    throw new TypeError("Informe pelo menos um campo para atualizar.");
  }

  return normalizedData;
}

function normalizeOptions({
  customSourceField = DEFAULT_CUSTOM_SOURCE_FIELD,
  allowedSourceValues = DEFAULT_ALLOWED_SOURCE_VALUES,
} = {}) {
  const normalizedCustomSourceField = String(customSourceField).trim();

  if (!normalizedCustomSourceField) {
    throw new TypeError("O API name do campo Sistema origem é obrigatório.");
  }

  if (!Array.isArray(allowedSourceValues)) {
    throw new TypeError(
      "Os valores permitidos de Sistema origem devem ser um array.",
    );
  }

  return {
    customSourceField: normalizedCustomSourceField,
    allowedSourceValues: allowedSourceValues.map((value) =>
      String(value).trim(),
    ),
  };
}

function normalizeLeadData(data, options, { requiredFields = [] } = {}) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Os dados do Lead devem ser informados como objeto.");
  }
  const requiredFieldSet = new Set(requiredFields);
  const allowedFields = new Set([
    "First_Name",
    "Last_Name",
    "Company",
    "Email",
    "Description",
    options.customSourceField,
  ]);

  const normalizedEntries = [];

  for (const [field, originalValue] of Object.entries(data)) {
    if (!allowedFields.has(field)) {
      throw new TypeError(`Campo não permitido: ${field}.`);
    }

    if (originalValue === undefined) {
      continue;
    }

    if (typeof originalValue !== "string") {
      throw new TypeError(`${field} deve ser informado como texto.`);
    }

    const value = originalValue.trim();

    if (!value) {
      if (requiredFieldSet.has(field)) {
        throw new TypeError(`${field} é obrigatório.`);
      }

      throw new TypeError(`${field} não pode ficar vazio.`);
    }

    validateFieldLength(field, value, options);
    validateEmail(field, value);
    validateSourceValue(field, value, options);

    normalizedEntries.push([field, value]);
  }

  return Object.fromEntries(normalizedEntries);
}

function requireField(data, field) {
  if (!data[field]) {
    throw new TypeError(`${field} é obrigatório.`);
  }
}

function validateFieldLength(field, value, options) {
  const limit = field === options.customSourceField ? 100 : FIELD_LIMITS[field];

  if (limit && value.length > limit) {
    throw new TypeError(`${field} excede o limite de ${limit} caracteres.`);
  }
}

function validateEmail(field, value) {
  if (field !== "Email") {
    return;
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailPattern.test(value)) {
    throw new TypeError("Email possui formato inválido.");
  }
}

function validateSourceValue(field, value, options) {
  if (field !== options.customSourceField) {
    return;
  }

  if (!options.allowedSourceValues.includes(value)) {
    throw new TypeError(`Valor não permitido para Sistema origem: ${value}.`);
  }
}
