import React from 'react';
import { clsx } from 'clsx';
import { Slot } from '@radix-ui/react-slot';

const Button = React.forwardRef(({ 
  variant = 'primary', 
  size = 'md', 
  pill = false,
  fullWidth = false,
  loading = false,
  asChild = false,
  leftIcon,
  rightIcon,
  children,
  className = '',
  disabled,
  type = 'button',
  ...props 
}, ref) => {
  const baseStyles = 'inline-flex shrink-0 items-center justify-center whitespace-nowrap font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-blue focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-brand-orange text-white shadow-sm hover:bg-brand-orange-dark active:bg-brand-orange-dark',
    primaryBlue: 'bg-brand-blue text-white hover:bg-brand-blue-hover active:bg-brand-blue-dark',
    secondary: 'bg-transparent border border-brand-blue text-brand-blue hover:bg-brand-blue-tint active:bg-brand-blue-tint',
    ghost: 'bg-transparent text-brand-gray hover:bg-brand-tint hover:text-brand-dark active:bg-brand-tint',
    outline: 'bg-transparent border border-brand-border text-brand-dark hover:bg-brand-tint hover:border-brand-blue',
    danger: 'bg-brand-red text-white hover:bg-red-700 active:bg-red-800',
    dangerGhost: 'bg-transparent text-brand-red hover:bg-brand-red-tint',
  };

  const sizes = {
    sm: 'h-9 px-3.5 text-[13px] gap-1',
    md: 'h-10 px-5 text-sm gap-1.5',
    lg: 'h-11 px-6 text-sm gap-2',
    xl: 'px-8 py-4 text-body gap-2',
  };

  const radius = pill ? 'rounded-full' : 'rounded-[var(--radius-btn)]';

  const Comp = asChild ? Slot : 'button';

  // Slot accepts a single child, so link buttons skip the spinner and icons.
  if (asChild) {
    return (
      <Slot ref={ref} className={clsx(baseStyles, variants[variant], sizes[size], radius, fullWidth ? 'w-full' : '', className)} {...props}>
        {children}
      </Slot>
    );
  }

  return (
    <Comp
      ref={ref}
      type={asChild ? undefined : type}
      disabled={disabled || loading}
      className={clsx(baseStyles, variants[variant], sizes[size], radius, fullWidth ? 'w-full' : '', className)}
      {...props}
    >
      {loading && (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      )}
      {!loading && leftIcon && <span className="flex-shrink-0">{leftIcon}</span>}
      {children}
      {!loading && rightIcon && <span className="flex-shrink-0">{rightIcon}</span>}
    </Comp>
  );
});

Button.displayName = 'Button';

export default Button;