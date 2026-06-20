import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface TooltipProps {
  content: string;
  children: React.ReactElement;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

export function Tooltip({
  content,
  children,
  position = 'top',
  className,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    
    // 300ms delay to prevent flashing tooltips on quick sweeps
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsVisible(false);
  };

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2.5',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2.5',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2.5',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2.5',
  };

  const animationVariants = {
    hidden: { 
      opacity: 0, 
      scale: 0.94,
      y: position === 'top' ? 4 : position === 'bottom' ? -4 : 0,
      x: position === 'left' ? 4 : position === 'right' ? -4 : 0,
    },
    visible: { 
      opacity: 1, 
      scale: 1,
      y: 0,
      x: 0,
    },
  };

  // Inject hover and focus events into the trigger element
  const childProps = children.props as any;
  const trigger = React.cloneElement(children, {
    onMouseEnter: (e: React.MouseEvent) => {
      handleMouseEnter();
      if (childProps.onMouseEnter) childProps.onMouseEnter(e);
    },
    onMouseLeave: (e: React.MouseEvent) => {
      handleMouseLeave();
      if (childProps.onMouseLeave) childProps.onMouseLeave(e);
    },
    onFocus: (e: React.FocusEvent) => {
      setIsVisible(true);
      if (childProps.onFocus) childProps.onFocus(e);
    },
    onBlur: (e: React.FocusEvent) => {
      setIsVisible(false);
      if (childProps.onBlur) childProps.onBlur(e);
    },
  } as any);

  return (
    <div className="relative inline-flex items-center justify-center">
      {trigger}
      <AnimatePresence>
        {isVisible && (
          <motion.div
            initial="hidden"
            animate="visible"
            exit="hidden"
            variants={animationVariants}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className={cn(
              "absolute z-[99] pointer-events-none whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[11px] font-medium tracking-wide shadow-[0_8px_24px_rgba(0,0,0,0.22)] border backdrop-blur-md",
              "bg-zinc-900/90 text-zinc-100 border-white/10",
              positionClasses[position],
              className
            )}
          >
            {content}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
