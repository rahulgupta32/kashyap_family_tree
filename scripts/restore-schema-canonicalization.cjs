// pg_dump/pg_restore can distribute a varchar literal-array's text[] cast
// onto each element. Normalize only that equivalent, unbounded literal form.
function canonicalSchemaDefinition(definition) {
  return definition.replace(/\(\(ARRAY\[((?:'(?:[^']|'')*'::character varying)(?:, '(?:[^']|'')*'::character varying)*)\]\)::text\[\]\)/g,
    (_, literals) => `(ARRAY[${literals.replace(/'(?:[^']|'')*'::character varying/g, literal => `(${literal})::text`)}])`);
}
module.exports = { canonicalSchemaDefinition };
