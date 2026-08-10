'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'

import { loginAction, type LoginState } from '@/app/login/actions'

const initialState: LoginState = {}

const SubmitButton = () => {
  const { pending } = useFormStatus()

  return (
    <button
      type='submit'
      disabled={pending}
      aria-label='Iniciar sesión'
      className='h-11 rounded-xl bg-emerald-400 px-4 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300'
    >
      {pending ? 'Validando...' : 'Iniciar sesión'}
    </button>
  )
}

export const LoginForm = () => {
  const [state, formAction] = useActionState(loginAction, initialState)

  return (
    <form action={formAction} className='grid gap-4'>
      <label className='grid gap-1.5 text-sm font-medium text-slate-200'>
        Usuario
        <input
          name='username'
          type='text'
          required
          autoComplete='username'
          maxLength={20}
          className='h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-900'
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
          className='h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-slate-100 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-900'
        />
      </label>
      <div aria-live='polite' className='min-h-5 text-sm text-rose-300'>
        {state.error}
      </div>
      <SubmitButton />
    </form>
  )
}
