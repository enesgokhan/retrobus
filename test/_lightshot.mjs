import { chromium } from '@playwright/test'
import { preview } from 'vite'
const PORT = 4262
const server = await preview({ preview: { port: PORT }, base: '/retrobus/' })
const b = await chromium.launch()
for (const theme of ['light', 'dark']) {
  const pg = await b.newPage({ viewport: { width: 1400, height: 1000 } })
  await pg.addInitScript((t) => localStorage.setItem('retrobus.theme', t), theme)
  await pg.goto(`http://localhost:${PORT}/retrobus/#/tasarim`, { waitUntil: 'networkidle' })
  await pg.waitForTimeout(600)
  await pg.screenshot({ path: `${process.env.OUT}/ds-${theme}.png`, fullPage: true })
  console.log('shot', theme, 'data-theme=', await pg.evaluate(() => document.documentElement.dataset.theme))
  await pg.close()
}
await b.close(); await server.close()
