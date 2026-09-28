import { z } from 'zod';

/**
 * Returns the same schema with every `.default()` / `.prefault()` removed (recursively),
 * so each field that parsing always fills in becomes required.
 *
 * Why: the OpenAPI generator describes schemas as request input, where a field with a
 * default is optional. Responses always contain those fields, so response schemas use
 * this "output shape" to keep the generated client types exact without duplicating the
 * schema by hand. Handles the node types used by the shared schemas; other types are
 * returned unchanged.
 */
export function outputSchema<T extends z.ZodType>(schema: T): z.ZodType<z.output<T>> {
  return strip(schema) as z.ZodType<z.output<T>>;
}

function strip(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodDefault || schema instanceof z.ZodPrefault) {
    return strip(schema.unwrap() as z.ZodType);
  }
  if (schema instanceof z.ZodOptional) {
    return strip(schema.unwrap() as z.ZodType).optional();
  }
  if (schema instanceof z.ZodNullable) {
    return strip(schema.unwrap() as z.ZodType).nullable();
  }
  if (schema instanceof z.ZodArray) {
    return z.array(strip(schema.element as z.ZodType));
  }
  if (schema instanceof z.ZodObject) {
    const shape = Object.fromEntries(
      Object.entries(schema.shape).map(([key, value]) => [key, strip(value as z.ZodType)]),
    );
    return z.object(shape);
  }
  return schema;
}
