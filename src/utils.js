// modified from https://github.com/yomotsu/camera-controls/blob/ed5b9df134717c8b3e7c7d2a6621cdd2a717b580/src/CameraControls.ts#L2332
import * as THREE from 'three'

/**
 * Calculate the distance to fit the box.
 * @param width box width
 * @param height box height
 * @param depth box depth
 * @param fov field of view in degrees
 * @param aspect camera aspect ratio
 * @returns distance
 * @category Methods
 */
export const getDistanceToFitBox = (width, height, depth, fov, aspect, cover = false) => {
  const boundingRectAspect = width / height
  const fovRad = THREE.MathUtils.degToRad(fov)

  const heightToFit = (cover ? boundingRectAspect > aspect : boundingRectAspect < aspect)
    ? height
    : width / aspect
  return (heightToFit * 0.5) / Math.tan(fovRad * 0.5) + depth * 0.5
}
