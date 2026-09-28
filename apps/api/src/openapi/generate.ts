import { writeFileSync } from 'node:fs';

import { getOpenApiDocument } from '../routes.js';
import { OPENAPI_FILE, serializeOpenApiDocument } from './file.js';

writeFileSync(OPENAPI_FILE, serializeOpenApiDocument(getOpenApiDocument()));
console.log(`OpenAPI document written to ${OPENAPI_FILE}`);
