import { ReactNode } from 'react';

import { motion, useReducedMotion, Variants } from 'framer-motion';

// ease-out-expo — the project motion curve (see globals.css / tailwind.config.js).
export const EASE: [number, number, number, number] = [0.16, 1, 0.3, 1];

export interface RevealProps {
  children: ReactNode;
  className?: string;
  /** Seconds to wait before animating in. */
  delay?: number;
  /** Initial downward offset in px (dropped under reduced-motion). */
  y?: number;
  /** Animate every time it enters the viewport, or just once. */
  once?: boolean;
}

/**
 * Scroll-reveal wrapper: fades (and gently rises) children into view once they
 * cross the viewport.
 *
 * Important: we always render the SAME motion.div on server and client and only
 * tune the values for reduced-motion (drop the translate, keep a short fade).
 * Structurally swapping to a plain div would mismatch the SSR-rendered
 * `opacity: 0` and leave content stuck invisible after hydration.
 */
const Reveal: React.FC<RevealProps> = ({
  children,
  className,
  delay = 0,
  y = 16,
  once = true,
}) => {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: reduced ? 0 : y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once, margin: '-80px' }}
      transition={{
        duration: reduced ? 0.3 : 0.55,
        ease: EASE,
        delay: reduced ? 0 : delay,
      }}
    >
      {children}
    </motion.div>
  );
};

export default Reveal;

// ---------------------------------------------------------------------------
// Staggered variant: a container that reveals its RevealItem children in
// sequence. Use for rows of chips, feature blocks, etc.
// ---------------------------------------------------------------------------

const containerVariants = (stagger: number, delay: number): Variants => ({
  hidden: {},
  show: {
    transition: { staggerChildren: stagger, delayChildren: delay },
  },
});

const itemVariants = (y: number): Variants => ({
  hidden: { opacity: 0, y },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } },
});

export interface RevealStaggerProps {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delay?: number;
}

export const RevealStagger: React.FC<RevealStaggerProps> = ({
  children,
  className,
  stagger = 0.08,
  delay = 0,
}) => (
  <motion.div
    className={className}
    initial="hidden"
    whileInView="show"
    viewport={{ once: true, margin: '-80px' }}
    variants={containerVariants(stagger, delay)}
  >
    {children}
  </motion.div>
);

export interface RevealItemProps {
  children: ReactNode;
  className?: string;
  y?: number;
}

export const RevealItem: React.FC<RevealItemProps> = ({
  children,
  className,
  y = 16,
}) => {
  const reduced = useReducedMotion();

  return (
    <motion.div className={className} variants={itemVariants(reduced ? 0 : y)}>
      {children}
    </motion.div>
  );
};
