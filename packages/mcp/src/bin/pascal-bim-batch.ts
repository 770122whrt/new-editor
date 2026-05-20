#!/usr/bin/env bun

import { runBimBatch } from '../bim-generation'
import { BIM_BATCH_HELP, parseBimBatchCliArgs } from '../bim-generation/cli-options'

async function main(): Promise<void> {
  const options = parseBimBatchCliArgs(process.argv.slice(2))
  if (options.help) {
    console.log(BIM_BATCH_HELP)
    return
  }

  const report = await runBimBatch(options)
  console.log(
    JSON.stringify(
      {
        outDir: report.outDir,
        total: report.summary.total,
        succeeded: report.summary.succeeded,
        failed: report.summary.failed,
        report: `${report.outDir}/report.md`,
      },
      null,
      2,
    ),
  )
}

main().catch((err) => {
  console.error('[pascal-bim-batch] fatal:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
