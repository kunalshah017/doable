# Full-Page Static Editing Design

**Status:** Approved for implementation

## Goal

Doable will edit complete static websites rather than translating a narrow DOM mutation back to source. A manager may request additions, removals, reordering, styling, responsive behavior, and JavaScript interactions across root-level `index.html`, `styles.css`, and `script.js`. Browser preview remains temporary; GitHub changes happen only after approval.

## Supported Scope

The first full-page release supports one static entry page with these optional root files:

- `index.html`
- `styles.css`
- `script.js`

Hermes may replace any text in those files, add or remove HTML elements, add arbitrary valid CSS rules, and add browser JavaScript. It may not modify binary assets, package manifests, build systems, server code, framework components, or files outside this allowlist. React, Vue, Next.js, multiple pages, and asset generation are separate follow-up projects.

The selected live element remains useful context for the manager request, but it is not a source-mapping key. Full-page edits do not require `data-doable-id` attributes.

## User Workflow

1. The manager opens Doable, whose new workspace reset clears the previous working batch while retaining the GitHub installation and selected repository.
2. Doable reads the selected repository's default-branch SHA and the three supported source files through the GitHub App.
3. The manager may select a live element for context, then requests a change in natural language.
4. Hermes receives the request, selected DOM context, screenshot, and current source workspace.
5. Hermes returns complete replacement contents for only the supported files it changed.
6. The server validates the proposed workspace and assembles a standalone preview document.
7. The extension opens that document in a full-viewport sandboxed iframe over the live page. The live page DOM, cookies, storage, and JavaScript context remain unchanged.
8. The manager can close the preview, request a revision, or approve it.
9. Approval records the exact source files, source hashes, base commit SHA, screenshots, request, and validation results.
10. Release verifies that the repository default branch still matches the approved base SHA, writes exactly the approved file contents, creates commits in approval order, and opens a pull request.

## Source Workspace Contract

```ts
type StaticSourceWorkspace = {
  baseCommitSha: string;
  files: {
    "index.html": string;
    "styles.css"?: string;
    "script.js"?: string;
  };
};

type WorkspacePatch = {
  patchId: string;
  selectionId?: string;
  baseCommitSha: string;
  files: Partial<Record<"index.html" | "styles.css" | "script.js", string>>;
  summary: string[];
  rationale: string;
};
```

The patch carries complete contents for changed files, not a guessed textual diff. The server computes the diff for review and Git commit creation. Each file is limited to 250 KB and the combined workspace is limited to 600 KB.

## Hermes Contract

Hermes acts as a source editor for the three-file static workspace. Its prompt includes:

- The manager request.
- The current workspace files.
- The selected element's selector, HTML context, computed-style subset, URL, viewport, and screenshot metadata when available.
- The exact supported paths and size limits.
- A requirement to return one JSON object containing only changed files, summary, and rationale.

Hermes must preserve unchanged behavior unless the request requires changing it. It must not emit remote scripts, `javascript:` URLs, inline event-handler attributes, service workers, navigation away from the preview, credential access, or network exfiltration code. Invalid JSON or unsupported paths are rejected before preview.

## Validation

The server validates every proposed workspace before returning it:

- `index.html` must exist, be valid UTF-8, contain an HTML document, and remain within its size limit.
- HTML rejects `javascript:` URLs, inline `on*` handlers, `<base>`, `<object>`, `<embed>`, service-worker registration text, and cross-origin form actions.
- CSS is parsed with `tinycss2`; parse errors and unsafe `@import`, `expression()`, `javascript:`, and `-moz-binding` values are rejected.
- JavaScript is valid UTF-8, within its size limit, and rejects service-worker registration, dynamic remote script construction, cookie access, storage access, top-window access, opener access, and network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`).
- Referenced local `styles.css` and `script.js` files are inlined into the preview document. Remote executable scripts are removed from preview.

These checks bound the hackathon feature; they are not a general-purpose JavaScript security system.

## Sandboxed Preview

The content script creates a fixed, full-viewport preview layer containing:

- A Doable-owned toolbar with the patch summary and **Close preview** action.
- An iframe using `sandbox="allow-scripts allow-forms allow-modals"` without `allow-same-origin`, `allow-top-navigation`, or `allow-popups`.
- A generated `srcdoc` document containing the proposed HTML plus inlined CSS and JavaScript.

The iframe cannot read the original website's cookies, local storage, DOM, or JavaScript objects. Closing or undoing the preview removes the entire iframe, making arbitrary HTML/CSS/JS preview reversible without reconstructing the original page.

Only one workspace preview may exist per tab. Applying a revision replaces the iframe document atomically. Reloading the page or closing the side panel removes the preview.

## Approval Ledger

Full-page approvals add a new workspace-change entry rather than overloading the old element patch:

```ts
type ApprovedWorkspaceChange = {
  changeId: string;
  request: string;
  workspacePatch: WorkspacePatch;
  sourceHashesBefore: Record<string, string>;
  sourceHashesAfter: Record<string, string>;
  beforeScreenshot: string;
  afterScreenshot: string;
  qa: { passed: boolean; checks: string[] };
  approvedAt: string;
};
```

The ledger remains ordered and hash-bound. A later approved change uses the prior approved workspace as its input, so multiple approvals compose deterministically. The release authorization covers the exact ordered workspace ledger.

## GitHub Release

The release service reads the default-branch reference and compares it with the first approved patch's `baseCommitSha`. If they differ, release stops with `base_branch_moved`; Doable never rebases or guesses.

For each approved change, the service creates a Git tree containing exactly that change's changed file contents, then creates one commit whose parent is the preceding generated commit. It preserves the deterministic `doable/<ledger-prefix>` branch and idempotent pull-request reuse behavior.

The existing element translator remains available only for legacy records during migration. New previews and approvals use workspace patches and bypass `data-doable-id` source mapping entirely.

## Side-Panel Changes

The side panel will:

- Require a selected GitHub repository before generating a full-page source preview.
- Show the loaded base SHA and supported source files.
- Keep element selection optional but recommended for focused requests.
- Label the action **Preview full page**.
- Show changed file names and a concise summary before approval.
- Open the full-page sandbox preview in the active tab.
- Preserve the current approval ledger and pull-request controls.
- Display validation failures with the unsupported file, HTML, CSS, or JavaScript reason.

## Failure Behavior

- Missing `index.html`: block preview and explain that the first version supports root static sites only.
- Repository access failure: retain the current browser page and request GitHub reconnection.
- Invalid Hermes output: retain the previous preview and allow retry.
- Validation failure: do not apply the iframe preview or allow approval.
- Preview iframe failure: remove the preview layer and leave the live page untouched.
- Base branch movement: block release before any GitHub write.
- Partial GitHub write failure: retain deterministic branch/commit identifiers so retry reuses completed work.

## Testing

- Contract tests for workspace serialization and validation limits.
- Hermes parsing tests for changed-file allowlisting and malformed output.
- Browser tests for iframe application, replacement, close, page reload, and sandbox attributes.
- Server tests for cumulative approvals and ledger hashes.
- Release tests for exact file content, one commit per approval, idempotent retry, and base-SHA conflict.
- End-to-end demo test that adds HTML, adds responsive CSS, adds a JavaScript interaction, previews it, approves it, and creates a matching pull request.

## Success Criteria

1. A manager can add or remove existing HTML structures without source markers.
2. A manager can add arbitrary valid CSS, including media queries and animations.
3. A manager can add a JavaScript interaction that works inside the sandboxed preview.
4. Closing Doable removes all temporary preview state while retaining GitHub connection and repository selection.
5. The generated pull request contains exactly the approved `index.html`, `styles.css`, and `script.js` changes.
6. The live deployed website is never mutated during preview.
