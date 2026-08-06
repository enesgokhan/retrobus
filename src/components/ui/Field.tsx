import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'

/**
 * Labelled inputs.
 *
 * A field is a RECESSED surface — darker than the thing holding it, the
 * opposite of a button. That one inversion is what makes a form legible at a
 * glance: everything you press stands up, everything you fill sinks in.
 *
 * The label is part of the component rather than left to each caller, because
 * it was left to each caller and consequently existed on about half of them.
 */
export function Field({
  label,
  hint,
  error,
  className = '',
  ...rest
}: {
  label?: string
  /** a quiet line under the field explaining the rule before it is broken */
  hint?: ReactNode
  /** replaces the hint when present, in the error colour */
  error?: string | null
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className={['block', className].join(' ')}>
      {label && <span className="block text-subhead text-label-2 mb-1.5">{label}</span>}
      <input
        className="field"
        aria-invalid={error ? true : undefined}
        style={error ? { boxShadow: 'inset 0 0 0 1px var(--color-bad)' } : undefined}
        {...rest}
      />
      {error ? (
        <span className="block text-footnote text-bad mt-1.5">{error}</span>
      ) : hint ? (
        <span className="block text-footnote text-label-3 mt-1.5">{hint}</span>
      ) : null}
    </label>
  )
}

/**
 * The composer. Bigger type than a form field because what goes into it is the
 * content of the evening, not a setting — and it auto-grows, so a long thought
 * is never typed through a two-line window.
 */
export function TextArea({
  label,
  hint,
  error,
  className = '',
  ...rest
}: {
  label?: string
  hint?: ReactNode
  error?: string | null
} & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <label className={['block', className].join(' ')}>
      {label && <span className="block text-subhead text-label-2 mb-1.5">{label}</span>}
      <textarea
        className="field-lg resize-none"
        rows={3}
        aria-invalid={error ? true : undefined}
        onInput={(e) => {
          const el = e.currentTarget
          el.style.height = 'auto'
          el.style.height = `${Math.min(el.scrollHeight, 320)}px`
        }}
        {...rest}
      />
      {error ? (
        <span className="block text-footnote text-bad mt-1.5">{error}</span>
      ) : hint ? (
        <span className="block text-footnote text-label-3 mt-1.5">{hint}</span>
      ) : null}
    </label>
  )
}
