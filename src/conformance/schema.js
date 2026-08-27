import { buildValidators, isUrlReference, resolveSchemaFile } from '../schemas.js';

/**
 * Converts an Ajv instance path into the validator's frontmatter location format.
 * This is presentation only and raises no issues itself.
 */
function formatAjvPath(instancePath) {
  if (!instancePath) {
    return 'frontmatter';
  }
  return `frontmatter${instancePath.replaceAll('/', '.')}`;
}

/**
 * Converts an Ajv error into a concise user-facing validation message.
 * JSON-Schema violations are ERRORs when returned by schemaErrors.
 */
function formatAjvError(error) {
  const location = formatAjvPath(error.instancePath);
  if (error.keyword === 'required') {
    return `${location}: missing required field \`${error.params.missingProperty}\``;
  }
  if (error.keyword === 'enum') {
    return `${location}: must be one of ${error.params.allowedValues.map((value) => `\`${value}\``).join(', ')}`;
  }
  if (error.keyword === 'const') {
    return `${location}: must be \`${JSON.stringify(error.params.allowedValue)}\``;
  }
  if (error.keyword === 'pattern') {
    return `${location}: has invalid format (pattern mismatch)`;
  }
  if (error.keyword === 'oneOf') {
    return `${location}: does not match exactly one alternative`;
  }
  return `${location}: ${error.message}`;
}

/**
 * Runs one frontmatter object through its selected JSON Schema.
 * Every returned schema violation is an ERROR because it is an explicit contract failure.
 */
export function schemaErrors(schemaName, validate, value) {
  const valid = validate(value);
  if (valid) {
    return [];
  }
  return (validate.errors ?? []).map((error) => `[${schemaName}]: ${formatAjvError(error)}`);
}

/**
 * Resolves a frontmatter schema reference to either a URL or a local --schemas file.
 * Invalid local references throw and are converted into document-level ERRORs by the caller.
 */
export function resolveSchemaRef(value, schemasDir) {
  if (isUrlReference(value)) {
    return { kind: 'url', ref: value };
  }
  if (schemasDir && typeof value === 'string' && value.trim()) {
    return { kind: 'file', filePath: resolveSchemaFile(schemasDir, value) };
  }
  return null;
}

/**
 * Builds the per-bundle validator model used by concept checks.
 * Schema loading failures become document-level ERRORs rather than process failures.
 */
export function buildSchemaModel(version) {
  return buildValidators({ version });
}
