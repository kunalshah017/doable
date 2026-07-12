import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { cn } from '../lib/cn';
import { FadeUp, MIcon, PrimaryButton } from './landing-primitives';

const VIDEO_SRC = 'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260314_131748_f2ca2a28-fed7-44c8-b9a9-bd9acdd5ec31.mp4';
const GRASS_SRC = 'https://res.cloudinary.com/dy5er7kv5/image/upload/q_auto/f_auto/v1780586778/cta-bg_mlwy5s.png';
const HERMES_LOGO_SRC = 'https://cdn.jsdelivr.net/gh/selfhst/icons/png/hermes-agent.png';
const SUPERMEMORY_LOGO_SRC = 'https://img.logo.dev/supermemory.ai?token=pk_BShsdiwDTuyRVVBW5GadOg&format=webp&retina=true';
const WISPR_LOGO_SRC = 'https://img.logo.dev/wisprflow.ai?token=pk_BShsdiwDTuyRVVBW5GadOg&format=webp&retina=true';

type ChatMessage = {
  author: 'assistant' | 'user';
  text: string;
};

const seedMessages: ChatMessage[] = [
  {
    author: 'assistant',
    text: 'What would you like to change? Select any element in the page and describe the outcome you need.',
  },
  {
    author: 'user',
    text: 'Make the hero CTA feel more confident without making it louder.',
  },
  {
    author: 'assistant',
    text: 'Preview ready. I improved the contrast, tightened the copy, and kept the change reversible until you approve it.',
  },
];

type ChatPanelProps = {
  initialScroll?: 'top' | 'bottom';
  animateMessagesIn?: boolean;
};

const ToolIcon = ({ alt, fallback, src }: { alt: string; fallback: string; src: string }) => (
  <span className="relative grid size-10 place-items-center overflow-hidden rounded-lg border border-white/10 bg-[#10161a] text-white" title={alt}>
    <MIcon name={fallback} size={18} fill={1} />
    <img alt="" className="absolute inset-0 size-full object-contain p-1" onError={event => { event.currentTarget.style.display = 'none'; }} src={src} />
  </span>
);

export const ChatPanel = ({ initialScroll = 'bottom', animateMessagesIn = false }: ChatPanelProps) => {
  const [isListening, setIsListening] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollArea = scrollAreaRef.current;
    if (!scrollArea) return;

    scrollArea.scrollTop = initialScroll === 'top' ? 0 : scrollArea.scrollHeight;
  }, [initialScroll]);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-white/10 bg-[rgba(8,8,10,0.6)] p-3 backdrop-blur-3xl sm:p-4">
      <div className="flex items-center gap-2.5 border-b border-white/10 pb-3">
        <ToolIcon alt="Hermes" fallback="auto_awesome" src={HERMES_LOGO_SRC} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-white">Doable agency</p>
          <p className="truncate text-[11px] text-white/40">Preview website changes before they ship</p>
        </div>
        <div className="flex items-center gap-1.5" aria-label="Agent tools">
          <ToolIcon alt="Supermemory" fallback="memory" src={SUPERMEMORY_LOGO_SRC} />
        </div>
      </div>
      <div ref={scrollAreaRef} className="scrollbar-hide flex-1 space-y-4 overflow-y-auto px-1 py-5 sm:px-0">
        {seedMessages.map((message, index) => {
          const bubble = (
            <div
              className={cn(
                'max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
                message.author === 'user'
                  ? 'ml-auto bg-white/15 text-white/90'
                  : 'border border-white/5 bg-white/5 text-white/70',
              )}>
              {message.text}
            </div>
          );

          return animateMessagesIn ? <FadeUp key={`${message.text}-${index}`} delay={index * 0.12} y={16}>{bubble}</FadeUp> : <div key={`${message.text}-${index}`}>{bubble}</div>;
        })}
      </div>
      <div className="liquid-glass mt-2 mb-10 flex items-center gap-3 rounded-2xl p-2.5">
        <ToolIcon alt="Wispr Flow" fallback="mic" src={WISPR_LOGO_SRC} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1" aria-hidden="true">
            {[8, 14, 20, 12, 17, 9].map((height, index) => (
              <span key={height} className={cn('voice-wave inline-block w-0.5 origin-center rounded-full bg-[#c9ff5c]', !isListening && 'opacity-60')} style={{ height, animationDelay: `${index * 85}ms` }} />
            ))}
          </div>
          <p className="mt-1 text-[10px] font-medium text-white">Wispr Flow</p>
          <p className="truncate text-[10px] text-white/40">{isListening ? 'Listening for your request...' : 'Tap to describe the change out loud'}</p>
        </div>
        <button
          aria-label={isListening ? 'Stop voice request' : 'Start voice request'}
          aria-pressed={isListening}
          className={cn('rounded-xl p-2.5 text-black transition-transform hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white', isListening ? 'bg-[#ff8c81]' : 'bg-white')}
          onClick={() => setIsListening(currentState => !currentState)}
          type="button">
          <MIcon name={isListening ? 'stop' : 'mic'} size={16} weight={600} />
        </button>
      </div>
    </div>
  );
};

export const VelorahHeroPreview = () => (
  <div className="relative h-full w-full overflow-hidden rounded-2xl" style={{ backgroundColor: 'hsl(201 100% 13%)' }}>
    <video autoPlay className="absolute inset-0 z-0 size-full object-cover" loop muted playsInline preload="auto" src={VIDEO_SRC} />
    <div className="absolute inset-0 z-[1] bg-[linear-gradient(to_bottom,rgba(0,0,0,0.2),rgba(0,0,0,0.05)_45%,rgba(0,0,0,0.35))]" />
    <nav className="relative z-10 flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 md:px-6 md:py-4">
      <span className="font-['Instrument_Serif'] text-sm tracking-tight text-white sm:text-base md:text-lg">Velorah<sup className="text-[0.5em]">®</sup></span>
      <div className="hidden items-center gap-3 text-[9px] text-white/60 md:flex lg:gap-4 lg:text-[10px]">
        <span className="text-white">Home</span>
        <span className="transition-colors hover:text-white">Studio</span>
        <span className="transition-colors hover:text-white">About</span>
        <span className="transition-colors hover:text-white">Journal</span>
        <span className="transition-colors hover:text-white">Reach Us</span>
      </div>
      <span className="liquid-glass rounded-full px-2.5 py-1 text-[9px] text-white sm:px-3 sm:text-[10px]">Begin Journey</span>
    </nav>
    <div className="relative z-10 flex flex-col items-center px-3 pb-6 pt-3 text-center sm:px-4 sm:pb-6 sm:pt-5 md:pb-6 md:pt-7">
      <h1 className="animate-fade-rise max-w-[90%] font-['Instrument_Serif'] text-lg font-normal leading-[0.95] tracking-[-0.03em] text-white sm:text-2xl md:text-3xl lg:text-4xl">
        Where <em className="not-italic text-white/55">dreams</em> rise <em className="not-italic text-white/55">through the silence.</em>
      </h1>
      <p className="animate-fade-rise-delay mt-2 max-w-[80%] text-[9px] leading-relaxed text-white/60 sm:mt-3 sm:max-w-sm sm:text-[11px] md:mt-4 md:max-w-md md:text-xs">
        We&apos;re designing tools for deep thinkers, bold creators, and quiet rebels. Amid the chaos, we build digital spaces for sharp focus and inspired work.
      </p>
      <button type="button" className="animate-fade-rise-delay-2 liquid-glass mt-3 rounded-full px-4 py-1.5 text-[9px] text-white sm:mt-4 sm:px-5 sm:py-2 sm:text-[10px] md:mt-5 md:px-6 md:py-2.5">Begin Journey</button>
    </div>
  </div>
);

export const CtaDashboardMock = () => (
  <div className="liquid-glass mx-auto aspect-[16/9] w-full max-w-[1100px] overflow-hidden rounded-2xl p-3">
    <div className="grid h-full grid-cols-[minmax(220px,320px)_1fr] gap-3">
      <div className="min-h-0"><ChatPanel animateMessagesIn initialScroll="top" /></div>
      <div className="min-h-0"><VelorahHeroPreview /></div>
    </div>
  </div>
);

export const CtaSection = () => {
  const sectionRef = useRef<HTMLElement>(null);
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start end', 'end start'] });
  const dashboardY = useTransform(scrollYProgress, [0, 1], ['120px', '-120px']);
  const grassY = useTransform(scrollYProgress, [0, 1], ['200px', '-200px']);

  return (
    <section ref={sectionRef} id="top" className="relative min-h-[900px] w-full overflow-hidden" style={{ background: 'linear-gradient(to bottom, #10161a 0%, #14191E 100%)' }}>
      <div className="signal-field pointer-events-none absolute inset-0 opacity-55" aria-hidden="true" />
      <div className="relative z-40 mx-auto max-w-[1240px] px-10 pt-8">
        <nav className="liquid-glass flex items-center justify-between rounded-full px-5 py-3" aria-label="Primary navigation">
          <a href="#top" className="display-face inline-flex items-center gap-2 text-lg font-bold tracking-[0.08em] text-[#f4f1ea]">
            <span className="grid size-6 place-items-center rounded-md bg-[#ff5c4d] text-xs text-[#14191e]">D</span>
            doable
          </a>
          <div className="flex items-center gap-6 text-sm text-white/60">
            <a className="transition-colors hover:text-white" href="#how-it-works">How it works</a>
            <a className="transition-colors hover:text-white" href="#control">Why managers use it</a>
          </div>
          <PrimaryButton as="button" size="sm">Join the demo</PrimaryButton>
        </nav>
        <div className="grid grid-cols-2 items-start gap-8 pt-36">
          <div className="relative z-40 -mt-8 max-w-[440px]">
            <FadeUp>
              <h1 className="display-face text-6xl font-bold leading-[0.95] tracking-normal text-[#f4f1ea]">
                Make the call. <span className="text-[#ff5c4d]">See it before it ships.</span>
              </h1>
            </FadeUp>
            <FadeUp delay={0.1}>
              <p className="mt-6 max-w-[400px] text-lg leading-[1.5] text-landing-text">Request a change, review it live, then approve the pull request.</p>
            </FadeUp>
            <FadeUp className="mt-10" delay={0.2}>
              <PrimaryButton as="button">Join the demo</PrimaryButton>
            </FadeUp>
            <p className="mt-7 text-xs text-white/45">No repository setup. No production changes until you say so.</p>
          </div>
        </div>
      </div>
      <motion.div
        className="absolute right-[-10%] top-[150px] z-10 w-[68%]"
        style={{ y: dashboardY }}>
        <CtaDashboardMock />
      </motion.div>
      <motion.img
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-[-230px] z-30 w-full select-none object-cover"
        src={GRASS_SRC}
        style={{ y: grassY }}
      />
    </section>
  );
};