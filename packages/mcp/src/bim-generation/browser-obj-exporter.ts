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
