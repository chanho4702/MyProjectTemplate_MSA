#!/usr/bin/env node
// Validates a template configuration against config/template-config.schema.json
// without external dependencies. Supports the JSON Schema subset that the
// template schema actually uses: type, const, enum, pattern, minimum, maximum,
// required, properties, additionalProperties(false), items, uniqueItems,
// minItems.
import { readFileSync } from "node:fs";

function typeOf(value) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(schemaType, value) {
  const actual = typeOf(value);
  if (schemaType === "integer") return actual === "number" && Number.isInteger(value);
  if (schemaType === "number") return actual === "number";
  return actual === schemaType;
}

export function validate(schema, value, path, errors) {
  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${path}: must be ${JSON.stringify(schema.const)}`);
    return;
  }
  if (schema.enum !== undefined && !schema.enum.some((candidate) => candidate === value)) {
    errors.push(`${path}: must be one of ${JSON.stringify(schema.enum)}`);
    return;
  }
  if (schema.type !== undefined && !matchesType(schema.type, value)) {
    errors.push(`${path}: must be of type ${schema.type}`);
    return;
  }
  if (typeOf(value) === "string" && schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${path}: must match pattern ${schema.pattern}`);
  }
  if (typeOf(value) === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors.push(`${path}: must be >= ${schema.minimum}`);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors.push(`${path}: must be <= ${schema.maximum}`);
    }
  }
  if (typeOf(value) === "object") {
    for (const requiredKey of schema.required ?? []) {
      if (!(requiredKey in value)) {
        errors.push(`${path}.${requiredKey}: required property is missing`);
      }
    }
    for (const [key, child] of Object.entries(value)) {
      const childSchema = schema.properties?.[key];
      if (childSchema) {
        validate(childSchema, child, `${path}.${key}`, errors);
      } else if (schema.additionalProperties === false) {
        errors.push(`${path}.${key}: property is not allowed`);
      }
    }
  }
  if (typeOf(value) === "array") {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${path}: must contain at least ${schema.minItems} item(s)`);
    }
    if (schema.uniqueItems && new Set(value.map((item) => JSON.stringify(item))).size !== value.length) {
      errors.push(`${path}: items must be unique`);
    }
    if (schema.items !== undefined) {
      value.forEach((item, index) => validate(schema.items, item, `${path}[${index}]`, errors));
    }
  }
}

function readJson(filePath, label) {
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    console.error(`Unable to read ${label}: ${filePath} (${error.message})`);
    process.exit(1);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`${label} is not valid JSON: ${filePath} (${error.message})`);
    process.exit(1);
  }
}

const [configPath, schemaPath, ...flags] = process.argv.slice(2);
if (!configPath || !schemaPath) {
  console.error("Usage: validate-template-config.mjs <config.json> <schema.json> [--features]");
  process.exit(2);
}

const config = readJson(configPath, "Configuration");
const schema = readJson(schemaPath, "Schema");
const errors = [];
validate(schema, config, "$", errors);
if (errors.length > 0) {
  for (const message of errors) {
    console.error(message);
  }
  console.error(`Configuration does not match ${schemaPath}`);
  process.exit(1);
}

if (flags.includes("--features")) {
  for (const [key, value] of Object.entries(config.features ?? {})) {
    if (typeof value === "boolean") {
      console.log(`${key}=${value}`);
    }
  }
}
