'use client'

import { useEffect, useState } from 'react'

type PosClockProps = {
  className?: string
}

const formatClock = (date: Date) =>
  new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date)

export const PosClock = ({ className = '' }: PosClockProps) => {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => {
      window.clearInterval(timerId)
    }
  }, [])

  return (
    <time
      dateTime={now.toISOString()}
      aria-label='Reloj del sistema'
      className={`font-mono tabular-nums tracking-tight text-slate-800 ${className}`}
    >
      {formatClock(now)}
    </time>
  )
}
