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
      className='h-11 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-400'
    >
      {pending ? 'Validando...' : 'Iniciar sesión'}
    </button>
  )
}

export const LoginForm = () => {
  const [state, formAction] = useActionState(loginAction, initialState)

  return (
    <form action={formAction} className='grid gap-4'>
      <label className='grid gap-1.5 text-sm font-medium text-slate-700'>
        Usuario
        <input
          name='username'
          type='text'
          required
          autoComplete='username'
          maxLength={20}
          className='h-11 rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
        />
      </label>
      <label className='grid gap-1.5 text-sm font-medium text-slate-700'>
        Contraseña
        <input
          name='password'
          type='password'
          required
          autoComplete='current-password'
          minLength={8}
          maxLength={128}
          className='h-11 rounded-lg border border-slate-300 px-3 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100'
        />
      </label>
      <div aria-live='polite' className='min-h-5 text-sm text-red-700'>
        {state.error}
      </div>
      <SubmitButton />
    </form>
  )
}
