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
  it('pins tabs and chapters as one header padded below the iPhone status bar', () => {
    const top = block('.home-top');
    expect(top).toContain('position: sticky');
    expect(top).toContain('top: 0');
    expect(top).toContain('padding: calc(env(safe-area-inset-top)');
  });

  it('never paints over the subject tabs: the chapter row casts no upward shadow', () => {
    expect(block('.scopes')).not.toContain('box-shadow');
    expect(block('.scopes')).not.toContain('position: sticky');
  });

  it('lays the section switch out as one row of three equal, full-height tap targets', () => {
    expect(block('.sections')).toContain('display: flex');
    expect(block('.sections [role=\'tab\']')).toContain('flex: 1');
    expect(block('.sections [role=\'tab\']')).toContain('min-height: var(--tap)');
    expect(block(".sections [role='tab'][aria-selected='true']")).toContain('border-bottom-color');
  });

  it('floats the swipe cue over the page without catching touches', () => {
    const cue = block('.swipe-cue');
    expect(cue).toContain('position: fixed');
    expect(cue).toContain('pointer-events: none');
    expect(cue).toContain('top: 50%');
  });

  it('keeps the runner bar tight enough for clock, progress, Reanudar and Abandonar', () => {
    expect(block('.runner-bar')).toContain('gap: var(--space-1)');
  });
});
