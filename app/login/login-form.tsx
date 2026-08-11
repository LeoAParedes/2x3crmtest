'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'

import { loginAction, type LoginState } from '@/app/login/actions'

const initialState: LoginState = {}

const SubmitButton = ({ hasError }: { hasError: boolean }) => {
  // useFormStatus must live inside a child of <form> to reflect the form's pending state
  const { pending } = useFormStatus()

  return (
    <button
      type='submit'
      disabled={pending}
      aria-label='Iniciar sesión'
      aria-busy={pending}
      className={`h-11 rounded-xl px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 disabled:cursor-not-allowed ${
        pending
          ? 'bg-slate-700 text-slate-300'
          : hasError
            ? 'bg-rose-500 text-white hover:bg-rose-400'
            : 'bg-emerald-400 text-slate-950 hover:bg-emerald-300'
      }`}
    >
      {pending ? (
        <span className='flex items-center justify-center gap-2'>
          <span
            aria-hidden='true'
            className='inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-400 border-t-slate-200'
          />
          Validando...
        </span>
      ) : hasError ? (
        'Reintentar'
      ) : (
        'Iniciar sesión'
      )}
    </button>
  )
}

export const LoginForm = () => {
  const [state, formAction] = useActionState(loginAction, initialState)
  const hasError = Boolean(state.error)
  const usernameRef = useRef<HTMLInputElement>(null)

  // Return focus to username field when an error is reported so the user can correct
  useEffect(() => {
    if (state.error) {
      usernameRef.current?.focus()
    }
  }, [state.error])

  return (
    <form action={formAction} noValidate className='grid gap-4' aria-label='Formulario de acceso'>
      <label className='grid gap-1.5 text-sm font-medium text-slate-200'>
        Usuario
        <input
          ref={usernameRef}
          name='username'
          type='text'
          required
          autoComplete='username'
          autoFocus
          maxLength={20}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? 'login-error' : undefined}
          className={`h-11 rounded-xl border bg-slate-950 px-3 text-slate-100 outline-none transition focus:ring-2 ${
            hasError
              ? 'border-rose-500 focus:border-rose-400 focus:ring-rose-900'
              : 'border-slate-700 focus:border-emerald-400 focus:ring-emerald-900'
          }`}
        />
      </label>

      <label className='grid gap-1.5 text-sm font-medium text-slate-200'>
        Contraseña
        <input
          name='password'
          type='password'
          required
          autoComplete='current-password'
          minLength={8}
          maxLength={128}
          aria-invalid={hasError || undefined}
          aria-describedby={hasError ? 'login-error' : undefined}
          className={`h-11 rounded-xl border bg-slate-950 px-3 text-slate-100 outline-none transition focus:ring-2 ${
            hasError
              ? 'border-rose-500 focus:border-rose-400 focus:ring-rose-900'
              : 'border-slate-700 focus:border-emerald-400 focus:ring-emerald-900'
          }`}
        />
      </label>

      <div
        id='login-error'
        role='alert'
        aria-live='assertive'
        aria-atomic='true'
        className={`min-h-[2.25rem] rounded-lg px-3 py-2 text-sm font-medium transition-all ${
          hasError ? 'bg-rose-950/60 text-rose-300' : 'text-transparent'
        }`}
      >
        {state.error ?? '\u00A0'}
      </div>

      <SubmitButton hasError={hasError} />
    </form>
  )
}
