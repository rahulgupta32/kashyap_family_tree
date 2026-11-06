const { test } = require('node:test');
const assert = require('node:assert/strict');
const { canonicalSchemaDefinition: normalize } = require('./restore-schema-canonicalization.cjs');
test('normalizes PostgreSQL restore literal-array casts including escaped quotes', () => {
  const source = "CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'CAN''T'::character varying])::text[])))";
  const restored = "CHECK (((status)::text = ANY (ARRAY[('PENDING'::character varying)::text, ('CAN''T'::character varying)::text])))";
  assert.equal(normalize(source), normalize(restored));
  assert.equal(normalize(normalize(source)), normalize(source));
});
test('retains changed values, literal order, column names and comparison operators', () => {
  const source = "status = ANY ((ARRAY['PENDING'::character varying, 'FAILED'::character varying])::text[])";
  for (const changed of [source.replace('FAILED', 'PROCESSED'), source.replace("'PENDING'::character varying, 'FAILED'", "'FAILED'::character varying, 'PENDING'"), source.replace('status', 'state'), source.replace('= ANY', '<> ALL')]) {
    assert.notEqual(normalize(source), normalize(changed));
  }
});
test('does not rewrite bounded casts, nonliteral arrays or different element types', () => {
  for (const definition of ["((ARRAY['PENDING'::character varying(5)])::text[])", '((ARRAY[status::character varying])::text[])', "((ARRAY['PENDING'::text])::text[])"]) {
    assert.equal(normalize(definition), definition);
  }
});
