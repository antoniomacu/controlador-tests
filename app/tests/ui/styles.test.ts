import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// jsdom cannot lay out iOS safe areas or measure widths, so these pin the stylesheet rules that
// keep the pinned chip row visible under the status bar and the runner bar inside a 375 px screen.
const css = readFileSync(resolve(__dirname, '../../src/styles.css'), 'utf8');
const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf('}', start));
};

describe('styles', () => {
  it('pins the chapter row below the iPhone status bar, not behind it', () => {
    expect(block('.scopes')).toContain('top: env(safe-area-inset-top)');
  });

  it('keeps the runner bar tight enough for clock, progress, Reanudar and Abandonar', () => {
    expect(block('.runner-bar')).toContain('gap: var(--space-1)');
  });
});
