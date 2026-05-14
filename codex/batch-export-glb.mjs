import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const EXPORT_DIR = path.join(__dirname, 'exports')
const BASE_URL = process.env.PASCAL_URL ?? 'http://localhost:3002'
const TIMEOUT_MS = 30_000
const RENDER_WAIT_MS = 5_000

// Ensure export directory exists
fs.mkdirSync(EXPORT_DIR, { recursive: true })

// Fetch scene list from API
async function fetchSceneIds(baseUrl) {
  const res = await fetch(`${baseUrl}/api/scenes`)
  if (!res.ok) throw new Error(`Failed to fetch scenes: HTTP ${res.status}`)
  const scenes = await res.json()
  // Response is an array of scene objects with id field
  if (Array.isArray(scenes)) return scenes.map(s => s.id)
  // Or it might be { scenes: [...] }
  if (scenes.scenes) return scenes.scenes.map(s => s.id)
  throw new Error('Unexpected scenes response format')
}

// Export a single scene
async function exportScene(page, sceneId, baseUrl) {
  const url = `${baseUrl}/scene/${sceneId}`
  const savePath = path.join(EXPORT_DIR, `${sceneId}.glb`)

  // Skip if already exported
  if (fs.existsSync(savePath)) {
    return { sceneId, status: 'skipped', reason: 'already exists' }
  }

  try {
    // Navigate to scene
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: TIMEOUT_MS })

    // Wait for Three.js to render
    await page.waitForFunction(
      () => typeof window.__pascalExportGLB === 'function',
      { timeout: TIMEOUT_MS },
    )

    // Extra wait for geometry to build
    await page.waitForTimeout(RENDER_WAIT_MS)

    // Trigger export and capture download
    const downloadPromise = page.waitForEvent('download', { timeout: TIMEOUT_MS })
    await page.evaluate(() => window.__pascalExportGLB())
    const download = await downloadPromise

    // Save to disk
    await download.saveAs(savePath)

    const stats = fs.statSync(savePath)
    return { sceneId, status: 'ok', bytes: stats.size, path: savePath }
  } catch (err) {
    return { sceneId, status: 'error', error: err.message }
  }
}

// Main
async function main() {
  const args = process.argv.slice(2)
  let sceneIds

  if (args.length > 0) {
    // Use provided scene IDs
    sceneIds = args
  } else {
    // Fetch all scenes from API
    console.log(`Fetching scene list from ${BASE_URL}...`)
    sceneIds = await fetchSceneIds(BASE_URL)
  }

  console.log(`Found ${sceneIds.length} scenes to export`)
  console.log(`Export directory: ${EXPORT_DIR}`)

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  const results = []
  let successCount = 0
  let errorCount = 0
  let skipCount = 0

  for (let i = 0; i < sceneIds.length; i++) {
    const sceneId = sceneIds[i]
    process.stdout.write(`[${i + 1}/${sceneIds.length}] ${sceneId} ... `)

    const result = await exportScene(page, sceneId, BASE_URL)
    results.push(result)

    if (result.status === 'ok') {
      console.log(`OK (${(result.bytes / 1024).toFixed(1)} KB)`)
      successCount++
    } else if (result.status === 'skipped') {
      console.log(`SKIPPED (${result.reason})`)
      skipCount++
    } else {
      console.log(`ERROR: ${result.error}`)
      errorCount++
    }
  }

  await browser.close()

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: BASE_URL,
    total: sceneIds.length,
    success: successCount,
    skipped: skipCount,
    errors: errorCount,
    results,
  }

  const reportPath = path.join(EXPORT_DIR, 'export-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))

  console.log(`\n--- Summary ---`)
  console.log(`Total: ${sceneIds.length}`)
  console.log(`Success: ${successCount}`)
  console.log(`Skipped: ${skipCount}`)
  console.log(`Errors: ${errorCount}`)
  console.log(`Report: ${reportPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
