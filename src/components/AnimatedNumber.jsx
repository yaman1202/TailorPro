import { useEffect, useState } from 'react'

function formatValue(value, { currency, style, suffix }) {
  const options = style === 'currency'
    ? { style: 'currency', currency, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 }
  const formatted = new Intl.NumberFormat('en-IN', options).format(value)
  return `${formatted}${suffix || ''}`
}

export default function AnimatedNumber({ value, currency, style = 'number', suffix = '', duration = 1100 }) {
  const [displayValue, setDisplayValue] = useState(0)

  useEffect(() => {
    let frameId
    let startTime

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || value <= 0) {
      frameId = window.requestAnimationFrame(() => setDisplayValue(value))
      return () => window.cancelAnimationFrame(frameId)
    }

    if (!Number.isFinite(value)) {
      frameId = window.requestAnimationFrame(() => setDisplayValue(0))
      return () => window.cancelAnimationFrame(frameId)
    }

    const animate = (timestamp) => {
      if (startTime === undefined) startTime = timestamp
      const progress = Math.min((timestamp - startTime) / duration, 1)
      const easedProgress = 1 - (1 - progress) ** 3
      setDisplayValue(value * easedProgress)
      if (progress < 1) frameId = window.requestAnimationFrame(animate)
    }

    frameId = window.requestAnimationFrame(animate)
    return () => window.cancelAnimationFrame(frameId)
  }, [currency, duration, value])

  return <span aria-label={formatValue(value, { currency, style, suffix })} aria-live="off">
    {formatValue(displayValue, { currency, style, suffix })}
  </span>
}
