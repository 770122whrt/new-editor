import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ObjExportAdapter } from './browser-obj-exporter'
import { BrowserObjExporter, NotConfiguredObjExporter } from './browser-obj-exporter'
import { generateBimSpec } from './generate-bim-spec'
import { countIfcEntities, exportBimSpecToIfc, type IfcEntityCounts } from './ifc-exporter'
import { type NormalizedManifestRow, parseManifestLine } from './manifest-schema'
import { convertBimSpecToSceneGraph } from './scenegraph-converter'
import { type GeneratedSceneValidation, validateGeneratedScene } from './validate-generated-scene'

export type BimBatchOptions = {
  manifestPath: string
  outDir: string
  exportObj?: boolean
  exportIfc?: boolean
  objExporter?: ObjExportAdapter
  editorBaseUrl?: string
  headless?: boolean
}

export type BimBatchSampleReport = {
  id: string
  status: 'succeeded' | 'failed'
  sampleDir: string
  validation: GeneratedSceneValidation | null
  error: string | null
  obj: {
    status: 'skipped' | 'exported' | 'not_requested'
    path: string | null
    message: string
  }
  ifc: {
    status: 'exported' | 'failed' | 'not_requested'
    path: string | null
    message: string
    entityCounts: IfcEntityCounts | null
  }
}

export type BimBatchReport = {
  manifestPath: string
  outDir: string
  summary: {
    total: number
    succeeded: number
    failed: number
  }
  samples: BimBatchSampleReport[]
}

export async function runBimBatch(options: BimBatchOptions): Promise<BimBatchReport> {
  const manifest = await readFile(options.manifestPath, 'utf8')
  const lines = manifest
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)

  await mkdir(join(options.outDir, 'samples'), { recursive: true })
  await writeFile(join(options.outDir, 'manifest.jsonl'), `${lines.join('\n')}\n`)

  const samples: BimBatchSampleReport[] = []
  for (const [index, line] of lines.entries()) {
    samples.push(await runSample(line, index + 1, options))
  }

  const report: BimBatchReport = {
    manifestPath: options.manifestPath,
    outDir: options.outDir,
    summary: {
      total: samples.length,
      succeeded: samples.filter((sample) => sample.status === 'succeeded').length,
      failed: samples.filter((sample) => sample.status === 'failed').length,
    },
    samples,
  }

  await writeFile(join(options.outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  await writeFile(join(options.outDir, 'report.md'), renderMarkdownReport(report))
  await writeFile(join(options.outDir, 'README.md'), renderReadme(report))
  return report
}

async function runSample(
  line: string,
  lineNumber: number,
  options: BimBatchOptions,
): Promise<BimBatchSampleReport> {
  let input: NormalizedManifestRow | null = null
  const fallbackId = `line-${lineNumber}`
  try {
    input = parseManifestLine(line, lineNumber)
    const sampleDir = join(options.outDir, 'samples', input.id)
    await mkdir(sampleDir, { recursive: true })
    await writeFile(join(sampleDir, 'input.json'), `${JSON.stringify(input, null, 2)}\n`)

    const spec = generateBimSpec(input)
    await writeFile(join(sampleDir, 'bim-spec.json'), `${JSON.stringify(spec, null, 2)}\n`)

    const graph = convertBimSpecToSceneGraph(spec)
    await writeFile(join(sampleDir, 'scene-graph.json'), `${JSON.stringify(graph, null, 2)}\n`)

    const validation = validateGeneratedScene(graph, spec)
    await writeFile(join(sampleDir, 'validation.json'), `${JSON.stringify(validation, null, 2)}\n`)

    const ifc =
      options.exportIfc === true
        ? await exportIfcForSample(sampleDir, spec)
        : {
            status: 'not_requested' as const,
            path: null,
            message: 'IFC export was not requested for this run.',
            entityCounts: null,
          }

    const obj =
      options.exportObj === true
        ? await resolveObjExporter(options).export(sampleDir)
        : {
            status: 'not_requested' as const,
            path: null,
            message: 'OBJ export was not requested for this run.',
          }

    const objError =
      options.exportObj === true && obj.status !== 'exported'
        ? `OBJ export failed: ${obj.message}`
        : null
    const ifcError =
      options.exportIfc === true && ifc.status !== 'exported'
        ? `IFC export failed: ${ifc.message}`
        : null
    const isSuccessful = validation.valid && objError === null && ifcError === null

    return {
      id: input.id,
      status: isSuccessful ? 'succeeded' : 'failed',
      sampleDir,
      validation,
      error: isSuccessful
        ? null
        : [validation.errors.join('; '), objError, ifcError].filter(Boolean).join('; '),
      obj,
      ifc,
    }
  } catch (err) {
    const id = input?.id ?? fallbackId
    const sampleDir = join(options.outDir, 'samples', id)
    await mkdir(sampleDir, { recursive: true })
    const message = err instanceof Error ? err.message : String(err)
    await writeFile(
      join(sampleDir, 'validation.json'),
      `${JSON.stringify({ valid: false, errors: [message] }, null, 2)}\n`,
    )
    return {
      id,
      status: 'failed',
      sampleDir,
      validation: null,
      error: message,
      obj: {
        status: 'not_requested',
        path: null,
        message: 'OBJ export was not attempted because sample generation failed.',
      },
      ifc: {
        status: 'not_requested',
        path: null,
        message: 'IFC export was not attempted because sample generation failed.',
        entityCounts: null,
      },
    }
  }
}

async function exportIfcForSample(
  sampleDir: string,
  spec: ReturnType<typeof generateBimSpec>,
): Promise<BimBatchSampleReport['ifc']> {
  const ifcPath = join(sampleDir, 'model.ifc')
  const ifcText = exportBimSpecToIfc(spec)
  const entityCounts = countIfcEntities(ifcText)
  const validation = {
    valid:
      entityCounts.IfcProject === 1 &&
      entityCounts.IfcBuilding === 1 &&
      entityCounts.IfcBuildingStorey === 1 &&
      entityCounts.IfcSpace > 0 &&
      entityCounts.IfcWall > 0 &&
      entityCounts.IfcSlab > 0,
    entityCounts,
    errors: [] as string[],
  }
  if (!validation.valid) {
    validation.errors.push('IFC export is missing required semantic entities.')
  }
  await writeFile(ifcPath, ifcText)
  await writeFile(
    join(sampleDir, 'ifc-validation.json'),
    `${JSON.stringify(validation, null, 2)}\n`,
  )
  return {
    status: validation.valid ? 'exported' : 'failed',
    path: ifcPath,
    message: validation.valid ? 'IFC exported from Pascal BIM Spec.' : validation.errors.join('; '),
    entityCounts,
  }
}

function resolveObjExporter(options: BimBatchOptions): ObjExportAdapter {
  if (options.objExporter) return options.objExporter
  if (options.editorBaseUrl) {
    return new BrowserObjExporter({
      editorBaseUrl: options.editorBaseUrl,
      headless: options.headless,
    })
  }
  return new NotConfiguredObjExporter()
}

function renderMarkdownReport(report: BimBatchReport): string {
  const lines = [
    '# BIM Batch Report',
    '',
    `- Total: ${report.summary.total}`,
    `- Succeeded: ${report.summary.succeeded}`,
    `- Failed: ${report.summary.failed}`,
    '',
    '| Sample | Status | OBJ | IFC | Error |',
    '| --- | --- | --- | --- | --- |',
  ]
  for (const sample of report.samples) {
    lines.push(
      `| ${sample.id} | ${sample.status} | ${sample.obj.status} | ${sample.ifc.status} | ${sample.error ?? ''} |`,
    )
  }
  return `${lines.join('\n')}\n`
}

function renderReadme(report: BimBatchReport): string {
  return [
    '# BIM Batch Output',
    '',
    'This directory was generated by the Pascal BIM batch pipeline.',
    '',
    '- `report.md` is the human-readable run summary.',
    '- `report.json` is the machine-readable run summary.',
    '- `samples/*/bim-spec.json` is the auditable BIM Spec layer.',
    '- `samples/*/scene-graph.json` is the Pascal-renderable model layer.',
    '- `samples/*/model.ifc` is the IFC4 semantic BIM export when IFC export is enabled.',
    '',
    `Succeeded: ${report.summary.succeeded}/${report.summary.total}`,
    '',
  ].join('\n')
}
