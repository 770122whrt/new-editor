import type { BimSpec } from './bim-spec-schema'

export type IfcEntityCounts = {
  IfcProject: number
  IfcSite: number
  IfcBuilding: number
  IfcBuildingStorey: number
  IfcSpace: number
  IfcWall: number
  IfcSlab: number
  IfcDoor: number
  IfcWindow: number
  IfcRoof: number
}

const IFC_GUID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

export function exportBimSpecToIfc(spec: BimSpec): string {
  const writer = new IfcStepWriter()
  const origin = writer.entity('IFCCARTESIANPOINT', '((0.,0.,0.))')
  const zDirection = writer.entity('IFCDIRECTION', '((0.,0.,1.))')
  const xDirection = writer.entity('IFCDIRECTION', '((1.,0.,0.))')
  const modelPlacement = writer.entity(
    'IFCAXIS2PLACEMENT3D',
    `${origin},${zDirection},${xDirection}`,
  )
  const context = writer.entity(
    'IFCGEOMETRICREPRESENTATIONCONTEXT',
    `$,'Model',3,1.E-05,${modelPlacement},$`,
  )
  const metre = writer.entity('IFCSIUNIT', '*,.LENGTHUNIT.,$,.METRE.')
  const units = writer.entity('IFCUNITASSIGNMENT', `((${metre}))`)

  const project = writer.entity(
    'IFCPROJECT',
    `${guid(spec, 'project')},$,'${stepString(spec.id)}',$,$,$,$,(${context}),${units}`,
  )
  const sitePlacement = localPlacement(writer, null, modelPlacement)
  const site = writer.entity(
    'IFCSITE',
    `${guid(spec, 'site')},$,'Generated Site',$,$,${sitePlacement},$,$,.ELEMENT.,$,$,$,$,$`,
  )
  const buildingPlacement = localPlacement(writer, sitePlacement, modelPlacement)
  const building = writer.entity(
    'IFCBUILDING',
    `${guid(spec, 'building')},$,'Generated Building',$,$,${buildingPlacement},$,$,.ELEMENT.,$,$,$`,
  )
  const storeyPlacement = localPlacement(writer, buildingPlacement, modelPlacement)
  const storey = writer.entity(
    'IFCBUILDINGSTOREY',
    `${guid(spec, 'storey')},$,'Ground Floor',$,$,${storeyPlacement},$,$,.ELEMENT.,0.`,
  )

  writer.entity('IFCRELAGGREGATES', `${guid(spec, 'rel-project-site')},$,$,$,${project},(${site})`)
  writer.entity(
    'IFCRELAGGREGATES',
    `${guid(spec, 'rel-site-building')},$,$,$,${site},(${building})`,
  )
  writer.entity(
    'IFCRELAGGREGATES',
    `${guid(spec, 'rel-building-storey')},$,$,$,${building},(${storey})`,
  )

  const containedProducts: string[] = []
  const wallHeight = spec.building.wallHeightM
  const wallThickness = spec.building.wallThicknessM
  const wallSpecs = createWallSpecs(spec)
  for (const wall of wallSpecs) {
    const representation = extrudedPolygonRepresentation(writer, context, wall.polygon, wallHeight)
    const placement = localPlacement(writer, storeyPlacement, modelPlacement)
    const wallRef = writer.entity(
      'IFCWALL',
      `${guid(spec, wall.id)},$,'${stepString(wall.name)}',$,$,${placement},${representation},'${stepString(wall.id)}',.NOTDEFINED.`,
    )
    containedProducts.push(wallRef)
    addPascalSourceProperties(writer, spec, wallRef, {
      sourceNodeId: wall.id,
      sourceType: 'wall',
      wallRole: wall.role,
    })
  }

  const slabRepresentation = extrudedPolygonRepresentation(writer, context, spec.footprint, 0.15)
  const slabPlacement = localPlacement(writer, storeyPlacement, modelPlacement)
  const slab = writer.entity(
    'IFCSLAB',
    `${guid(spec, 'slab')},$,'Generated Slab',$,$,${slabPlacement},${slabRepresentation},'slab',.FLOOR.`,
  )
  containedProducts.push(slab)
  addPascalSourceProperties(writer, spec, slab, {
    sourceNodeId: 'slab',
    sourceType: 'slab',
  })

  for (const room of spec.rooms) {
    const representation = extrudedPolygonRepresentation(writer, context, room.polygon, wallHeight)
    const placement = localPlacement(writer, storeyPlacement, modelPlacement)
    const space = writer.entity(
      'IFCSPACE',
      `${guid(spec, room.id)},$,'${stepString(room.name)}',$,$,${placement},${representation},'${stepString(room.id)}',$,.ELEMENT.,$`,
    )
    containedProducts.push(space)
    addPascalSourceProperties(writer, spec, space, {
      sourceNodeId: room.id,
      sourceType: 'space',
      roomType: room.type,
    })
  }

  for (const [index, door] of spec.openings.exteriorDoors.entries()) {
    const wall = wallSpecs.find((candidate) => candidate.side === door.wall)
    const [x, y] = wall ? pointAt(wall.start, wall.end, door.t) : ([0, 0] as [number, number])
    const placement = localPlacementAt(writer, storeyPlacement, x, y, 0)
    const doorRef = writer.entity(
      'IFCDOOR',
      `${guid(spec, `door-${index}`)},$,'Exterior Door',$,$,${placement},$,'door-${index}',2.1,${number(door.widthM)},.DOOR.,.SINGLE_SWING_LEFT.,$`,
    )
    containedProducts.push(doorRef)
    addPascalSourceProperties(writer, spec, doorRef, {
      sourceNodeId: `door-${index}`,
      sourceType: 'door',
      wallRole: door.wall,
    })
  }

  for (const [index, windowSpec] of spec.openings.windows.entries()) {
    const wall = wallSpecs.find((candidate) => candidate.side === windowSpec.wall)
    const [x, y] = wall ? pointAt(wall.start, wall.end, windowSpec.t) : ([0, 0] as [number, number])
    const placement = localPlacementAt(writer, storeyPlacement, x, y, windowSpec.sillHeightM)
    const windowRef = writer.entity(
      'IFCWINDOW',
      `${guid(spec, `window-${index}`)},$,'Generated Window',$,$,${placement},$,'window-${index}',${number(windowSpec.heightM)},${number(windowSpec.widthM)},.WINDOW.,.SINGLE_PANEL.,$`,
    )
    containedProducts.push(windowRef)
    addPascalSourceProperties(writer, spec, windowRef, {
      sourceNodeId: `window-${index}`,
      sourceType: 'window',
      wallRole: windowSpec.wall,
    })
  }

  if (spec.options.includeRoof) {
    const roofRepresentation = extrudedPolygonRepresentation(
      writer,
      context,
      spec.footprint,
      0.12,
      wallHeight,
    )
    const roofPlacement = localPlacement(writer, storeyPlacement, modelPlacement)
    const roof = writer.entity(
      'IFCROOF',
      `${guid(spec, 'roof')},$,'Generated Roof',$,$,${roofPlacement},${roofRepresentation},'roof',.FLAT_ROOF.`,
    )
    containedProducts.push(roof)
    addPascalSourceProperties(writer, spec, roof, {
      sourceNodeId: 'roof',
      sourceType: 'roof',
    })
  }

  writer.entity(
    'IFCRELCONTAINEDINSPATIALSTRUCTURE',
    `${guid(spec, 'rel-storey-contents')},$,'Storey Contents',$,(${containedProducts.join(',')}),${storey}`,
  )

  return renderIfcStep(spec, writer.lines)
}

export function countIfcEntities(ifcText: string): IfcEntityCounts {
  return {
    IfcProject: countEntity(ifcText, 'IFCPROJECT'),
    IfcSite: countEntity(ifcText, 'IFCSITE'),
    IfcBuilding: countEntity(ifcText, 'IFCBUILDING'),
    IfcBuildingStorey: countEntity(ifcText, 'IFCBUILDINGSTOREY'),
    IfcSpace: countEntity(ifcText, 'IFCSPACE'),
    IfcWall: countEntity(ifcText, 'IFCWALL'),
    IfcSlab: countEntity(ifcText, 'IFCSLAB'),
    IfcDoor: countEntity(ifcText, 'IFCDOOR'),
    IfcWindow: countEntity(ifcText, 'IFCWINDOW'),
    IfcRoof: countEntity(ifcText, 'IFCROOF'),
  }
}

function renderIfcStep(spec: BimSpec, lines: string[]): string {
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');",
    `FILE_NAME('${stepString(`${spec.id}.ifc`)}','${new Date(0).toISOString()}',('pascal-bim-batch'),('Pascal'),'pascal-bim-batch','pascal-bim-batch','');`,
    "FILE_SCHEMA(('IFC4'));",
    'ENDSEC;',
    'DATA;',
    ...lines,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n')
}

type WallSpec = {
  id: string
  name: string
  side: 'north' | 'east' | 'south' | 'west'
  role: 'exterior'
  start: [number, number]
  end: [number, number]
  polygon: [number, number][]
}

function createWallSpecs(spec: BimSpec): WallSpec[] {
  const [southWest, southEast, northEast, northWest] = spec.footprint
  if (!southWest || !southEast || !northEast || !northWest) {
    throw new Error(`BIM Spec ${spec.id} must contain a rectangular footprint`)
  }
  const walls: Array<[WallSpec['side'], [number, number], [number, number]]> = [
    ['south', southWest, southEast],
    ['east', southEast, northEast],
    ['north', northEast, northWest],
    ['west', northWest, southWest],
  ]
  return walls.map(([side, start, end]) => ({
    id: `wall-${side}`,
    name: `${capitalize(side)} Exterior Wall`,
    side,
    role: 'exterior',
    start,
    end,
    polygon: wallRectangle(start, end, spec.building.wallThicknessM),
  }))
}

function extrudedPolygonRepresentation(
  writer: IfcStepWriter,
  context: string,
  polygon: [number, number][],
  depth: number,
  elevation = 0,
): string {
  const closed = closePolygon(polygon)
  const points = closed.map((point) =>
    writer.entity('IFCCARTESIANPOINT', `((${number(point[0])},${number(point[1])}))`),
  )
  const polyline = writer.entity('IFCPOLYLINE', `((${points.join(',')}))`)
  const profile = writer.entity('IFCARBITRARYCLOSEDPROFILEDEF', `.AREA.,$,${polyline}`)
  const origin = writer.entity('IFCCARTESIANPOINT', `((0.,0.,${number(elevation)}))`)
  const zDirection = writer.entity('IFCDIRECTION', '((0.,0.,1.))')
  const xDirection = writer.entity('IFCDIRECTION', '((1.,0.,0.))')
  const placement = writer.entity('IFCAXIS2PLACEMENT3D', `${origin},${zDirection},${xDirection}`)
  const extrudeDirection = writer.entity('IFCDIRECTION', '((0.,0.,1.))')
  const solid = writer.entity(
    'IFCEXTRUDEDAREASOLID',
    `${profile},${placement},${extrudeDirection},${number(depth)}`,
  )
  const shape = writer.entity('IFCSHAPEREPRESENTATION', `${context},'Body','SweptSolid',(${solid})`)
  return writer.entity('IFCPRODUCTDEFINITIONSHAPE', `$,$,(${shape})`)
}

function addPascalSourceProperties(
  writer: IfcStepWriter,
  spec: BimSpec,
  product: string,
  source: {
    sourceNodeId: string
    sourceType: string
    roomType?: string
    wallRole?: string
  },
): void {
  const properties = [
    textProperty(writer, 'sampleId', spec.id),
    textProperty(writer, 'sourceNodeId', source.sourceNodeId),
    textProperty(writer, 'sourceType', source.sourceType),
    textProperty(writer, 'brief', spec.brief),
    writer.entity('IFCPROPERTYSINGLEVALUE', `'seed',$,IFCINTEGER(${spec.seed}),$`),
  ]
  if (source.roomType) {
    properties.push(textProperty(writer, 'roomType', source.roomType))
  }
  if (source.wallRole) {
    properties.push(textProperty(writer, 'wallRole', source.wallRole))
  }

  const propertySet = writer.entity(
    'IFCPROPERTYSET',
    `${guid(spec, `pset-${product}`)},$,'Pset_PascalSource',$,(${properties.join(',')})`,
  )
  writer.entity(
    'IFCRELDEFINESBYPROPERTIES',
    `${guid(spec, `rel-pset-${product}`)},$,$,$,(${product}),${propertySet}`,
  )
}

function textProperty(writer: IfcStepWriter, name: string, value: string): string {
  return writer.entity(
    'IFCPROPERTYSINGLEVALUE',
    `'${stepString(name)}',$,IFCTEXT('${stepString(value)}'),$`,
  )
}

function localPlacement(
  writer: IfcStepWriter,
  relativeTo: string | null,
  placement: string,
): string {
  return writer.entity('IFCLOCALPLACEMENT', `${relativeTo ?? '$'},${placement}`)
}

function localPlacementAt(
  writer: IfcStepWriter,
  relativeTo: string,
  x: number,
  y: number,
  z: number,
): string {
  const point = writer.entity('IFCCARTESIANPOINT', `((${number(x)},${number(y)},${number(z)}))`)
  const zDirection = writer.entity('IFCDIRECTION', '((0.,0.,1.))')
  const xDirection = writer.entity('IFCDIRECTION', '((1.,0.,0.))')
  const placement = writer.entity('IFCAXIS2PLACEMENT3D', `${point},${zDirection},${xDirection}`)
  return localPlacement(writer, relativeTo, placement)
}

function wallRectangle(
  start: [number, number],
  end: [number, number],
  thickness: number,
): [number, number][] {
  const dx = end[0] - start[0]
  const dy = end[1] - start[1]
  const length = Math.hypot(dx, dy) || 1
  const nx = (-dy / length) * (thickness / 2)
  const ny = (dx / length) * (thickness / 2)
  return [
    [start[0] + nx, start[1] + ny],
    [end[0] + nx, end[1] + ny],
    [end[0] - nx, end[1] - ny],
    [start[0] - nx, start[1] - ny],
  ]
}

function closePolygon(polygon: [number, number][]): [number, number][] {
  const first = polygon[0]
  const last = polygon.at(-1)
  if (!first || !last) return polygon
  if (first[0] === last[0] && first[1] === last[1]) return polygon
  return [...polygon, first]
}

function pointAt(start: [number, number], end: [number, number], t: number): [number, number] {
  return [start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t]
}

function countEntity(ifcText: string, entity: string): number {
  return [...ifcText.matchAll(new RegExp(`=\\s*${entity}\\s*\\(`, 'g'))].length
}

function guid(spec: BimSpec, key: string): string {
  let hash = 2166136261
  for (const char of `${spec.id}:${spec.seed}:${key}`) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  let value = hash >>> 0
  let result = ''
  for (let i = 0; i < 22; i++) {
    value = Math.imul(value ^ (i + 1), 1103515245) + 12345
    result += IFC_GUID_ALPHABET[(value >>> 0) % IFC_GUID_ALPHABET.length]
  }
  return `'${result}'`
}

function number(value: number): string {
  if (Object.is(value, -0)) return '0.'
  if (Number.isInteger(value)) return `${value}.`
  return String(Math.round(value * 1000) / 1000)
}

function stepString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "''")
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`
}

class IfcStepWriter {
  readonly lines: string[] = []
  #nextId = 1

  entity(name: string, args: string): string {
    const ref = `#${this.#nextId}`
    this.#nextId += 1
    this.lines.push(`${ref}=${name}(${args});`)
    return ref
  }
}
