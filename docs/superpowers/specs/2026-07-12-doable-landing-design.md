# Doable Landing Page Design

**Status:** Approved for implementation

## Purpose

Build a standalone, Vercel-deployable landing page that makes Doable understandable to non-technical managers. The page explains a concrete promise: request a website change in plain English, inspect it in the browser, approve it, and receive a pull request without working in a repository.

## Audience and Message

The primary audience is a manager who owns a website or marketing surface but cannot safely make production changes themselves. Copy uses the language of decisions and visible outcomes rather than agents, DOM patches, repositories, or APIs.

The primary call to action is **Join the demo**.

## Visual Direction

The page uses the approved "Decision Room" direction: dark operational surfaces, a warm off-white type color, electric coral for selected UI, lime for approved states, and cobalt for system activity. A CSS-only moving signal field creates an original atmospheric background informed by the motion and depth of the provided MotionSites reference, without copying third-party premium media.

Typography combines a compact display face with Inter for readable interface copy. The supplied Instrument Serif remains scoped to the embedded Velorah preview, where it is required by the CTA reference.

## Page Architecture

1. The opening desktop hero combines product navigation, the primary **Join the demo** CTA, the supplied glass dashboard, a manager request chat, and the animated grass foreground.
2. A four-stage request-to-pull-request flow communicates the product process at a glance.
3. A manager-benefit section makes the reversible-preview and approval boundaries explicit.

## Hero Dashboard Contract

The page includes `FadeUp`, `MIcon`, `PrimaryButton`, `ChatPanel`, `VelorahHeroPreview`, `CtaDashboardMock`, and `CtaSection`. The supplied video, grass asset, glass frame, animations, and desktop parallax ranges remain in use. The surrounding nav, heading, primary action, and chat content are retuned for Doable. The first delivery targets desktop only; the dashboard uses its two-column desktop frame without a mobile layout requirement.

## Delivery Boundary

The application lives in a new top-level `landing/` directory. It is a React 18, Vite, TypeScript, Tailwind CSS static app with its own package manifest and Vercel configuration. It does not join or alter the Chrome-extension pnpm workspace.

## Validation

Component tests confirm the CTA renders its required call to action and that the interactive chat adds a manager message. A production build verifies TypeScript, Tailwind, and Vite integration. Browser screenshots at desktop and mobile widths verify the page renders, respects the responsive CTA stack, and keeps the motion layer behind usable content.
