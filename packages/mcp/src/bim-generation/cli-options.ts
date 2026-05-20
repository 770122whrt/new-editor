import { parseArgs } from 'node:util'
import type { BimBatchOptions } from './batch-runner'

export const BIM_BATCH_HELP = `pascal-bim-batch - Generate Pascal BIM batch JSON outputs

USAGE:
  pascal-bim-batch --manifest <path> --out <path> [--skip-obj]

OPTIONS:
  --manifest <path> JSONL manifest path
  --out <path>      Output directory
  --skip-obj        Generate JSON and reports without OBJ export
  --help            Print this help
`

export type BimBatchCliOptions = BimBatchOptions & {
  help: boolean
}

export function parseBimBatchCliArgs(args: string[]): BimBatchCliOptions {
  const { values } = parseArgs({
    args,
    options: {
      manifest: { type: 'string' },
      out: { type: 'string' },
      'skip-obj': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
    },
  })

  if (values.help) {
    return {
      manifestPath: '',
      outDir: '',
      exportObj: false,
      help: true,
    }
  }

  if (!values.manifest) {
    throw new Error('Missing required --manifest <path> option')
  }
  if (!values.out) {
    throw new Error('Missing required --out <path> option')
  }

  return {
    manifestPath: values.manifest,
    outDir: values.out,
    exportObj: !values['skip-obj'],
    help: false,
  }
}
