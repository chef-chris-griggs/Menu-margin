/* SPDX-License-Identifier: Apache-2.0
 * MenuMargin: project CTC alignment through the actual OCR crop transform.
 */
import type { Point2D } from "../../models/common";

export interface CropGeometry {
  cropWidth: number;
  cropHeight: number;
  rotated90: boolean;
  inverseTransform: number[];
}

export function mapCropPoint(geometry: CropGeometry, xFraction: number, yFraction: number): Point2D {
  const { cropWidth, cropHeight, rotated90, inverseTransform: h } = geometry;
  if (h.length !== 9 || !h.every(Number.isFinite)) throw new Error("Invalid OCR crop homography.");
  const rx = xFraction * (rotated90 ? cropHeight : cropWidth);
  const ry = yFraction * (rotated90 ? cropWidth : cropHeight);
  const x = rotated90 ? cropWidth - ry : rx;
  const y = rotated90 ? rx : ry;
  const denominator = h[6] * x + h[7] * y + h[8];
  if (Math.abs(denominator) < 1e-12) throw new Error("OCR crop homography maps a word to infinity.");
  return [(h[0] * x + h[1] * y + h[2]) / denominator, (h[3] * x + h[4] * y + h[5]) / denominator];
}

export function mapCropInterval(geometry: CropGeometry, xStart: number, xEnd: number): Point2D[] {
  return [mapCropPoint(geometry, xStart, 0), mapCropPoint(geometry, xEnd, 0), mapCropPoint(geometry, xEnd, 1), mapCropPoint(geometry, xStart, 1)];
}
