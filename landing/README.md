# Doable Landing

Standalone Vite landing page for Doable.

## Local development

```bash
npm install
npm run dev
```

Run validation before deployment:

```bash
npm test -- --run
npm run typecheck
npm run build
```

## Vercel

Create a Vercel project with this `landing` directory as its Root Directory. Vercel reads `vercel.json`, runs `npm run build`, and deploys the generated `dist` directory as a static site.
