# Doable Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Vercel-deployable React landing page that explains Doable's preview-to-pull-request workflow and includes the supplied interactive glass CTA.

**Architecture:** A standalone Vite application in `landing/` owns its dependencies, static deployment configuration, page sections, and design tokens. `App.tsx` composes the product story, while `CtaSection.tsx` owns the reference-specific interaction and parallax behavior.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Framer Motion, Vitest, Testing Library, clsx, tailwind-merge, Vercel static deployment.

---

### Task 1: Establish the Independent Static App

**Files:**

- Create: `landing/package.json`
- Create: `landing/index.html`
- Create: `landing/tsconfig.json`
- Create: `landing/vite.config.ts`
- Create: `landing/tailwind.config.ts`
- Create: `landing/postcss.config.cjs`
- Create: `landing/vercel.json`
- Create: `landing/src/main.tsx`

- [ ] **Step 1: Define the landing package scripts and dependencies**

Create a package with `dev`, `build`, `preview`, `test`, and `typecheck` scripts. Pin React 18 and include only Tailwind, Framer Motion, clsx, tailwind-merge, Vitest, Testing Library, and their required type tooling.

- [ ] **Step 2: Create the Vite entry point and Vercel rewrite configuration**

Use `src/main.tsx` to render `App` into `#root`; configure Vercel as a static Vite build:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

- [ ] **Step 3: Confirm the unimplemented test fails**

Run: `cd landing && npm test -- --run`

Expected: FAIL because the required `App` and CTA component are not present.

### Task 2: Create Tokens and Shared Landing Primitives

**Files:**

- Create: `landing/src/index.css`
- Create: `landing/src/lib/cn.ts`
- Create: `landing/src/components/landing-primitives.tsx`
- Test: `landing/src/components/landing-primitives.test.tsx`

- [ ] **Step 1: Write a failing button test**

```tsx
it("renders Join the demo with an animated duplicate label", () => {
  render(<PrimaryButton>Join the demo</PrimaryButton>);
  expect(screen.getAllByText("Join the demo")).toHaveLength(2);
});
```

- [ ] **Step 2: Run the focused test**

Run: `cd landing && npm test -- --run src/components/landing-primitives.test.tsx`

Expected: FAIL because `PrimaryButton` is not implemented.

- [ ] **Step 3: Implement the Tailwind palette, fonts, liquid glass utility, and primitives**

Add the supplied `landing` white-alpha palette and `.liquid-glass` utility. Implement `cn`, `MIcon`, `FadeUp`, `AnimatedText`, and polymorphic `PrimaryButton` with the required white-pilled hover state.

- [ ] **Step 4: Verify the primitive test passes**

Run: `cd landing && npm test -- --run src/components/landing-primitives.test.tsx`

Expected: PASS.

### Task 3: Build the Doable Product Story Below the Hero

**Files:**

- Create: `landing/src/components/product-story.tsx`
- Create: `landing/src/App.tsx`
- Test: `landing/src/App.test.tsx`

- [ ] **Step 1: Write a failing page-content test**

```tsx
it("explains the visible approval workflow", () => {
  render(<App />);
  expect(
    screen.getByRole("heading", { name: /change the website/i }),
  ).toBeInTheDocument();
  expect(screen.getByText("Approve")).toBeInTheDocument();
  expect(screen.getByText("Pull request")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test**

Run: `cd landing && npm test -- --run src/App.test.tsx`

Expected: FAIL because `App` does not yet render the product story.

- [ ] **Step 3: Implement the nav, selection-and-preview hero, workflow sequence, and manager benefits**

Use the coral selection outline, lime approval status, and layered CSS signal field. Keep the background decorative and place all actionable content above it with keyboard-visible focus states. The grass dashboard hero is composed first in `App`; this task supplies the supporting workflow and manager-benefit sections below it.

- [ ] **Step 4: Verify the page-content test passes**

Run: `cd landing && npm test -- --run src/App.test.tsx`

Expected: PASS.

### Task 4: Implement the Desktop Hero Dashboard

**Files:**

- Create: `landing/src/components/CtaSection.tsx`
- Create: `landing/src/components/CtaSection.test.tsx`
- Modify: `landing/src/App.tsx`

- [ ] **Step 1: Write a failing chat interaction test**

```tsx
it("adds a manager message on submit", async () => {
  const user = userEvent.setup();
  render(<ChatPanel initialScroll="top" />);
  await user.type(
    screen.getByPlaceholderText("Ask about the course..."),
    "Show a preview",
  );
  await user.keyboard("{Enter}");
  expect(screen.getByText("Show a preview")).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the focused test**

Run: `cd landing && npm test -- --run src/components/CtaSection.test.tsx`

Expected: FAIL because `ChatPanel` is not implemented.

- [ ] **Step 3: Implement the reference components and responsive parallax section**

Use the exact supplied CloudFront video URL and Cloudinary grass URL. Use the dashboard as the top-level Doable hero: retune its heading, primary action, and chat to the product workflow; preserve the supplied animation classes and desktop `useTransform` ranges. Keep the grass in front of the dashboard but behind the hero text and primary action.

- [ ] **Step 4: Verify the CTA test passes**

Run: `cd landing && npm test -- --run src/components/CtaSection.test.tsx`

Expected: PASS.

### Task 5: Build and Visually Verify the Deployable Page

**Files:**

- Modify: `landing/README.md`

- [ ] **Step 1: Document local development and Vercel deployment**

Document `npm install`, `npm run dev`, `npm run build`, and Vercel's project-root setting of `landing`.

- [ ] **Step 2: Run the full focused test suite and typecheck**

Run: `cd landing && npm test -- --run && npm run typecheck`

Expected: PASS with no type errors.

- [ ] **Step 3: Run the production build**

Run: `cd landing && npm run build`

Expected: PASS and write static files to `landing/dist`.

- [ ] **Step 4: Screenshot desktop and mobile layouts**

Start `npm run dev -- --host 127.0.0.1`, capture the root URL at desktop and mobile widths, then confirm the hero is visible, CTA video is nonblank, and the mobile CTA does not render the chat panel.
