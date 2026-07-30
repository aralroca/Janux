/** @jsxImportSource react */
import type { ComponentProps } from 'react';

type Variant = 'default' | 'ghost';
type Size = 'default' | 'sm';

const VARIANTS: Record<Variant, string> = {
  default: 'bg-primary text-primary-foreground',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
};

const SIZES: Record<Size, string> = { default: 'h-9 px-4 py-2', sm: 'h-8 rounded-md px-3' };

/**
 * The shape `bunx shadcn@latest add button` really emits: a plain `<button>`
 * carrying `data-slot` and the variant classes. Kept to the parts the docs
 * page claims — the generated file's own dependencies (`cva`, `radix-ui`) are
 * not installed here, and mocking them would prove less than this does.
 */
export function Button({
  variant = 'default',
  size = 'default',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: Variant; size?: Size }) {
  return (
    <button
      data-slot="button"
      data-variant={variant}
      className={[VARIANTS[variant], SIZES[size], className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
