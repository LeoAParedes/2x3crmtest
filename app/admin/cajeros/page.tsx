import { redirect } from 'next/navigation'

export default function CajerosRedirectPage() {
  redirect('/configuracion?tab=cajeros')
}
