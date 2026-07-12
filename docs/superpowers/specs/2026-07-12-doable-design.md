# Doable Design Specification

**Status:** Approved for implementation

## Product Summary

Doable is an AI UI engineering agency in a Chrome side panel. A manager opens a website, selects a component, and asks for a visual or copy change in natural language. Hermes coordinates the agency that inspects the selection, creates temporary browser-only preview edits, evaluates the result, and records each approved decision. When the manager chooses to release, Hermes translates only the approved browser changes into a real GitHub pull request.

The manager never clones a repository, edits source code, or gives the agent permission to write code before approving the browser preview.

## Demo Scope

The buildathon demo uses a public static HTML/CSS/JavaScript website in a separate GitHub repository that is added to the VS Code workspace later. The Doable repository does not contain or deploy the demo website. The external demo site exposes stable `data-doable-id` markers for editable components, making browser-to-source mapping deterministic while preserving the intended end-user interaction.

The architecture accepts arbitrary connected repositories, but v1 only guarantees source release for components that the release agent can map with confidence. A release item without a confident mapping is marked blocked and excluded from the PR.

## User Workflow

1. The manager connects GitHub and provides a repository URL plus the website URL.
2. The manager opens the website and opens Doable from Chrome's side panel.
3. Doable enters selection mode. Hovering outlines elements; clicking one captures its DOM context, computed styles, a screenshot crop, URL, viewport, and `data-doable-id` when present.
4. The manager asks for a change, such as "Make this call-to-action more prominent and change the copy to Start free."
5. Hermes plans the task and asks the extension content script to apply a reversible HTML/CSS preview patch only in the currently open tab.
6. Doable shows the draft, the agent trace, and a before/after summary. The manager may request revisions, discard the draft, or approve it.
7. Approval records an immutable ledger entry containing the selection fingerprint, request, preview patch, screenshots, and the approved result. It does not modify GitHub.
8. The manager clicks **Create pull request**. Hermes's release crew reads the GitHub repository, translates every approved ledger entry into source edits, verifies the resulting diff against the ledger, creates a branch and commit, then opens a pull request.

## Agency Roles

### Engineering Manager

Owns a change request from intake through preview. It decides whether the task needs a simple style edit, content edit, or escalation. It delegates focused specialist work, reviews returned results, and asks the manager for approval before any release activity.

### Page Inspector

Receives the selected component snapshot, surrounding DOM, computed style subset, and manager request. It identifies the editable component and produces a structured component brief: target identifier, current content, constraints, requested result, and risks.

### UI Editor

Produces a constrained `PreviewPatch` with text, attribute, and CSS declarations. The patch is applied only in the active tab. It may modify the selected element and its direct parent; it cannot execute arbitrary JavaScript or change the page outside that scope.

### Visual QA

Reviews the before/after screenshots and extension validation result. It checks that the selected component changed, page text remains readable, no page overflow was introduced, and no console error appeared after the patch. It can request a revision from the UI Editor.

### Release Agent

Runs only after explicit manager approval. It reads source files from GitHub, maps approved entries to source edits, creates a patch, and creates a GitHub branch, commit, and pull request. It reports a blocked mapping rather than fabricating source edits.

## Hermes Integration

Hermes is the agent runtime, not merely a development assistant.

- The Doable server calls Hermes through its local API server or Python `AIAgent` embedding.
- A Doable Hermes plugin registers narrowly scoped tools:
  - `get_selected_component`
  - `apply_preview_patch`
  - `capture_preview_state`
  - `record_approved_change`
  - `get_repository_context`
  - `create_pull_request`
- Hermes emits run and tool progress to the server. The extension renders this as a trace for the manager and judges.
- The manager's approval is an explicit release guardrail. `create_pull_request` rejects calls unless the server has a current approval token bound to the change set.

## Persistent Memory with Supermemory

Doable uses Supermemory through Hermes's native `supermemory` memory provider. This is additive to Hermes's built-in `MEMORY.md` and `USER.md` files: Hermes automatically recalls relevant context before a turn, captures clean conversation turns after a response, and exposes `supermemory_search`, `supermemory_store`, `supermemory_forget`, and `supermemory_profile` to the manager agent.

Memory is explicitly scoped per Doable workspace. A workspace is one manager and connected repository pair. The server starts or selects a dedicated Hermes profile for that workspace and configures its primary Supermemory container as `doable-{identity}`. Doable must never route separate managers or repositories through a shared Hermes profile or container.

For the hackathon demo, the single workspace uses a `doable-demo` Hermes profile and the `doable-doable-demo` primary container. The agent should demonstrate memory by recalling a previously approved design preference or repository convention during a second request.

### Memory Policy

Doable stores only durable work context:

- Manager-approved visual preferences, such as preferred brand colors or tone.
- Repository conventions that affect future releases, such as the supported source files and component marker pattern.
- Approved changes, their release outcome, and source-mapping explanations.
- Explicit manager instructions to remember or forget a fact.

Doable must not store GitHub OAuth tokens, Hermes keys, session tokens, raw repository files, complete page HTML, full screenshots, or secrets that appear in a request. The server redacts common secret formats before Hermes receives a request and blocks `supermemory_store` calls containing secret-like values. A manager can clear workspace memory through the control surface, which invokes `supermemory_forget` for the workspace container and deletes server-side memory references.

Automatic capture remains enabled only after the manager accepts the workspace memory notice. If memory is declined, Hermes runs with Supermemory disabled for that workspace and Doable still functions without cross-session recall.

The trace must show memory actions separately, including whether relevant context was recalled, stored, skipped by consent, or unavailable because the provider failed. Supermemory failure must be non-blocking: the preview and PR workflow continues with no memory context.

## Browser Preview Contract

Preview patches are temporary and are cleared when the page reloads, the manager discards them, or the extension disconnects.

```ts
type SelectedComponent = {
  selectionId: string;
  tabId: number;
  pageUrl: string;
  doableId?: string;
  selector: string;
  outerHtml: string;
  parentHtml: string;
  computedStyles: Record<string, string>;
  viewport: { width: number; height: number };
  screenshotDataUrl: string;
};

type PreviewPatch = {
  patchId: string;
  selectionId: string;
  text?: string;
  attributes?: Record<string, string | null>;
  styles?: Record<string, string | null>;
  parentStyles?: Record<string, string | null>;
  rationale: string;
};
```

The content script maintains a reversible patch stack. It snapshots original text, attributes, and inline styles before applying each preview patch and can restore any patch or all patches without refreshing the page.

## Repository Structure

```text
doable/
  extension/  # React, Vite, Manifest V3, side panel, content and background scripts
  server/     # FastAPI, Hermes orchestration, Supermemory policy, GitHub release API
  docs/       # Product specification, implementation plan, setup and demo runbooks
```

The extension starts from release `0.5.2` of `Jonghakseo/chrome-extension-boilerplate-react-vite`, pinned because the upstream repository is archived. Doable retains its MIT license attribution but removes unused product surfaces such as popup, new-tab, options, and Firefox support during implementation. The server is independent of the extension build workspace.

## Approval Ledger and Release Contract

```ts
type ApprovedChange = {
  changeId: string;
  selection: SelectedComponent;
  request: string;
  previewPatch: PreviewPatch;
  beforeScreenshot: string;
  afterScreenshot: string;
  qa: { passed: boolean; checks: string[] };
  approvedAt: string;
};

type ReleaseRequest = {
  repository: { owner: string; name: string; defaultBranch: string };
  changes: ApprovedChange[];
};
```

The release agent maps a `data-doable-id` to source by searching the connected repository for that exact marker. For the demo, it supports `index.html` and `styles.css` only. It transforms approved text, attributes, and styles into source file edits, then uses GitHub's Git Data API to create a branch, commit, and pull request. The release is not allowed to make semantic changes outside the approved ledger.

## Control Surface

The Chrome side panel contains:

- Connection state for the website and GitHub repository.
- A selection mode toggle and current component summary.
- Conversation and streaming Hermes activity.
- A preview review card with approve, revise, discard, and undo controls.
- An approved changes list with before/after thumbnails.
- A workspace memory panel showing the current memory status, recalled context for the active task, and a clear-memory command.
- A release button disabled until at least one approved entry exists.
- Release status with branch, commit, PR URL, and blocked-entry explanations.

## Security and Guardrails

- The extension does not receive a Hermes API key or GitHub access token.
- The server authenticates extension requests with an ephemeral session token tied to the browser installation.
- GitHub OAuth tokens are stored server-side only and encrypted at rest for the demo environment.
- Supermemory credentials stay only in the active Hermes profile environment; the extension and server never receive or return the API key.
- Workspace memory is opt-in and stays inside the workspace's dedicated Hermes profile and Supermemory container.
- The server redacts secret-like values before agent execution or explicit memory writes.
- Preview patches can change only text, attributes, and inline CSS on the selected component or direct parent.
- Release requires an explicit approval token generated after the manager approves the exact current ledger hash.
- The release tool permits only the configured repository and demo files. It creates a pull request but does not merge it.

## Observability and Evaluation

Every task records a run tree containing agent role, tool name, input summary, output summary, duration, result, and error state. The interface supports opening a past run and seeing its ordered handoffs.

The run tree also records memory recall, store, forget, consent, and provider-failure events without exposing stored secret material.

The seeded demo requests form a small named evaluation set:

1. Change hero CTA text and contrast.
2. Highlight a feature or plan card as "Most popular."
3. Improve spacing in a cramped mobile-oriented content section.

For each request, the acceptance criteria are: preview applies, undo restores the original state, approval creates one ledger entry, and release creates a GitHub PR whose diff contains only approved changes.

## Failure Behavior

- If an element cannot be selected, Doable keeps selection mode active and explains the failure in the side panel.
- If Hermes or the server fails, the existing preview remains unchanged and the run is marked failed with its last completed step.
- If QA fails, the change cannot be approved until a new preview passes or the manager discards it.
- If GitHub authorization expires, release stops before any write and requests reconnection.
- If source mapping fails for an approved entry, it is clearly blocked and omitted; Doable never opens a PR containing guessed code changes.

## Success Criteria for Judging

1. A non-engineer can select a component, request a change, approve it, and create a PR with no local repository setup.
2. Hermes visibly runs the manager and specialist workflow through real custom tools.
3. Browser previews are reversible and do not change the deployed website.
4. A real GitHub pull request contains source changes that match the approved preview.
5. The same workflow completes successfully for all three seeded requests during a live demo.
6. On a second task in the same workspace, Hermes recalls one relevant approved preference or repository convention from Supermemory; disabling memory leaves preview and release behavior intact.
