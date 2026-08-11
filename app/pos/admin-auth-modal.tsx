'use client'

import { useEffect, useState, type FormEvent, type KeyboardEvent } from 'react'

type AdminAuthModalProps = {
  open: boolean
  title: string
  description: string
  submitting: boolean
  error: string | null
  onCancel: () => void
  onConfirm: (input: { username: string; password: string }) => void
}

export const AdminAuthModal = ({
  open,
  title,
  description,
  submitting,
  error,
  onCancel,
  onConfirm
}: AdminAuthModalProps) => {
  const [username, setUsername] = useState('admin')
  const [password, setPassword] = useState('')

  useEffect(() => {
    if (!open) return
    setUsername('admin')
    setPassword('')
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent | globalThis.KeyboardEvent) => {
      if (event.key === 'Escape' && !submitting) onCancel()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, submitting, onCancel])

  if (!open) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting) return
    onConfirm({ username: username.trim() || 'admin', password })
  }

  return (
    <>
      <div className='fixed inset-0 z-[130] bg-slate-950/70' aria-hidden='true' onClick={() => !submitting && onCancel()} />
      <section
        role='dialog'
        aria-modal='true'
        aria-label={title}
        className='fixed left-1/2 top-1/2 z-[140] w-[min(420px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl'
      >
        <h2 className='text-lg font-semibold text-slate-950'>{title}</h2>
        <p className='mt-1 text-sm text-slate-600'>{description}</p>

        <form onSubmit={handleSubmit} className='mt-4 space-y-3'>
          <div>
            <label htmlFor='admin-override-username' className='text-xs font-medium text-slate-500'>
              Usuario administrador
            </label>
            <input
              id='admin-override-username'
              value={username}
              onChange={event => setUsername(event.target.value)}
              autoComplete='username'
              className='mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'
            />
          </div>
          <div>
            <label htmlFor='admin-override-password' className='text-xs font-medium text-slate-500'>
              Clave de administrador
            </label>
            <input
              id='admin-override-password'
              type='password'
              value={password}
              onChange={event => setPassword(event.target.value)}
              autoComplete='current-password'
              autoFocus
              required
              minLength={8}
              className='mt-1 h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100'
            />
          </div>

          {error ? (
            <p role='alert' className='rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700'>
              {error}
            </p>
          ) : null}

          <div className='flex gap-2 pt-1'>
            <button
              type='button'
              onClick={onCancel}
              disabled={submitting}
              aria-label='Cancelar autorización'
              className='h-11 flex-1 rounded-lg border border-slate-300 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50'
            >
              Cancelar
            </button>
            <button
              type='submit'
              disabled={submitting || password.trim().length < 8}
              aria-label='Confirmar clave de administrador'
              className='h-11 flex-1 rounded-lg bg-emerald-600 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50'
            >
              {submitting ? 'Validando…' : 'Autorizar'}
            </button>
          </div>
        </form>
      </section>
    </>
  )
}
