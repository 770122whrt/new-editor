import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as THREE from '../apps/editor/node_modules/three/build/three.module.js'
import { GLTFExporter } from '../apps/editor/node_modules/three/examples/jsm/exporters/GLTFExporter.js'

class NodeFileReader {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = buffer
      this.onloadend?.()
    }, (error) => {
      this.error = error
      this.onerror?.(error)
    })
  }

  readAsDataURL(blob) {
    blob.arrayBuffer().then((buffer) => {
      const bytes = Buffer.from(buffer)
      this.result = `data:${blob.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`
      this.onloadend?.()
    }, (error) => {
      this.error = error
      this.onerror?.(error)
    })
  }
}

globalThis.FileReader ??= NodeFileReader

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sceneId = process.argv[2] ?? '6277f322fd6f'
const outputPath = path.resolve(process.argv[3] ?? path.join(__dirname, `${sceneId}.glb`))
const sceneUrl = process.argv[4] ?? `http://localhost:3002/api/scenes/${sceneId}`

const response = await fetch(sceneUrl)
if (!response.ok) {
  throw new Error(`Failed to fetch scene ${sceneId}: HTTP ${response.status}`)
}

const storedScene = await response.json()
const graph = storedScene.graph
if (!graph?.nodes) {
  throw new Error(`Scene ${sceneId} response did not include graph.nodes`)
}

const nodes = graph.nodes
const out = new THREE.Scene()
out.name = storedScene.name ?? sceneId
out.userData = {
  source: 'Pascal scene JSON',
  sceneId,
  note: 'Headless simplified GLB export for review/demo use; not BIM/IFC.',
}

const materials = {
  wall: new THREE.MeshStandardMaterial({ color: 0xd8d2c4, roughness: 0.8 }),
  slab: new THREE.MeshStandardMaterial({ color: 0xb8b0a2, roughness: 0.9 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xf3f0e8, roughness: 0.9, transparent: true, opacity: 0.35 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x8f3f2f, roughness: 0.75 }),
  zone: new THREE.MeshStandardMaterial({ color: 0x60a5fa, roughness: 0.7, transparent: true, opacity: 0.18 }),
  door: new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.7 }),
  window: new THREE.MeshStandardMaterial({ color: 0x8fd3ff, roughness: 0.25, metalness: 0.05, transparent: true, opacity: 0.55 }),
  furniture: new THREE.MeshStandardMaterial({ color: 0x3f4756, roughness: 0.8 }),
}

function polygonShape(points) {
  const shape = new THREE.Shape()
  points.forEach(([x, z], index) => {
    if (index === 0) shape.moveTo(x, z)
    else shape.lineTo(x, z)
  })
  shape.closePath()
  return shape
}

function addFlatPolygon(name, points, y, thickness, material) {
  const shape = polygonShape(points)
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
  })
  geometry.rotateX(Math.PI / 2)
  geometry.translate(0, y, 0)
  const mesh = new THREE.Mesh(geometry, material)
  mesh.name = name
  out.add(mesh)
  return mesh
}

function addWall(wall) {
  const [sx, sz] = wall.start
  const [ex, ez] = wall.end
  const dx = ex - sx
  const dz = ez - sz
  const length = Math.hypot(dx, dz)
  const thickness = wall.thickness ?? 0.16
  const height = wall.height ?? 2.8
  const geometry = new THREE.BoxGeometry(length, height, thickness)
  const mesh = new THREE.Mesh(geometry, materials.wall)
  mesh.name = wall.name ?? wall.id
  mesh.position.set((sx + ex) / 2, height / 2, (sz + ez) / 2)
  mesh.rotation.y = -Math.atan2(dz, dx)
  out.add(mesh)
}

function wallFrame(wall, localX, y, zOffset = 0.085) {
  const [sx, sz] = wall.start
  const [ex, ez] = wall.end
  const dx = ex - sx
  const dz = ez - sz
  const length = Math.hypot(dx, dz) || 1
  const ux = dx / length
  const uz = dz / length
  const nx = -uz
  const nz = ux
  return {
    position: new THREE.Vector3(sx + ux * localX + nx * zOffset, y, sz + uz * localX + nz * zOffset),
    rotationY: -Math.atan2(dz, dx),
  }
}

function addOpening(opening) {
  const wall = nodes[opening.wallId ?? opening.parentId]
  if (!wall) return
  const [localX = 0, y = 1, z = 0] = opening.position ?? []
  const width = opening.width ?? 1
  const height = opening.height ?? 1
  const frame = wallFrame(wall, localX, y, z + 0.1)
  const geometry = new THREE.BoxGeometry(width, height, 0.05)
  const mesh = new THREE.Mesh(geometry, opening.type === 'door' ? materials.door : materials.window)
  mesh.name = opening.name ?? opening.id
  mesh.position.copy(frame.position)
  mesh.rotation.y = frame.rotationY
  out.add(mesh)
}

function addItem(item) {
  const [w = 1, h = 1, d = 1] = item.asset?.dimensions ?? [1, 1, 1]
  const [x = 0, y = 0, z = 0] = item.position ?? []
  const [, ry = 0] = item.rotation ?? []
  const geometry = new THREE.BoxGeometry(w, h, d)
  const mesh = new THREE.Mesh(geometry, materials.furniture)
  mesh.name = item.name ?? item.id
  mesh.position.set(x, y + h / 2, z)
  mesh.rotation.y = ry
  out.add(mesh)
}

function addRoofSegment(segment) {
  const width = segment.width ?? 8
  const depth = segment.depth ?? 6
  const wallHeight = segment.wallHeight ?? 2.8
  const roofHeight = segment.roofHeight ?? 1.2
  const overhang = segment.overhang ?? 0
  const w = width + overhang * 2
  const d = depth + overhang * 2
  const y0 = wallHeight
  const y1 = wallHeight + roofHeight
  const vertices = new Float32Array([
    -w / 2, y0, -d / 2,
    w / 2, y0, -d / 2,
    0, y1, -d / 2,
    -w / 2, y0, d / 2,
    w / 2, y0, d / 2,
    0, y1, d / 2,
  ])
  const indices = [
    0, 1, 2,
    3, 5, 4,
    0, 3, 1,
    1, 3, 4,
    0, 2, 3,
    2, 5, 3,
    1, 4, 2,
    2, 4, 5,
  ]
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3))
  geometry.setIndex(indices)
  geometry.computeVertexNormals()
  const mesh = new THREE.Mesh(geometry, materials.roof)
  mesh.name = segment.name ?? segment.id
  const [x = 0, y = 0, z = 0] = segment.position ?? []
  mesh.position.set(x, y, z)
  mesh.rotation.y = segment.rotation ?? 0
  out.add(mesh)
}

for (const node of Object.values(nodes)) {
  if (node.type === 'zone' && Array.isArray(node.polygon)) addFlatPolygon(node.name ?? node.id, node.polygon, 0.012, 0.015, materials.zone)
  if (node.type === 'slab' && Array.isArray(node.polygon)) addFlatPolygon(node.name ?? node.id, node.polygon, node.elevation ?? 0, 0.1, materials.slab)
  if (node.type === 'ceiling' && Array.isArray(node.polygon)) addFlatPolygon(node.name ?? node.id, node.polygon, node.height ?? 2.5, 0.04, materials.ceiling)
}

for (const node of Object.values(nodes)) {
  if (node.type === 'wall') addWall(node)
}

for (const node of Object.values(nodes)) {
  if (node.type === 'door' || node.type === 'window') addOpening(node)
  if (node.type === 'item') addItem(node)
  if (node.type === 'roof-segment') addRoofSegment(node)
}

const light = new THREE.DirectionalLight(0xffffff, 2)
light.position.set(5, 8, 5)
out.add(light)
out.add(new THREE.AmbientLight(0xffffff, 1.2))

await new Promise((resolve, reject) => {
  new GLTFExporter().parse(
    out,
    (result) => {
      fs.writeFileSync(outputPath, Buffer.from(result))
      resolve()
    },
    reject,
    { binary: true },
  )
})

console.log(JSON.stringify({
  sceneId,
  outputPath,
  bytes: fs.statSync(outputPath).size,
  sourceUrl: sceneUrl,
}))
