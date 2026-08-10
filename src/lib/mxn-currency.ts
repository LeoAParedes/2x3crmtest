const mxnCurrencyFormatter = new Intl.NumberFormat('es-MX', {
  style: 'currency',
  currency: 'MXN'
})

export const formatMxnCurrency = (value: number) => mxnCurrencyFormatter.format(value)
