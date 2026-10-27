/*
 * Copyright (c) 2026 PaddlePaddle Authors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import type { OpenCv, Mat } from "@techstark/opencv-js";

import { getMiniBoxFromPoints } from "../../models/common";
import type { Point2D } from "../../models/common";
import type { CropGeometry } from "./word-geometry";

export interface OcrCrop { mat: Mat; geometry: CropGeometry; }

export function cropByPolyWithGeometry(cv: OpenCv, srcMat: Mat, poly: Point2D[]): OcrCrop {
  const ordered = getMiniBoxFromPoints(cv, poly).box;
  const widthTop = Math.hypot(ordered[1][0] - ordered[0][0], ordered[1][1] - ordered[0][1]);
  const widthBottom = Math.hypot(ordered[2][0] - ordered[3][0], ordered[2][1] - ordered[3][1]);
  const heightLeft = Math.hypot(ordered[3][0] - ordered[0][0], ordered[3][1] - ordered[0][1]);
  const heightRight = Math.hypot(ordered[2][0] - ordered[1][0], ordered[2][1] - ordered[1][1]);
  const cropW = Math.max(1, Math.floor(Math.max(widthTop, widthBottom)));
  const cropH = Math.max(1, Math.floor(Math.max(heightLeft, heightRight)));

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered[0][0],
    ordered[0][1],
    ordered[1][0],
    ordered[1][1],
    ordered[2][0],
    ordered[2][1],
    ordered[3][0],
    ordered[3][1]
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, cropW, 0, cropW, cropH, 0, cropH]);
  const transform = cv.getPerspectiveTransform(srcTri, dstTri);
  const inverse = cv.getPerspectiveTransform(dstTri, srcTri);
  const geometry: CropGeometry = {
    cropWidth: cropW,
    cropHeight: cropH,
    rotated90: cropH / Math.max(1, cropW) >= 1.5,
    inverseTransform: Array.from(inverse.data64F)
  };
  const warped = new cv.Mat();
  cv.warpPerspective(
    srcMat,
    warped,
    transform,
    new cv.Size(cropW, cropH),
    cv.INTER_CUBIC,
    cv.BORDER_REPLICATE,
    new cv.Scalar()
  );
  srcTri.delete();
  dstTri.delete();
  transform.delete();
  inverse.delete();

  if (warped.rows / Math.max(1, warped.cols) >= 1.5) {
    const rotated = new cv.Mat();
    cv.rotate(warped, rotated, cv.ROTATE_90_COUNTERCLOCKWISE);
    warped.delete();
    return { mat: rotated, geometry };
  }
  return { mat: warped, geometry };
}

export function cropByPoly(cv: OpenCv, srcMat: Mat, poly: Point2D[]): Mat {
  return cropByPolyWithGeometry(cv, srcMat, poly).mat;
}
