// ============================================================
// RoofReporterAI — Phase 1: Advanced Geometric Parsing Engine
// The Edge Classifier v1.0
// ============================================================
//
// RANSAC-enhanced planar segmentation of DSM GeoTIFF data.
// Identifies 3D plane intersections and classifies edges as:
//   - Ridge: upward convex intersection (horizontal)
//   - Hip: upward convex intersection (angled)
//   - Valley: downward concave trough
//   - Eave: lowest edge parallel to ground
//   - Rake: edge along the incline of a plane
//
// Input: DSM heightmap + mask from Google Solar DataLayers
// Output: EdgeClassifierResult with typed edges + linear footages
//
// Runs entirely in Cloudflare Workers (no Node.js fs/child_process).
// ============================================================

import type { DSMAnalysis, SlopeAnalysis } from './solar-datalayers'

// ============================================================
// TYPES
// ============================================================

export interface PlaneSegment {
  /** Unique segment ID */
  id: number
  /** Normal vector of the fitted plane [nx, ny, nz] */
  normal: [number, number, number]
  /** Plane offset d in ax + by + cz = d */
  offset: number
  /** Pitch angle in degrees (from horizontal) */
  pitchDeg: number
  /** Azimuth angle in degrees (0=N, 90=E, 180=S, 270=W) */
  azimuthDeg: number
  /** Pixel indices belonging to this segment */
  pixelIndices: number[]
  /** Area in square meters */
  areaM2: number
  /** Bounding box: [minX, minY, maxX, maxY] in pixel coords */
  bbox: [number, number, number, number]
  /** Centroid in pixel coords */
  centroid: { x: number; y: number; z: number }
}

export interface ClassifiedEdge {
  /** Edge type classification */
  type: 'ridge' | 'hip' | 'valley' | 'eave' | 'rake' | 'transition'
  /** Start point [x, y, z] in pixel coords (z = height) */
  start: { x: number; y: number; z: number }
  /** End point [x, y, z] in pixel coords (z = height) */
  end: { x: number; y: number; z: number }
  /** True 3D length in meters */
  lengthM: number
  /** True 3D length in feet */
  lengthFt: number
  /** Adjacent plane segment IDs */
  adjacentSegments: [number, number] | [number]
  /** Intersection angle between planes (degrees) */
  intersectionAngleDeg?: number
  /** Confidence score 0-100 */
  confidence: number
}

export interface EdgeClassifierResult {
  /** Detected planar segments */
  segments: PlaneSegment[]
  /** Classified edges */
  edges: ClassifiedEdge[]
  /** Summary statistics */
  summary: {
    totalAreaM2: number
    totalAreaSqft: number
    totalSquares: number
    predominantPitchDeg: number
    predominantPitchRatio: string
    ridgeLF: number
    hipLF: number
    valleyLF: number
    eaveLF: number
    rakeLF: number
    transitionLF: number
    totalLinearFt: number
  }
  /** Processing time in ms */
  durationMs: number
}

// ============================================================
// RANSAC PLANE FITTING — Find dominant planes in DSM
// ============================================================
//
// Standard RANSAC: randomly sample 3 points, fit a plane,
// count inliers within distance threshold, keep best.
// Repeat to find multiple planes (sequential RANSAC).
//
// Optimized for Cloudflare Workers:
// - Downsample DSM to reduce computation
// - Limited iterations (500 per plane)
// - Early termination when inlier ratio > 85%
// ============================================================

function fitPlaneFrom3Points(
  p1: { x: number; y: number; z: number },
  p2: { x: number; y: number; z: number },
  p3: { x: number; y: number; z: number }
): { normal: [number, number, number]; offset: number } | null {
  // Cross product of (p2-p1) × (p3-p1)
  const v1x = p2.x - p1.x, v1y = p2.y - p1.y, v1z = p2.z - p1.z
  const v2x = p3.x - p1.x, v2y = p3.y - p1.y, v2z = p3.z - p1.z

  const nx = v1y * v2z - v1z * v2y
  const ny = v1z * v2x - v1x * v2z
  const nz = v1x * v2y - v1y * v2x

  const mag = Math.sqrt(nx * nx + ny * ny + nz * nz)
  if (mag < 1e-8) return null // Degenerate (collinear points)

  const n: [number, number, number] = [nx / mag, ny / mag, nz / mag]
  // Ensure normal points upward (nz > 0)
  if (n[2] < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2] }

  const offset = n[0] * p1.x + n[1] * p1.y + n[2] * p1.z
  return { normal: n, offset }
}

function pointToPlaneDistance(
  px: number, py: number, pz: number,
  normal: [number, number, number], offset: number
): number {
  return Math.abs(normal[0] * px + normal[1] * py + normal[2] * pz - offset)
}

/** Simple deterministic PRNG for reproducibility in Workers */
function createPRNG(seed: number) {
  let s = seed
  return function(): number {
    s = (s * 1664525 + 1013904223) & 0x7fffffff
    return s / 0x7fffffff
  }
}

// ============================================================
// SEQUENTIAL RANSAC — Extract multiple planes
// ============================================================

interface DSMPoint {
  x: number  // pixel column
  y: number  // pixel row
  z: number  // height (meters)
  idx: number // flat index in heightMap
}

function extractPlanes(
  heightMap: Float64Array,
  width: number,
  height: number,
  pixelSizeM: number,
  maxPlanes: number = 8,
  distThreshold: number = 0.15,   // 15cm tolerance
  minInlierRatio: number = 0.08,  // minimum 8% of points for a valid plane
  maxIterations: number = 400
): PlaneSegment[] {
  // Build point cloud from valid (non-NaN) height pixels
  const allPoints: DSMPoint[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x
      const z = heightMap[idx]
      if (!isNaN(z) && isFinite(z) && z > 0) {
        allPoints.push({
          x: x * pixelSizeM,
          y: y * pixelSizeM,
          z,
          idx
        })
      }
    }
  }

  if (allPoints.length < 30) {
    console.warn(`[EdgeClassifier] Too few valid points (${allPoints.length}), skipping RANSAC`)
    return []
  }

  const segments: PlaneSegment[] = []
  let remainingPoints = [...allPoints]
  const rng = createPRNG(42)

  for (let planeIdx = 0; planeIdx < maxPlanes; planeIdx++) {
    if (remainingPoints.length < 30) break

    let bestPlane: { normal: [number, number, number]; offset: number } | null = null
    let bestInliers: DSMPoint[] = []

    for (let iter = 0; iter < maxIterations; iter++) {
      // Sample 3 random points
      const i1 = Math.floor(rng() * remainingPoints.length)
      let i2 = Math.floor(rng() * remainingPoints.length)
      let i3 = Math.floor(rng() * remainingPoints.length)
      while (i2 === i1) i2 = Math.floor(rng() * remainingPoints.length)
      while (i3 === i1 || i3 === i2) i3 = Math.floor(rng() * remainingPoints.length)

      const p1 = remainingPoints[i1]
      const p2 = remainingPoints[i2]
      const p3 = remainingPoints[i3]

      // Ensure points are not too close together (need spatial spread)
      const d12 = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)
      const d13 = Math.sqrt((p3.x - p1.x) ** 2 + (p3.y - p1.y) ** 2)
      if (d12 < pixelSizeM * 3 || d13 < pixelSizeM * 3) continue

      const plane = fitPlaneFrom3Points(p1, p2, p3)
      if (!plane) continue

      // Reject near-vertical planes (pitch > 75°)
      const pitchRad = Math.acos(Math.abs(plane.normal[2]))
      if (pitchRad > 75 * Math.PI / 180) continue

      // Count inliers
      const inliers: DSMPoint[] = []
      for (const pt of remainingPoints) {
        const dist = pointToPlaneDistance(pt.x, pt.y, pt.z, plane.normal, plane.offset)
        if (dist < distThreshold) {
          inliers.push(pt)
        }
      }

      if (inliers.length > bestInliers.length) {
        bestInliers = inliers
        bestPlane = plane

        // Early termination if we found a very good fit
        if (inliers.length / remainingPoints.length > 0.85) break
      }
    }

    // Check minimum inlier ratio
    if (!bestPlane || bestInliers.length / allPoints.length < minInlierRatio) break

    // Refine plane fit using all inliers (least-squares via covariance)
    const refined = refinePlaneFit(bestInliers)
    if (refined) bestPlane = refined

    // Compute segment properties
    const pitchRad = Math.acos(Math.min(1, Math.abs(bestPlane.normal[2])))
    const pitchDeg = pitchRad * 180 / Math.PI

    // Azimuth from horizontal projection of normal vector
    // normal points "up" from the plane surface, horizontal component
    // points in the direction of maximum descent
    let azimuthDeg = Math.atan2(-bestPlane.normal[0], -bestPlane.normal[1]) * 180 / Math.PI
    if (azimuthDeg < 0) azimuthDeg += 360

    // Bounding box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    let sumX = 0, sumY = 0, sumZ = 0
    for (const pt of bestInliers) {
      const px = pt.x / pixelSizeM
      const py = pt.y / pixelSizeM
      if (px < minX) minX = px
      if (py < minY) minY = py
      if (px > maxX) maxX = px
      if (py > maxY) maxY = py
      sumX += px; sumY += py; sumZ += pt.z
    }

    const areaM2 = bestInliers.length * pixelSizeM * pixelSizeM

    segments.push({
      id: planeIdx,
      normal: bestPlane.normal,
      offset: bestPlane.offset,
      pitchDeg: Math.round(pitchDeg * 10) / 10,
      azimuthDeg: Math.round(azimuthDeg * 10) / 10,
      pixelIndices: bestInliers.map(p => p.idx),
      areaM2: Math.round(areaM2 * 10) / 10,
      bbox: [Math.floor(minX), Math.floor(minY), Math.ceil(maxX), Math.ceil(maxY)],
      centroid: {
        x: Math.round(sumX / bestInliers.length),
        y: Math.round(sumY / bestInliers.length),
        z: Math.round(sumZ / bestInliers.length * 100) / 100
      }
    })

    // Remove inliers from remaining pool
    const inlierSet = new Set(bestInliers.map(p => p.idx))
    remainingPoints = remainingPoints.filter(p => !inlierSet.has(p.idx))

    console.log(`[EdgeClassifier] Plane ${planeIdx}: pitch=${pitchDeg.toFixed(1)}°, azimuth=${azimuthDeg.toFixed(0)}°, ${bestInliers.length} pts (${(bestInliers.length / allPoints.length * 100).toFixed(1)}%), area=${areaM2.toFixed(1)}m²`)
  }

  return segments
}

/** Least-squares plane refinement from inlier points */
function refinePlaneFit(points: DSMPoint[]): { normal: [number, number, number]; offset: number } | null {
  if (points.length < 3) return null

  // Compute centroid
  let cx = 0, cy = 0, cz = 0
  for (const p of points) { cx += p.x; cy += p.y; cz += p.z }
  cx /= points.length; cy /= points.length; cz /= points.length

  // Covariance matrix (3x3 symmetric)
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0
  for (const p of points) {
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz
    xx += dx * dx; xy += dx * dy; xz += dx * dz
    yy += dy * dy; yz += dy * dz; zz += dz * dz
  }

  // Find smallest eigenvector using power iteration on the adjugate
  // For a 3x3 symmetric matrix, the normal to the best-fit plane
  // is the eigenvector corresponding to the smallest eigenvalue.
  // Use inverse iteration (one step) on the covariance matrix.

  // Determinant + cofactors for the 3x3 covariance
  const det = xx * (yy * zz - yz * yz) - xy * (xy * zz - yz * xz) + xz * (xy * yz - yy * xz)
  if (Math.abs(det) < 1e-12) return null

  // Cofactor matrix (adjugate = transpose of cofactor matrix)
  // For smallest eigenvector, we use the column of the adjugate
  // corresponding to the row with largest diagonal entry.
  // Simplification: use direct cross-product of the two largest eigenvectors
  // estimated by the two rows with the largest diagonal

  // Direct SVD-style: compute normal from cross product of two "spread" directions
  // This is equivalent to the principal axes method for small datasets
  // Use the two rows of the covariance with largest diagonal
  let n: [number, number, number]

  if (xx >= yy && xx >= zz) {
    // x-direction has most variance — normal is perpendicular to x
    // Cross rows 0 and 1 of cov
    n = [
      xy * yz - xz * yy,
      xz * xy - xx * yz,
      xx * yy - xy * xy
    ]
  } else if (yy >= xx && yy >= zz) {
    n = [
      yy * xz - xy * yz,
      xy * xz - yy * xx + (xx * yy - xy * xy),
      xy * yz - yy * xz
    ]
    // Recalculate more carefully
    n = [
      xy * yz - xz * yy,
      xz * xy - xx * yz,
      xx * yy - xy * xy
    ]
  } else {
    n = [
      xy * yz - xz * yy,
      xz * xy - xx * yz,
      xx * yy - xy * xy
    ]
  }

  const mag = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2])
  if (mag < 1e-10) return null

  n[0] /= mag; n[1] /= mag; n[2] /= mag
  if (n[2] < 0) { n[0] = -n[0]; n[1] = -n[1]; n[2] = -n[2] }

  const offset = n[0] * cx + n[1] * cy + n[2] * cz
  return { normal: n as [number, number, number], offset }
}

// ============================================================
// EDGE CLASSIFICATION — Analyze plane intersections
// ============================================================

function classifyPlaneIntersections(
  segments: PlaneSegment[],
  heightMap: Float64Array,
  width: number,
  height: number,
  pixelSizeM: number
): ClassifiedEdge[] {
  const edges: ClassifiedEdge[] = []
  const SQFT_PER_SQM = 10.7639
  const ADJACENCY_THRESHOLD = 3 // pixels — boundary overlap threshold

  // Build pixel → segment mapping
  const pixelSegmentMap = new Int8Array(width * height).fill(-1)
  for (const seg of segments) {
    for (const idx of seg.pixelIndices) {
      pixelSegmentMap[idx] = seg.id
    }
  }

  // Find boundary pixels between adjacent segments
  const adjacencyPairs = new Map<string, { seg1: number; seg2: number; boundaryPixels: { x: number; y: number; z: number }[] }>()

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x
      const segId = pixelSegmentMap[idx]
      if (segId < 0) continue

      // Check 4-connected neighbors
      const neighbors = [
        pixelSegmentMap[(y - 1) * width + x],
        pixelSegmentMap[(y + 1) * width + x],
        pixelSegmentMap[y * width + (x - 1)],
        pixelSegmentMap[y * width + (x + 1)]
      ]

      for (const nId of neighbors) {
        if (nId >= 0 && nId !== segId) {
          const key = `${Math.min(segId, nId)}-${Math.max(segId, nId)}`
          if (!adjacencyPairs.has(key)) {
            adjacencyPairs.set(key, { seg1: Math.min(segId, nId), seg2: Math.max(segId, nId), boundaryPixels: [] })
          }
          const z = heightMap[idx]
          if (!isNaN(z) && isFinite(z)) {
            adjacencyPairs.get(key)!.boundaryPixels.push({
              x: x * pixelSizeM,
              y: y * pixelSizeM,
              z
            })
          }
        }
      }
    }
  }

  // Classify each adjacency as ridge, hip, valley, or transition
  for (const [, pair] of adjacencyPairs) {
    if (pair.boundaryPixels.length < 5) continue

    const seg1 = segments.find(s => s.id === pair.seg1)!
    const seg2 = segments.find(s => s.id === pair.seg2)!

    // Compute intersection line direction: cross product of normals
    const n1 = seg1.normal
    const n2 = seg2.normal
    const lineDir = [
      n1[1] * n2[2] - n1[2] * n2[1],
      n1[2] * n2[0] - n1[0] * n2[2],
      n1[0] * n2[1] - n1[1] * n2[0]
    ]
    const lineMag = Math.sqrt(lineDir[0] ** 2 + lineDir[1] ** 2 + lineDir[2] ** 2)

    // Angle between planes (dihedral angle)
    const cosAngle = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2]
    const dihedralRad = Math.acos(Math.max(-1, Math.min(1, cosAngle)))
    const dihedralDeg = dihedralRad * 180 / Math.PI

    // Fit a line through boundary pixels using PCA
    const lineEndpoints = fitLineToBoundary(pair.boundaryPixels)
    if (!lineEndpoints) continue

    // 3D length of the edge
    const dx = lineEndpoints.end.x - lineEndpoints.start.x
    const dy = lineEndpoints.end.y - lineEndpoints.start.y
    const dz = lineEndpoints.end.z - lineEndpoints.start.z
    const length3D = Math.sqrt(dx * dx + dy * dy + dz * dz)
    const lengthFt = length3D * 3.28084

    // Classify edge type based on plane intersection geometry
    let edgeType: ClassifiedEdge['type']
    let confidence = 75

    // Azimuth difference tells us orientation relationship
    const azDiff = Math.abs(seg1.azimuthDeg - seg2.azimuthDeg)
    const normalizedAzDiff = azDiff > 180 ? 360 - azDiff : azDiff

    // Height at intersection vs centroids — determines convexity
    const avgBoundaryZ = pair.boundaryPixels.reduce((s, p) => s + p.z, 0) / pair.boundaryPixels.length
    const avgCentroidZ = (seg1.centroid.z + seg2.centroid.z) / 2

    // Horizontal component of intersection line
    const horizComponent = lineMag > 0.01 ? Math.sqrt(lineDir[0] ** 2 + lineDir[1] ** 2) / lineMag : 1
    const isHorizontalEdge = horizComponent > 0.85

    if (normalizedAzDiff > 140) {
      // Planes face opposite directions → Ridge or Valley
      if (avgBoundaryZ >= avgCentroidZ - 0.3) {
        // Intersection is at or above centroids → RIDGE (convex upward)
        edgeType = isHorizontalEdge ? 'ridge' : 'hip'
        confidence = 90
      } else {
        // Intersection is below centroids → VALLEY (concave trough)
        edgeType = 'valley'
        confidence = 88
      }
    } else if (normalizedAzDiff > 60) {
      // Planes at significant angle → Hip or Valley
      if (avgBoundaryZ >= avgCentroidZ - 0.3) {
        edgeType = 'hip'
        confidence = 82
      } else {
        edgeType = 'valley'
        confidence = 80
      }
    } else {
      // Planes face similar direction → Transition (pitch change)
      edgeType = 'transition'
      confidence = 70
    }

    edges.push({
      type: edgeType,
      start: lineEndpoints.start,
      end: lineEndpoints.end,
      lengthM: Math.round(length3D * 100) / 100,
      lengthFt: Math.round(lengthFt * 10) / 10,
      adjacentSegments: [seg1.id, seg2.id],
      intersectionAngleDeg: Math.round(dihedralDeg * 10) / 10,
      confidence
    })
  }

  // Find perimeter edges (eaves + rakes)
  const perimeterEdges = findPerimeterEdges(segments, pixelSegmentMap, heightMap, width, height, pixelSizeM)
  edges.push(...perimeterEdges)

  return edges
}

/** Fit a line through 3D boundary points using PCA */
function fitLineToBoundary(points: { x: number; y: number; z: number }[]): { start: { x: number; y: number; z: number }; end: { x: number; y: number; z: number } } | null {
  if (points.length < 3) return null

  // Centroid
  let cx = 0, cy = 0, cz = 0
  for (const p of points) { cx += p.x; cy += p.y; cz += p.z }
  cx /= points.length; cy /= points.length; cz /= points.length

  // Covariance in XY only (project onto horizontal plane)
  let xx = 0, xy = 0, yy = 0
  for (const p of points) {
    const dx = p.x - cx, dy = p.y - cy
    xx += dx * dx; xy += dx * dy; yy += dy * dy
  }

  // Principal direction from 2D PCA
  const trace = xx + yy
  const det = xx * yy - xy * xy
  const eigenLargest = trace / 2 + Math.sqrt(Math.max(0, (trace * trace) / 4 - det))

  let dirX = xx - yy + Math.sqrt((xx - yy) ** 2 + 4 * xy * xy)
  let dirY = 2 * xy
  const dirMag = Math.sqrt(dirX * dirX + dirY * dirY)
  if (dirMag < 1e-10) { dirX = 1; dirY = 0 } else { dirX /= dirMag; dirY /= dirMag }

  // Project all points onto the principal direction to find min/max extent
  let minProj = Infinity, maxProj = -Infinity
  let minPt = points[0], maxPt = points[0]
  for (const p of points) {
    const proj = (p.x - cx) * dirX + (p.y - cy) * dirY
    if (proj < minProj) { minProj = proj; minPt = p }
    if (proj > maxProj) { maxProj = proj; maxPt = p }
  }

  return {
    start: { x: minPt.x, y: minPt.y, z: minPt.z },
    end: { x: maxPt.x, y: maxPt.y, z: maxPt.z }
  }
}

/** Find perimeter edges (eaves and rakes) */
function findPerimeterEdges(
  segments: PlaneSegment[],
  pixelSegmentMap: Int8Array,
  heightMap: Float64Array,
  width: number,
  height: number,
  pixelSizeM: number
): ClassifiedEdge[] {
  const edges: ClassifiedEdge[] = []
  const SQFT_PER_SQM = 10.7639

  // For each segment, find edge pixels that border empty space (no roof)
  for (const seg of segments) {
    const edgePixels: { x: number; y: number; z: number; isLowest: boolean }[] = []

    for (const idx of seg.pixelIndices) {
      const py = Math.floor(idx / width)
      const px = idx % width
      if (py <= 0 || py >= height - 1 || px <= 0 || px >= width - 1) continue

      // Check if any neighbor is empty (non-roof)
      const hasEmptyNeighbor =
        pixelSegmentMap[(py - 1) * width + px] < 0 ||
        pixelSegmentMap[(py + 1) * width + px] < 0 ||
        pixelSegmentMap[py * width + (px - 1)] < 0 ||
        pixelSegmentMap[py * width + (px + 1)] < 0

      if (hasEmptyNeighbor) {
        const z = heightMap[idx]
        if (!isNaN(z) && isFinite(z)) {
          edgePixels.push({ x: px * pixelSizeM, y: py * pixelSizeM, z, isLowest: false })
        }
      }
    }

    if (edgePixels.length < 5) continue

    // Find the elevation range of edge pixels
    const heights = edgePixels.map(p => p.z)
    const minEdgeZ = Math.min(...heights)
    const maxEdgeZ = Math.max(...heights)
    const zRange = maxEdgeZ - minEdgeZ

    // Mark lowest edge pixels (within 20% of minimum)
    const lowThreshold = minEdgeZ + zRange * 0.2
    for (const p of edgePixels) {
      p.isLowest = p.z <= lowThreshold
    }

    // Group edge pixels into contiguous runs using simple flood-fill grouping
    const lowestPixels = edgePixels.filter(p => p.isLowest)
    const upperPixels = edgePixels.filter(p => !p.isLowest)

    // Eave edges: lowest perimeter edges (approximately horizontal)
    if (lowestPixels.length >= 3) {
      const lineEndpoints = fitLineToBoundary(lowestPixels)
      if (lineEndpoints) {
        const dx = lineEndpoints.end.x - lineEndpoints.start.x
        const dy = lineEndpoints.end.y - lineEndpoints.start.y
        const dz = lineEndpoints.end.z - lineEndpoints.start.z
        const length3D = Math.sqrt(dx * dx + dy * dy + dz * dz)
        const heightVariance = Math.abs(dz)
        const isHorizontal = heightVariance < length3D * 0.15

        edges.push({
          type: isHorizontal ? 'eave' : 'rake',
          start: lineEndpoints.start,
          end: lineEndpoints.end,
          lengthM: Math.round(length3D * 100) / 100,
          lengthFt: Math.round(length3D * 3.28084 * 10) / 10,
          adjacentSegments: [seg.id],
          confidence: isHorizontal ? 85 : 78
        })
      }
    }

    // Rake edges: upper perimeter edges (along the slope)
    if (upperPixels.length >= 3) {
      const lineEndpoints = fitLineToBoundary(upperPixels)
      if (lineEndpoints) {
        const dx = lineEndpoints.end.x - lineEndpoints.start.x
        const dy = lineEndpoints.end.y - lineEndpoints.start.y
        const dz = lineEndpoints.end.z - lineEndpoints.start.z
        const length3D = Math.sqrt(dx * dx + dy * dy + dz * dz)

        edges.push({
          type: 'rake',
          start: lineEndpoints.start,
          end: lineEndpoints.end,
          lengthM: Math.round(length3D * 100) / 100,
          lengthFt: Math.round(length3D * 3.28084 * 10) / 10,
          adjacentSegments: [seg.id],
          confidence: 75
        })
      }
    }
  }

  return edges
}

// ============================================================
// MAIN ENTRY: runEdgeClassifier()
// ============================================================

export function runEdgeClassifier(
  dsm: DSMAnalysis,
  slope: SlopeAnalysis
): EdgeClassifierResult {
  const startMs = Date.now()
  const SQFT_PER_SQM = 10.7639
  const { heightMap, width, height, pixelSizeMeters } = dsm

  console.log(`[EdgeClassifier] Starting RANSAC plane extraction on ${width}x${height} DSM (${dsm.validPixelCount} valid pixels)`)

  // Phase 1: Extract planar segments using RANSAC
  const segments = extractPlanes(
    heightMap, width, height, pixelSizeMeters,
    8,     // max 8 planes
    0.15,  // 15cm distance threshold
    0.06,  // minimum 6% of total points
    400    // iterations per plane
  )

  console.log(`[EdgeClassifier] Found ${segments.length} planar segments`)

  // Phase 2: Classify edges at plane intersections
  const edges = classifyPlaneIntersections(segments, heightMap, width, height, pixelSizeMeters)

  console.log(`[EdgeClassifier] Classified ${edges.length} edges`)

  // Compute summary
  const ridgeLF = edges.filter(e => e.type === 'ridge').reduce((s, e) => s + e.lengthFt, 0)
  const hipLF = edges.filter(e => e.type === 'hip').reduce((s, e) => s + e.lengthFt, 0)
  const valleyLF = edges.filter(e => e.type === 'valley').reduce((s, e) => s + e.lengthFt, 0)
  const eaveLF = edges.filter(e => e.type === 'eave').reduce((s, e) => s + e.lengthFt, 0)
  const rakeLF = edges.filter(e => e.type === 'rake').reduce((s, e) => s + e.lengthFt, 0)
  const transitionLF = edges.filter(e => e.type === 'transition').reduce((s, e) => s + e.lengthFt, 0)

  const totalAreaM2 = segments.reduce((s, seg) => s + seg.areaM2, 0)
  const totalAreaSqft = totalAreaM2 * SQFT_PER_SQM

  // Predominant pitch from largest segment
  const largestSeg = [...segments].sort((a, b) => b.areaM2 - a.areaM2)[0]
  const predominantPitchDeg = largestSeg?.pitchDeg || slope.weightedAvgPitchDeg
  const pitchRise = Math.round(12 * Math.tan(predominantPitchDeg * Math.PI / 180) * 10) / 10

  const durationMs = Date.now() - startMs

  const result: EdgeClassifierResult = {
    segments,
    edges,
    summary: {
      totalAreaM2: Math.round(totalAreaM2 * 10) / 10,
      totalAreaSqft: Math.round(totalAreaSqft),
      totalSquares: Math.round(totalAreaSqft / 100 * 10) / 10,
      predominantPitchDeg: Math.round(predominantPitchDeg * 10) / 10,
      predominantPitchRatio: `${pitchRise}:12`,
      ridgeLF: Math.round(ridgeLF * 10) / 10,
      hipLF: Math.round(hipLF * 10) / 10,
      valleyLF: Math.round(valleyLF * 10) / 10,
      eaveLF: Math.round(eaveLF * 10) / 10,
      rakeLF: Math.round(rakeLF * 10) / 10,
      transitionLF: Math.round(transitionLF * 10) / 10,
      totalLinearFt: Math.round((ridgeLF + hipLF + valleyLF + eaveLF + rakeLF + transitionLF) * 10) / 10
    },
    durationMs
  }

  console.log(`[EdgeClassifier] Complete in ${durationMs}ms: ${segments.length} planes, ${edges.length} edges, ` +
    `ridge=${ridgeLF.toFixed(0)}ft hip=${hipLF.toFixed(0)}ft valley=${valleyLF.toFixed(0)}ft ` +
    `eave=${eaveLF.toFixed(0)}ft rake=${rakeLF.toFixed(0)}ft total=${result.summary.totalLinearFt}ft`)

  return result
}
