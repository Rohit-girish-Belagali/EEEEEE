const TONE = {
  red: 'text-red',
  green: 'text-green',
  amber: 'text-amber',
  muted: 'text-muted',
}

/**
 * Concentric rings anchored to the hero's top-left corner. The resting rings are
 * always there; a new `pulse` value sends one set outward.
 */
export default function Ripple({ pulse, tone = 'muted' }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className={`absolute -left-[28rem] -top-[30rem] h-[56rem] w-[56rem] ${TONE[tone] ?? TONE.muted}`}>
        {[0.28, 0.46, 0.64, 0.82, 1].map((scale) => (
          <span key={scale} className="ripple-ring opacity-[0.07]" style={{ transform: `scale(${scale})` }} />
        ))}
        {pulse > 0 &&
          [0, 0.18, 0.36].map((delay) => (
            <span
              key={`${pulse}-${delay}`}
              className="ripple-ring ripple-ring--pulse"
              style={{ animationDelay: `${delay}s` }}
            />
          ))}
      </div>
    </div>
  )
}
