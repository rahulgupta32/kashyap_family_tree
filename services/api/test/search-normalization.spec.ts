import { normalizeSearchQuery, literalSearchPattern } from '../src/modules/genealogy/search-normalization';
describe('Source-preserving name search normalization', () => {
 it('normalizes compatibility forms, case and whitespace for Roman aliases', () => {
  expect(normalizeSearchQuery('  ＲＡＨＵＬ\t Gupta\n')).toBe('rahul gupta');
 });
 it('normalizes Nepali spacing without inventing transliteration or dropping marks', () => {
  expect(normalizeSearchQuery('  राहुल\u00a0  गुप्ता  ')).toBe('राहुल गुप्ता');
 });
 it('treats LIKE metacharacters as literal input', () => {
  expect(literalSearchPattern('a%b_c\\d')).toBe('%a\\%b\\_c\\\\d%');
 });
 it('rejects excessive and non-string queries without mutating source strings', () => {
  const source='ＲＡＨＵＬ  Gupta';normalizeSearchQuery(source);expect(source).toBe('ＲＡＨＵＬ  Gupta');
  expect(()=>normalizeSearchQuery('a'.repeat(501))).toThrow();expect(()=>normalizeSearchQuery({})).toThrow();
 });
});
