import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../lib/cn';

type FadeUpProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
};

export const FadeUp = ({ children, className, delay = 0, y }: FadeUpProps) => (
  <motion.div
    className={className}
    initial={{ opacity: 0, y: y ?? 24 }}
    whileInView={{ opacity: 1, y: 0 }}
    viewport={{ once: true, amount: 0.3 }}
    transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}>
    {children}
  </motion.div>
);

type MIconProps = {
  name: string;
  size?: number;
  fill?: number;
  weight?: number;
  grade?: number;
  opticalSize?: number;
  className?: string;
};

export const MIcon = ({
  name,
  size = 20,
  fill = 0,
  weight = 400,
  grade = 0,
  opticalSize = 24,
  className,
}: MIconProps) => (
  <span
    aria-hidden="true"
    className={cn('material-symbols-outlined inline-flex select-none leading-none', className)}
    style={{
      fontSize: size,
      fontVariationSettings: `'FILL' ${fill}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${opticalSize}`,
    }}>
    {name}
  </span>
);

export const AnimatedText = ({ children }: { children: ReactNode }) => (
  <span className="relative block overflow-hidden">
    <span className="block transition-transform duration-200 ease-out group-hover:-translate-y-full">{children}</span>
    <span aria-hidden="true" className="absolute inset-x-0 top-full block transition-transform duration-200 ease-out group-hover:-translate-y-full">
      {children}
    </span>
  </span>
);

type ButtonSize = 'sm' | 'md' | 'lg';
type CommonPrimaryButtonProps = {
  children: ReactNode;
  className?: string;
  size?: ButtonSize;
};

type AnchorPrimaryButtonProps = CommonPrimaryButtonProps &
  ComponentPropsWithoutRef<'a'> & {
    as?: 'a';
  };

type NativePrimaryButtonProps = CommonPrimaryButtonProps &
  ComponentPropsWithoutRef<'button'> & {
    as: 'button';
  };

export type PrimaryButtonProps = AnchorPrimaryButtonProps | NativePrimaryButtonProps;

const sizes: Record<ButtonSize, string> = {
  sm: 'h-9 px-5 text-xs',
  md: 'h-10 px-7 text-sm',
  lg: 'h-12 px-9 text-sm',
};

export const PrimaryButton = ({ children, className, size = 'lg', as = 'a', ...props }: PrimaryButtonProps) => {
  const buttonClassName = cn(
    'group inline-flex items-center justify-center rounded-full bg-white/80 leading-none text-black transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white',
    sizes[size],
    className,
  );

  if (as === 'button') {
    return (
      <button className={buttonClassName} type="button" {...(props as NativePrimaryButtonProps)}>
        <AnimatedText>{children}</AnimatedText>
      </button>
    );
  }

  return (
    <a className={buttonClassName} href="#cta" {...(props as AnchorPrimaryButtonProps)}>
      <AnimatedText>{children}</AnimatedText>
    </a>
  );
};