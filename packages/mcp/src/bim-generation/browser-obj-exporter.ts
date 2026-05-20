import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

export type ObjExportResult = {
  status: 'skipped' | 'exported'
  path: string | null
  message: string
}

export interface ObjExportAdapter {
  export(sampleDir: string): Promise<ObjExportResult>
}

export type EnsureEditorSceneResult = {
  ok: boolean
  message: string
}

type FetchImpl = (url: string, init?: RequestInit) => Promise<Response>

export class NotConfiguredObjExporter implements ObjExportAdapter {
  async export(): Promise<ObjExportResult> {
    return {
      status: 'skipped',
      path: null,
      message: 'OBJ export skipped; browser exporter is not configured for this run.',
    }
  }
}

export type BrowserObjExporterOptions = {
  editorBaseUrl: string
  headless?: boolean
  fetchImpl?: FetchImpl
  nodeWorker?: NodeObjExportWorker
}

export type NodeObjExportWorkerOptions = {
  editorBaseUrl: string
  sceneId: string
  outputPath: string
  headless: boolean
}

type NodeObjExportWorker = (options: NodeObjExportWorkerOptions) => Promise<void>

const BROWSER_EXPORT_TIMEOUT_MS = 30_000
const NODE_WORKER_TIMEOUT_MS = 120_000

const NODE_OBJ_EXPORT_WORKER = `
const encoded = process.env.PASCAL_OBJ_EXPORT_OPTIONS
if (!encoded) throw new Error('PASCAL_OBJ_EXPORT_OPTIONS is required')
const options = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
const { chromium } = await import('playwright')
const browser = await chromium.launch({ headless: options.headless })
try {
  const context = await browser.newContext({ acceptDownloads: true })
  const page = await context.newPage()
  await page.goto(options.url, { waitUntil: 'domcontentloaded', timeout: options.timeoutMs })
  await page.waitForFunction(
    () => typeof globalThis.__pascalExportOBJ === 'function',
    { timeout: options.timeoutMs },
  )
  await page.waitForFunction(
    () => (
      typeof globalThis.__pascalSceneReady === 'function' &&
      globalThis.__pascalSceneReady()
    ),
    { timeout: options.timeoutMs },
  )
  await page.waitForTimeout(2000)
  const downloadPromise = page.waitForEvent('download', { timeout: options.timeoutMs })
  await page.evaluate(() => globalThis.__pascalExportOBJ())
  const download = await downloadPromise
  await download.saveAs(options.outputPath)
  console.log(JSON.stringify({ status: 'exported', path: options.outputPath }))
} finally {
  await browser.close()
}
`

export async function ensureEditorScene(options: {
  editorBaseUrl: string
  sceneId: string
  graph: unknown
  fetchImpl?: FetchImpl
}): Promise<EnsureEditorSceneResult> {
  const editorBaseUrl = options.editorBaseUrl.replace(/\/$/, '')
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(`${editorBaseUrl}/api/scenes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id: options.sceneId,
      name: options.sceneId,
      graph: options.graph,
    }),
  })

  if (response.ok || response.status === 409) {
    return { ok: true, message: 'Editor scene saved.' }
  }

  if (response.status === 400) {
    const existing = await fetchImpl(
      `${editorBaseUrl}/api/scenes/${encodeURIComponent(options.sceneId)}`,
    )
    if (existing.ok) {
      return { ok: true, message: 'Editor scene already exists and is loadable.' }
    }
  }

  const details = await response.text().catch(() => '')
  return {
    ok: false,
    message: `Editor scene upload failed with HTTP ${response.status}${details ? `: ${details}` : ''}`,
  }
}

export class BrowserObjExporter implements ObjExportAdapter {
  readonly #editorBaseUrl: string
  readonly #headless: boolean
  readonly #fetchImpl: FetchImpl
  readonly #nodeWorker: NodeObjExportWorker

  constructor(options: BrowserObjExporterOptions) {
    this.#editorBaseUrl = options.editorBaseUrl.replace(/\/$/, '')
    this.#headless = options.headless ?? true
    this.#fetchImpl = options.fetchImpl ?? fetch
    this.#nodeWorker = options.nodeWorker ?? runNodeObjExportWorker
  }

  async export(sampleDir: string): Promise<ObjExportResult> {
    const sceneGraphPath = join(sampleDir, 'scene-graph.json')
    const graph = JSON.parse(await readFile(sceneGraphPath, 'utf8')) as unknown
    const sceneId = basename(sampleDir)
    const scene = await ensureEditorScene({
      editorBaseUrl: this.#editorBaseUrl,
      sceneId,
      graph,
      fetchImpl: this.#fetchImpl,
    })

    if (!scene.ok) {
      return {
        status: 'skipped',
        path: null,
        message: scene.message,
      }
    }

    const objPath = join(sampleDir, 'model.obj')
    try {
      await this.#nodeWorker({
        editorBaseUrl: this.#editorBaseUrl,
        sceneId,
        outputPath: objPath,
        headless: this.#headless,
      })
      return {
        status: 'exported',
        path: objPath,
        message: 'OBJ exported through Pascal browser editor.',
      }
    } catch (error) {
      return {
        status: 'skipped',
        path: null,
        message: `OBJ export failed: ${error instanceof Error ? error.message : String(error)}`,
      }
    }
  }
}

export async function runNodeObjExportWorker(options: NodeObjExportWorkerOptions): Promise<void> {
  const payload = {
    headless: options.headless,
    outputPath: resolve(options.outputPath),
    timeoutMs: BROWSER_EXPORT_TIMEOUT_MS,
    url: `${options.editorBaseUrl.replace(/\/$/, '')}/scene/${encodeURIComponent(options.sceneId)}`,
  }
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64')

  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn('node', ['--input-type=module', '--eval', NODE_OBJ_EXPORT_WORKER], {
      env: { ...process.env, PASCAL_OBJ_EXPORT_OPTIONS: encoded },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timeout = setTimeout(() => {
      child.kill()
      reject(new Error(`Node OBJ export worker timed out after ${NODE_WORKER_TIMEOUT_MS}ms`))
    }, NODE_WORKER_TIMEOUT_MS)

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk)
    })
    child.on('error', (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      if (code === 0) {
        resolvePromise()
        return
      }
      reject(
        new Error(
          [`Node OBJ export worker exited with code ${code}`, stderr.trim(), stdout.trim()]
            .filter(Boolean)
            .join('\n'),
        ),
      )
    })
  })
}
