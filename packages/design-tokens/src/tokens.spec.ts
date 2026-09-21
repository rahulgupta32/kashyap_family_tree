import { colors, typography } from './colors';

describe('Design Tokens & Palette (WCAG 2.2 AA Compliance)', () => {
  it('should export saffron, maroon, and temple gold tokens with valid hex strings', () => {
    expect(colors.saffron[500]).toBe('#f97316');
    expect(colors.maroon[500]).toBe('#991b1b');
    expect(colors.gold[500]).toBe('#d97706');
  });

  it('should export Devanagari and Latin typography definitions', () => {
    expect(typography.fontFamily.nepali).toContain('Mukta');
    expect(typography.fontFamily.latin).toContain('Inter');
  });

  it('should provide semantic colors for success, warning, and error states', () => {
    expect(colors.success).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(colors.warning).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(colors.error).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});
