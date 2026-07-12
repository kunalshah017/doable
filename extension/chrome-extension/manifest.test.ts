import manifestSource from './manifest.ts?raw';
import { describe, expect, it } from 'vitest';

describe('manifest', () => {
  it('grants persistent access for selection screenshots', () => {
    expect(manifestSource).toContain("host_permissions: ['<all_urls>']");
  });
});
