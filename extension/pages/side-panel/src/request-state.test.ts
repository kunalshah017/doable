import { isRequestInputDisabled } from './request-state';
import { describe, expect, it } from 'vitest';

describe('request input state', () => {
  it('allows typing before repository source is ready', () => {
    expect(
      isRequestInputDisabled({
        hasWorkspaceSource: false,
        hasDraft: false,
        isBusy: false,
      }),
    ).toBe(false);
  });

  it('locks the request while a draft or action is active', () => {
    expect(
      isRequestInputDisabled({
        hasWorkspaceSource: true,
        hasDraft: true,
        isBusy: false,
      }),
    ).toBe(true);
    expect(
      isRequestInputDisabled({
        hasWorkspaceSource: true,
        hasDraft: false,
        isBusy: true,
      }),
    ).toBe(true);
  });
});
