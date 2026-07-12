import { FadeUp, MIcon, PrimaryButton } from './landing-primitives';
import { cn } from '../lib/cn';

const WORKFLOW_VIDEO_SRC = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260514_102933_4e8f73b5-775a-4179-b2fb-472f59063dcd.mp4';
const CONTROL_VIDEO_SRC = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260405_171521_25968ba2-b594-4b32-aab7-f6b69398a6fa.mp4';
const PRICING_VIDEO_SRC = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260330_145725_08886141-ed95-4a8e-8d6d-b75eaadce638.mp4';
const SHOPIFY_LOGO_SRC = 'https://img.logo.dev/shopify.com?token=pk_BShsdiwDTuyRVVBW5GadOg&format=webp&retina=true';
const DODO_PAYMENTS_LOGO_SRC = 'https://img.logo.dev/dodopayments.com?token=pk_BShsdiwDTuyRVVBW5GadOg&format=webp&retina=true';

const workflow = [
  {
    number: '01',
    icon: 'ads_click',
    label: 'Find the moment',
    title: 'Select what is holding the page back.',
    body: 'Point at the one part of the experience you want to improve.',
    detail: 'Hero CTA selected',
  },
  {
    number: '02',
    icon: 'chat_bubble',
    label: 'Name the outcome',
    title: 'Explain it in the language you use every day.',
    body: 'Doable turns the request into a bounded visual change.',
    detail: 'Brief understood',
  },
  {
    number: '03',
    icon: 'visibility',
    label: 'See the proof',
    title: 'Compare the result where your audience will see it.',
    body: 'The preview is real, reversible, and never touches production.',
    detail: 'Preview ready',
  },
  {
    number: '04',
    icon: 'merge',
    label: 'Give the yes',
    title: 'Approve the exact decision, then hand it to engineering.',
    body: 'Doable creates a pull request with only what you approved.',
    detail: 'PR prepared',
  },
];

const outcomes = [
  ['Preview', 'The selected hero CTA becomes clearer and more confident.'],
  ['Approval', 'Manager approval is bound to the exact visual preview.'],
  ['Release', 'A scoped pull request is created for the engineering team.'],
];

const plans = [
  {
    name: 'Preview',
    price: '$49',
    cadence: 'per approved change',
    description: 'For teams that need one clear answer before they ask engineering to ship.',
    features: ['One selected component', 'Reversible browser preview', 'Scoped pull request'],
  },
  {
    name: 'Decision Room',
    price: '$249',
    cadence: 'per month',
    description: 'For marketing and product teams building a regular review rhythm.',
    features: ['Everything in Preview', 'Unlimited decision sessions', 'Workspace memory with Supermemory'],
    featured: true,
  },
  {
    name: 'Studio',
    price: 'Custom',
    cadence: 'for larger teams',
    description: 'For organizations aligning multiple sites, brands, and delivery teams.',
    features: ['Multiple workspaces', 'Release governance', 'Priority implementation support'],
  },
];

export const ProductHero = () => (
  <section className="relative overflow-hidden px-4 pb-24 pt-8 sm:px-6 sm:pb-32 lg:px-10">
    <div aria-hidden="true" className="signal-field pointer-events-none absolute inset-0 opacity-70" />
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-b from-transparent to-[#14191e]" />
    <div className="relative mx-auto max-w-7xl">
      <nav className="liquid-glass flex items-center justify-between rounded-full px-4 py-3 sm:px-5" aria-label="Primary navigation">
        <a href="#top" className="display-face inline-flex items-center gap-2 text-lg font-bold tracking-[0.08em] text-[#f4f1ea]">
          <span className="grid size-6 place-items-center rounded-md bg-[#ff5c4d] text-xs text-[#14191e]">D</span>
          doable
        </a>
        <div className="hidden items-center gap-6 text-sm text-white/60 md:flex">
          <a className="transition-colors hover:text-white" href="#how-it-works">How it works</a>
          <a className="transition-colors hover:text-white" href="#control">Why managers use it</a>
        </div>
        <PrimaryButton href="#cta" size="sm">Join the demo</PrimaryButton>
      </nav>

      <div className="grid items-center gap-12 pb-8 pt-20 lg:grid-cols-[0.87fr_1.13fr] lg:gap-16 lg:pt-28">
        <FadeUp className="max-w-2xl" y={28}>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#c9ff5c]/30 bg-[#c9ff5c]/10 px-3 py-1.5 text-xs font-medium text-[#d8ff89]">
            <span className="size-1.5 rounded-full bg-[#c9ff5c] shadow-[0_0_12px_#c9ff5c]" />
            Your website, with a decision trail
          </p>
          <h1 className="display-face max-w-2xl text-5xl font-bold leading-[0.95] tracking-normal text-[#f4f1ea] sm:text-6xl lg:text-7xl">
            Change the website. <span className="text-[#ff5c4d]">Not your week.</span>
          </h1>
          <p className="mt-7 max-w-xl text-base leading-7 text-white/70 sm:text-lg sm:leading-8">
            Doable gives managers a calm way to request, inspect, and approve web changes before engineering spends a minute shipping them.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-3">
            <PrimaryButton href="#cta">Join the demo</PrimaryButton>
            <a className="inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm text-white/70 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href="#how-it-works">
              See the handoff
              <MIcon name="arrow_downward" size={17} />
            </a>
          </div>
          <p className="mt-7 text-xs text-white/45">No repository setup. No production changes until you say so.</p>
        </FadeUp>
        <FadeUp delay={0.15} className="relative mx-auto w-full max-w-2xl lg:max-w-none" y={36}>
          <PreviewWorkspace />
        </FadeUp>
      </div>
    </div>
  </section>
);

const PreviewWorkspace = () => (
  <div className="liquid-glass relative overflow-hidden rounded-2xl p-2 shadow-[0_30px_100px_rgba(0,0,0,0.4)] sm:p-3">
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-[#0b1014]">
      <div className="flex items-center gap-1.5 border-b border-white/10 bg-white/[0.035] px-3 py-2.5">
        <span className="size-2 rounded-full bg-[#ff5c4d]" />
        <span className="size-2 rounded-full bg-[#f4c95d]" />
        <span className="size-2 rounded-full bg-[#c9ff5c]" />
        <div className="ml-3 max-w-[60%] truncate rounded-md bg-white/5 px-3 py-1 text-[10px] text-white/45">coastline.studio/pricing</div>
      </div>
      <div className="grid min-h-[360px] grid-cols-[1fr] lg:grid-cols-[1.4fr_0.8fr]">
        <div className="relative overflow-hidden bg-[#d9e6ec] p-5 text-[#142029] sm:p-7">
          <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(circle at 78% 20%, #b6d8df 0, transparent 26%), linear-gradient(130deg, transparent 50%, #cfedf0 50%)' }} />
          <div className="relative flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.16em] text-[#2d4852]">
            <span>Coastline</span>
            <span>Studio / Journal / Contact</span>
          </div>
          <div className="relative mt-16 max-w-[280px] sm:mt-20">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4361ee]">Designed for unhurried brands</p>
            <h2 className="mt-3 font-serif text-4xl leading-none sm:text-5xl">Make room for the work that matters.</h2>
            <p className="mt-4 text-xs leading-relaxed text-[#45606b]">A slower, clearer place for teams shaping the next thing.</p>
            <button type="button" className="mt-6 rounded-full bg-[#142029] px-4 py-2 text-xs font-medium text-white">Start a project</button>
          </div>
          <div className="absolute bottom-5 right-5 rounded-lg border-2 border-[#ff5c4d] bg-[#ff5c4d]/10 p-1.5 shadow-[0_0_0_999px_rgba(255,92,77,0.05)]">
            <div className="rounded-md border border-[#ff5c4d]/40 bg-white/90 px-3 py-2 text-[10px] font-semibold text-[#a52a20]">Selected: hero CTA</div>
          </div>
        </div>
        <div className="relative flex flex-col border-t border-white/10 bg-[#11181d] p-4 lg:border-l lg:border-t-0">
          <div className="flex items-center justify-between">
            <p className="text-xs font-medium text-white">Doable agency</p>
            <span className="rounded-full bg-[#c9ff5c]/15 px-2 py-1 text-[9px] font-medium text-[#d8ff89]">Preview ready</span>
          </div>
          <div className="mt-5 rounded-xl bg-white/[0.055] p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">Manager request</p>
            <p className="mt-2 text-xs leading-relaxed text-white/80">“Make this feel more welcoming. Keep the button clear, but less salesy.”</p>
          </div>
          <div className="my-4 flex items-center gap-2 text-[10px] text-[#d8ff89]">
            <span className="grid size-5 place-items-center rounded-full bg-[#c9ff5c] text-[#142029]"><MIcon name="check" size={13} weight={600} /></span>
            Contrast checked. Preview applied.
          </div>
          <div className="mt-auto flex gap-2">
            <button type="button" className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-[10px] text-white/65">Revise</button>
            <button type="button" className="flex-1 rounded-lg bg-[#c9ff5c] px-3 py-2 text-[10px] font-semibold text-[#142029]">Approve</button>
          </div>
        </div>
      </div>
    </div>
    <div className="absolute -right-8 -top-8 size-28 rounded-full border border-[#4361ee]/30 bg-[#4361ee]/10 blur-2xl" />
  </div>
);

export const Workflow = () => (
  <section id="how-it-works" className="relative overflow-hidden bg-[#080b0d] px-10 py-32">
    <video
      aria-hidden="true"
      autoPlay
      className="absolute inset-0 size-full object-cover opacity-50"
      data-testid="workflow-video"
      loop
      muted
      playsInline
      preload="metadata"
      src={WORKFLOW_VIDEO_SRC}
    />
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(8,11,13,0.82),rgba(8,11,13,0.5)_52%,rgba(8,11,13,0.78))]" />
    <div aria-hidden="true" className="bg-noise pointer-events-none absolute inset-0 opacity-[0.035] mix-blend-screen" />
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9ff5c]/60 to-transparent" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-40 top-20 size-[34rem] rounded-full border border-[#4361ee]/20 bg-[#4361ee]/[0.045] blur-3xl" />
    <div className="relative mx-auto max-w-[1240px]">
      <FadeUp className="grid gap-10 border-b border-white/10 pb-14 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#ff8c81]">The decision sequence</p>
          <h2 className="display-face mt-5 max-w-3xl text-5xl font-bold leading-[0.98] text-[#f4f1ea] lg:text-7xl">A decision becomes a <span className="text-[#c9ff5c]">pull request.</span></h2>
        </div>
        <p className="max-w-sm text-base leading-7 text-white/55">No ticket tennis. No vague handoffs. Just one clear path from the change you want to the code your team needs.</p>
      </FadeUp>

      <div className="mt-14 grid border-y border-white/10 lg:grid-cols-[0.72fr_1.28fr]">
        <FadeUp className="relative flex min-h-[480px] flex-col justify-between border-b border-white/10 py-8 pr-8 lg:border-b-0 lg:border-r lg:py-10 lg:pr-12">
          <div>
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/40">Built for the person making the call</span>
            <p className="display-face mt-8 max-w-sm text-3xl leading-[1.04] text-[#f4f1ea] lg:text-4xl">You should never have to trust a change you cannot see.</p>
          </div>
          <div className="liquid-glass mt-12 max-w-sm rounded-xl p-4">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-white/40">
              <span>Active session</span>
              <span className="text-[#c9ff5c]">Live</span>
            </div>
            <div className="mt-5 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-[#ff5c4d] text-[#14191e]"><MIcon name="visibility" size={18} fill={1} /></span>
              <div>
                <p className="text-sm font-medium text-white">Hero CTA</p>
                <p className="mt-0.5 text-xs text-white/45">coastline.studio/pricing</p>
              </div>
            </div>
          </div>
        </FadeUp>

        <div className="divide-y divide-white/10">
          {workflow.map((step, index) => (
            <FadeUp key={step.number} className="group grid grid-cols-[auto_1fr_auto] gap-6 py-7 pl-0 lg:gap-8 lg:py-8 lg:pl-12" delay={index * 0.06} y={20}>
              <span className="display-face pt-1 text-sm text-white/30">{step.number}</span>
              <div>
                <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-[#ff8c81]">
                  <MIcon name={step.icon} size={14} />
                  {step.label}
                </div>
                <h3 className="mt-3 max-w-lg text-xl font-medium leading-tight text-white lg:text-2xl">{step.title}</h3>
                <p className="mt-2 max-w-xl text-sm leading-6 text-white/50">{step.body}</p>
              </div>
              <span className="mt-1 hidden self-start justify-self-end whitespace-nowrap rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[10px] text-white/55 lg:block">{step.detail}</span>
            </FadeUp>
          ))}
        </div>
      </div>
    </div>
  </section>
);

export const ControlSection = () => (
  <section id="control" className="relative overflow-hidden bg-[#11181d] px-10 py-32">
    <video
      aria-hidden="true"
      autoPlay
      className="absolute inset-0 size-full object-cover opacity-40"
      loop
      muted
      playsInline
      preload="metadata"
      src={CONTROL_VIDEO_SRC}
    />
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(17,24,29,0.84),rgba(17,24,29,0.56)_55%,rgba(17,24,29,0.78))]" />
    <div aria-hidden="true" className="bg-noise pointer-events-none absolute inset-0 opacity-[0.025] mix-blend-screen" />
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
    <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-0 h-[60%] w-[48%] bg-[radial-gradient(circle_at_bottom_left,rgba(255,92,77,0.13),transparent_65%)]" />
    <div className="relative mx-auto max-w-[1240px]">
      <FadeUp className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-end">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#c9ff5c]">The approval boundary</p>
          <h2 className="display-face mt-5 max-w-xl text-5xl font-bold leading-[0.98] text-[#f4f1ea] lg:text-6xl">Every release has a <span className="text-[#ff8c81]">clear yes.</span></h2>
        </div>
        <p className="max-w-xl text-base leading-7 text-white/60">Doable does the creative work in the open. The preview, your approval, and the source change all remain connected, so nothing gets lost between an idea and engineering.</p>
      </FadeUp>

      <FadeUp className="mt-16" y={28}>
        <div className="liquid-glass relative overflow-hidden rounded-2xl p-3 shadow-[0_28px_80px_rgba(0,0,0,0.3)]">
          <div className="relative grid overflow-hidden rounded-xl border border-white/10 bg-[#0a0e10] lg:grid-cols-[0.9fr_1.1fr]">
            <div className="border-b border-white/10 p-7 lg:border-b-0 lg:border-r lg:p-9">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Decision ledger</p>
                <span className="rounded-full bg-[#c9ff5c]/10 px-2.5 py-1 text-[10px] font-medium text-[#d8ff89]">Verified</span>
              </div>
              <div className="mt-10 border-l border-[#c9ff5c]/40 pl-5">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">Selected change</p>
                <p className="mt-3 text-xl leading-tight text-[#f4f1ea]">Hero CTA contrast and copy</p>
                <p className="mt-3 text-sm leading-6 text-white/50">“Make this feel more confident, but keep it calm.”</p>
              </div>
              <div className="mt-6 flex items-center gap-3 border-y border-white/10 py-4">
                <img alt="Shopify" className="size-14 rounded-xl bg-[#10161a] object-contain p-1.5" src={SHOPIFY_LOGO_SRC} />
                <div>
                  <p className="text-sm font-medium text-white">Shopify storefront</p>
                  <p className="mt-0.5 text-xs text-white/45">Release target · storefront theme</p>
                </div>
                <MIcon name="north_east" size={15} className="ml-auto text-white/40" />
              </div>
              <div className="mt-10 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Preview</p>
                  <p className="mt-2 text-sm text-white">Captured</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Approval</p>
                  <p className="mt-2 text-sm text-[#d8ff89]">Ready</p>
                </div>
              </div>
            </div>

            <div className="p-7 lg:p-9">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-white/40">What moves forward</p>
                <MIcon name="lock" size={15} className="text-white/40" />
              </div>
              <div className="mt-2 divide-y divide-white/10">
                {outcomes.map(([title, body], index) => (
                  <FadeUp key={title} delay={index * 0.08} className="grid grid-cols-[auto_1fr_auto] gap-4 py-5" y={14}>
                    <span className="grid size-7 place-items-center rounded-full bg-[#c9ff5c] text-[#10161a]"><MIcon name="check" size={15} weight={700} /></span>
                    <div>
                      <h3 className="text-sm font-medium text-white">{title}</h3>
                      <p className="mt-1 text-xs leading-5 text-white/45">{body}</p>
                    </div>
                    <span className="text-[10px] text-white/35">0{index + 1}</span>
                  </FadeUp>
                ))}
              </div>
              <div className="mt-8 flex items-center justify-between rounded-lg bg-[#c9ff5c] px-4 py-3 text-[#10161a]">
                <span className="text-xs font-semibold">Create pull request</span>
                <MIcon name="arrow_outward" size={17} weight={600} />
              </div>
            </div>
          </div>
          <div aria-hidden="true" className="absolute -bottom-20 -right-16 size-64 rounded-full border border-[#4361ee]/30 bg-[#4361ee]/10 blur-3xl" />
        </div>
      </FadeUp>
    </div>
  </section>
);

export const PricingSection = () => (
  <section id="pricing" className="relative overflow-hidden bg-[#090c0e] px-10 py-32">
    <video
      aria-hidden="true"
      autoPlay
      className="absolute inset-0 size-full object-cover opacity-50"
      loop
      muted
      playsInline
      preload="metadata"
      src={PRICING_VIDEO_SRC}
    />
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,rgba(9,12,14,0.94),rgba(9,12,14,0.58)_52%,rgba(9,12,14,0.88))]" />
    <div aria-hidden="true" className="bg-noise pointer-events-none absolute inset-0 opacity-[0.02] mix-blend-screen" />
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/10" />
    <div aria-hidden="true" className="pointer-events-none absolute -left-32 top-20 size-[32rem] rounded-full border border-[#c9ff5c]/15 bg-[#c9ff5c]/[0.035] blur-3xl" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 size-[28rem] rounded-full border border-[#ff5c4d]/15 bg-[#ff5c4d]/[0.04] blur-3xl" />
    <div className="relative mx-auto max-w-[1240px]">
      <FadeUp className="flex items-end justify-between gap-10 border-b border-white/10 pb-14">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-[#ff8c81]">Simple by design</p>
          <h2 className="display-face mt-5 max-w-3xl text-5xl font-bold leading-[0.98] text-[#f4f1ea] lg:text-6xl">Pricing for the people making the call.</h2>
        </div>
        <div className="hidden items-center gap-3 text-xs text-white/45 lg:flex">
          <img alt="Dodo Payments" className="size-11 rounded-lg bg-[#10161a] object-contain p-1" src={DODO_PAYMENTS_LOGO_SRC} />
          Secure checkout with Dodo Payments
        </div>
      </FadeUp>

      <div className="mt-14 grid gap-3 lg:grid-cols-3">
        {plans.map((plan, index) => (
          <FadeUp key={plan.name} className={cn('relative flex min-h-[470px] flex-col rounded-xl border p-7 backdrop-blur-md', plan.featured ? 'border-[#c9ff5c] bg-[#c9ff5c] text-[#10161a]' : 'border-white/10 bg-[#090c0e]/[0.64] text-white')} delay={index * 0.08} y={20}>
            {plan.featured && <span className="absolute right-5 top-5 rounded-full bg-[#10161a] px-2.5 py-1 text-[10px] font-medium text-[#c9ff5c]">Most popular</span>}
            <p className={cn('text-sm font-medium', plan.featured ? 'text-[#10161a]' : 'text-white')}>{plan.name}</p>
            <div className="mt-8 flex items-end gap-2">
              <p className="display-face text-5xl font-bold leading-none">{plan.price}</p>
              <p className={cn('pb-1 text-xs', plan.featured ? 'text-[#10161a]/65' : 'text-white/45')}>{plan.cadence}</p>
            </div>
            <p className={cn('mt-6 max-w-sm text-sm leading-6', plan.featured ? 'text-[#10161a]/75' : 'text-white/55')}>{plan.description}</p>
            <ul className="mt-8 space-y-3">
              {plan.features.map(feature => (
                <li key={feature} className="flex items-center gap-2.5 text-sm">
                  <span className={cn('grid size-5 place-items-center rounded-full', plan.featured ? 'bg-[#10161a] text-[#c9ff5c]' : 'bg-white/10 text-[#c9ff5c]')}><MIcon name="check" size={13} weight={700} /></span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
            <button className={cn('mt-auto flex items-center justify-between rounded-lg px-4 py-3 text-left text-xs font-semibold transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2', plan.featured ? 'bg-[#10161a] text-white focus-visible:outline-[#10161a]' : 'bg-white text-[#10161a] focus-visible:outline-white')} type="button">
              <span className="flex items-center gap-2"><img alt="Dodo Payments" className="size-7 rounded-md bg-[#10161a] object-contain p-0.5" src={DODO_PAYMENTS_LOGO_SRC} />Start with Dodo</span>
              <MIcon name="arrow_outward" size={16} weight={600} />
            </button>
          </FadeUp>
        ))}
      </div>
    </div>
  </section>
);

export const Footer = () => (
  <footer className="relative overflow-hidden bg-[#070909] px-10 pt-20">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#c9ff5c]/50 to-transparent" />
    <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-0 size-[26rem] rounded-full border border-[#4361ee]/20 bg-[#4361ee]/[0.035] blur-3xl" />
    <div className="relative mx-auto max-w-[1240px]">
      <div className="grid gap-16 pb-20 lg:grid-cols-[1.3fr_0.7fr_0.7fr]">
        <div>
          <a href="#top" className="display-face inline-flex items-center gap-2 text-xl font-bold tracking-[0.08em] text-[#f4f1ea]">
            <span className="grid size-8 place-items-center rounded-md bg-[#ff5c4d] text-sm text-[#14191e]">D</span>
            doable
          </a>
          <p className="display-face mt-8 max-w-md text-3xl leading-[1.04] text-[#f4f1ea]">Make the call. See it before it ships.</p>
          <a className="mt-8 inline-flex items-center gap-2 text-sm text-[#c9ff5c] transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white" href="#top">
            Back to the top <MIcon name="north_east" size={16} />
          </a>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Explore</p>
          <nav className="mt-5 flex flex-col items-start gap-3 text-sm text-white/65" aria-label="Footer navigation">
            <a className="transition-colors hover:text-white" href="#pricing">Pricing</a>
            <a className="transition-colors hover:text-white" href="#how-it-works">How it works</a>
            <a className="transition-colors hover:text-white" href="#control">Approval ledger</a>
          </nav>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Built for clear decisions</p>
          <div className="mt-5 flex items-center gap-2 text-sm text-white/65">
            <MIcon name="visibility" size={17} className="text-[#ff8c81]" /> Preview first
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-white/65">
            <MIcon name="check_circle" size={17} className="text-[#c9ff5c]" /> Approval-bound
          </div>
          <div className="mt-3 flex items-center gap-2 text-sm text-white/65">
            <MIcon name="account_tree" size={17} className="text-[#4361ee]" /> Pull request ready
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/10 py-6 text-[11px] text-white/35">
        <span>© 2026 Doable</span>
        <span>Preview. Approve. Ship.</span>
      </div>
    </div>
  </footer>
);