import { spawnSync } from 'node:child_process'

const placeholderMarkers = ['placeholder:placeholder', 'localhost:5432/placeholder']

const databaseUrl = process.env.DATABASE_URL?.trim() || ''
const directUrl = process.env.DIRECT_URL?.trim() || ''
const candidate = databaseUrl || directUrl

const isPlaceholder = !candidate || placeholderMarkers.some(marker => candidate.includes(marker))

if (isPlaceholder) {
  console.log(
    'Skipping prisma migrate deploy: DATABASE_URL/DIRECT_URL missing or placeholder (expected in CI without DB secrets).'
  )
  process.exit(0)
}

const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  stdio: 'inherit',
  shell: true,
  env: process.env
})

process.exit(result.status ?? 1)
