import type { ButtonHTMLAttributes, ReactNode } from 'react'

/**
 * Rank, not decoration.
 *
 * A button's appearance says how much it is asking for, and the ranks are
 * ordered: there is exactly ONE `filled` button on a screen at a time — the
 * thing to do here — and everything else steps down from it. Before this, most
 * screens had either three filled buttons or none, which is the same problem
 * twice: nothing to aim at.
 *
 *   filled   the one action this screen exists for
 *   tinted   important, but not the one
 *   gray     neutral; a change of view, a cancel
 *   plain    a way out, or a repeated action inside a row
 *   danger   destructive; never dressed as the primary
 */
export type ButtonVariant = 'filled' | 'tinted' | 'gray' | 'plain' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

const VARIANT: Record<ButtonVariant, string> = {
  filled: 'btn-filled',
  tinted: 'btn-tinted',
  gray: 'btn-gray',
  plain: 'btn-plain',
  danger: 'btn-danger',
}

const SIZE: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: 'btn-md',
  lg: 'btn-lg',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  /** a mark before the label; kept optional and rare */
  icon?: ReactNode
  /** stretch to the width of its container — phone-width forms, sheet footers */
  block?: boolean
  /** shows a quiet working state without changing the button's width */
  busy?: boolean
}

export default function Button({
  variant = 'gray',
  size = 'md',
  icon,
  block,
  busy,
  className = '',
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={[VARIANT[variant], SIZE[size], block ? 'w-full' : '', className].join(' ')}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  )
}

/**
 * The working indicator. Deliberately a ring rather than a row of dots: it
 * occupies a fixed square, so a button never changes width when it starts
 * working and the layout never jumps under the cursor.
 */
export function Spinner({ className = '' }: { className?: string }) {
  return (
    <span
      className={['inline-block size-4 shrink-0 rounded-full border-2 border-current', className].join(
        ' ',
      )}
      style={{
        borderTopColor: 'transparent',
        animation: 'rb-spin 700ms linear infinite',
      }}
      aria-hidden
    />
  )
}
