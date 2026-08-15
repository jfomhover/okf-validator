export const SCHEMA_ORG = 'ThingsAI-io';
export const SCHEMA_REPO = 'okf-validator';
export const SCHEMA_BRANCH = 'main';

export const SUPPORTED_OKF_VERSIONS = ['0.2'];

export function buildSchemaBaseUrl(version) {
  return `https://raw.githubusercontent.com/${SCHEMA_ORG}/${SCHEMA_REPO}/${SCHEMA_BRANCH}/schemas/okf/v${version}`;
}

export const SCHEMA_BASE_URL = buildSchemaBaseUrl(SUPPORTED_OKF_VERSIONS[0]);