import { readFile } from 'node:fs/promises'
import { basename, join } from 'node:path'

export type ObjExportResult = {
  status: 'skipped' | 'exported'
  path: string | null
  message: string
}

export interface ObjExportAdapter {
  export(sampleDir: string): Promise<ObjExportResult>
}

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
}

type PlaywrightModule = {
  chromium: {
    launch(options: { headless: boolean }): Promise<{
      newPage(): Promise<{
        goto(url: string, options: { waitUntil: 'networkidle' }): Promise<unknown>
        waitForFunction(
          pageFunction: () => boolean,
          options?: { timeout?: number },
        ): Promise<unknown>
        waitForEvent(event: 'download'): Promise<{ saveAs(path: string): Promise<void> }>
        evaluate(pageFunction: () => unknown): Promise<unknown>
      }>
      close(): Promise<void>
    }>
  }
}

export class BrowserObjExporter implements ObjExportAdapter {
  readonly #editorBaseUrl: string
  readonly #headless: boolean

  constructor(options: BrowserObjExporterOptions) {
    this.#editorBaseUrl = options.editorBaseUrl.replace(/\/$/, '')
    this.#headless = options.headless ?? true
  }

  async export(sampleDir: string): Promise<ObjExportResult> {
    const sceneGraphPath = join(sampleDir, 'scene-graph.json')
    const graph = JSON.parse(await readFile(sceneGraphPath, 'utf8')) as unknown
    const sceneId = basename(sampleDir)
    const response = await fetch(`${this.#editorBaseUrl}/api/scenes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: sceneId,
        name: sceneId,
        graph,
      }),
    })

    if (!response.ok && response.status !== 409) {
      return {
        status: 'skipped',
        path: null,
        message: `Editor scene upload failed with HTTP ${response.status}`,
      }
    }

    const playwright = (await import('playwright')) as PlaywrightModule
    const browser = await playwright.chromium.launch({ headless: this.#headless })
    try {
      const page = await browser.newPage()
      await page.goto(`${this.#editorBaseUrl}/scene/${encodeURIComponent(sceneId)}`, {
        waitUntil: 'networkidle',
      })
      await page.waitForFunction(
        () => {
          const pascalWindow = globalThis as unknown as { __pascalSceneReady?: () => boolean }
          return (
            typeof pascalWindow.__pascalSceneReady === 'function' &&
            pascalWindow.__pascalSceneReady()
          )
        },
        { timeout: 30_000 },
      )
      const downloadPromise = page.waitForEvent('download')
      await page.evaluate(() => {
        const pascalWindow = globalThis as unknown as { __pascalExportOBJ: () => unknown }
        return pascalWindow.__pascalExportOBJ()
      })
      const download = await downloadPromise
      const objPath = join(sampleDir, 'model.obj')
      await download.saveAs(objPath)
      return {
        status: 'exported',
        path: objPath,
        message: 'OBJ exported through Pascal browser editor.',
      }
    } finally {
      await browser.close()
    }
  }
}
