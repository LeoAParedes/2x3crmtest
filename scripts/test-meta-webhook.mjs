import crypto from 'node:crypto'

const targetUrl = process.argv[2] || 'https://2x3crmtest.vercel.app/api/whatsapp/webhook'
const appSecret = process.env.META_APP_SECRET?.trim()

const samplePayload = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '1518543490021582',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15552047381',
              phone_number_id: '1250940554772750'
            },
            contacts: [
              {
                profile: { name: 'Webhook Test' },
                wa_id: '5216862256637'
              }
            ],
            messages: [
              {
                from: '5216862256637',
                id: `wamid.test.${Date.now()}`,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: { body: 'Hola prueba webhook' }
              }
            ]
          }
        }
      ]
    }
  ]
}

const rawBody = JSON.stringify(samplePayload)

if (!appSecret) {
  console.error('ERROR: Define META_APP_SECRET con el App Secret de Meta antes de ejecutar.')
  console.error('Ejemplo (PowerShell): $env:META_APP_SECRET="tu-secret"; node scripts/test-meta-webhook.mjs')
  process.exit(1)
}

const signature = crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')

const response = await fetch(targetUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-hub-signature-256': `sha256=${signature}`
  },
  body: rawBody
})

const text = await response.text()
console.log(`URL: ${targetUrl}`)
console.log(`HTTP: ${response.status}`)
console.log(`Body: ${text}`)

if (response.status === 401) {
  console.log('\nDiagnóstico: firma rechazada.')
  console.log('- Si META_APP_SECRET en Vercel no coincide con el App Secret de Meta → corrígelo y redeploy.')
  console.log('- Si META_APP_SECRET no está en Vercel → agrégalo y redeploy.')
}

if (response.status === 200) {
  console.log('\nDiagnóstico: webhook aceptó el mensaje. Si WhatsApp real no responde, revisa suscripción messages y número de prueba en Meta.')
}
