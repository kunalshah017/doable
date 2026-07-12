type RequestInputState = {
  hasWorkspaceSource: boolean;
  hasDraft: boolean;
  isBusy: boolean;
};

export const isRequestInputDisabled = (state: RequestInputState) => state.hasDraft || state.isBusy;
