import { useEffect, useRef, useState } from 'react'

/**
 * 6 haneli kod girişi — oyun PIN'i gibi, tek kutu gibi değil.
 *
 * Neden: bu ekran arkadaşların uygulamayı ilk gördüğü yer. Tek bir metin alanı
 * "form" gibi duruyor; ayrı kutular basmaya davet ediyor ve her hane girildiğinde
 * ilerlediğini görüyorsun.
 *
 * Davranış: otomatik ilerleme, backspace ile geri gitme, tam kodu yapıştırma,
 * ok tuşlarıyla gezinme, altıncı hane girilince otomatik gönderme.
 */
export default function CodeInput({
  value,
  onChange,
  onComplete,
  disabled = false,
  autoFocus = false,
}: {
  value: string
  onChange: (v: string) => void
  onComplete?: (v: string) => void
  disabled?: boolean
  autoFocus?: boolean
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([])
  const [focused, setFocused] = useState<number | null>(null)
  const digits = value.padEnd(6, ' ').slice(0, 6).split('')

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus()
  }, [autoFocus])

  function setAt(i: number, d: string) {
    const next = value.padEnd(6, ' ').split('')
    next[i] = d
    const joined = next.join('').replace(/\s/g, '')
    onChange(joined)
    return joined
  }

  function handleInput(i: number, raw: string) {
    const only = raw.replace(/\D/g, '')
    if (!only) return

    // a full code pasted (or typed fast) into one box
    if (only.length > 1) {
      const code = only.slice(0, 6)
      onChange(code)
      const land = Math.min(code.length, 5)
      refs.current[land]?.focus()
      if (code.length === 6) onComplete?.(code)
      return
    }

    const joined = setAt(i, only)
    if (i < 5) refs.current[i + 1]?.focus()
    if (joined.length === 6) onComplete?.(joined)
  }

  function handleKey(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      e.preventDefault()
      const chars = value.padEnd(6, ' ').split('')
      if (chars[i] && chars[i] !== ' ') {
        setAt(i, ' ')
      } else if (i > 0) {
        setAt(i - 1, ' ')
        refs.current[i - 1]?.focus()
      }
      return
    }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus()
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus()
  }

  return (
    <div className="flex gap-2 justify-center" role="group" aria-label="6 haneli kod">
      {digits.map((d, i) => {
        const filled = d !== ' '
        return (
          <input
            key={i}
            ref={(el) => {
              refs.current[i] = el
            }}
            value={filled ? d : ''}
            onChange={(e) => handleInput(i, e.target.value)}
            onKeyDown={(e) => handleKey(i, e)}
            onFocus={() => setFocused(i)}
            onBlur={() => setFocused(null)}
            onPaste={(e) => {
              e.preventDefault()
              handleInput(i, e.clipboardData.getData('text'))
            }}
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={6}
            disabled={disabled}
            aria-label={`${i + 1}. hane`}
            className={[
              // generous touch target: 48x56 minimum
              'w-12 h-14 sm:w-14 sm:h-16 rounded-md text-center',
              'text-title-2 nums outline-none bg-fill-3 text-label',
              'transition-[background-color,box-shadow,transform] duration-150',
              filled ? 'shadow-[inset_0_0_0_1px_var(--color-sep)]' : '',
              focused === i
                ? 'shadow-[inset_0_0_0_2px_var(--tint)] scale-105 bg-fill-2'
                : '',
              disabled ? 'opacity-50' : '',
            ].join(' ')}
          />
        )
      })}
    </div>
  )
}
