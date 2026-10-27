/* Copyright (c) 2026 PaddlePaddle Authors. SPDX-License-Identifier: Apache-2.0
 * MenuMargin modified SDK: CTC word alignments, same OpenCV runtime as preprocessing.
 */
export { PaddleOCR, normalizeOcrPipelineConfig, parseOcrPipelineConfigText } from "./pipelines/ocr/index";
export { initOpenCvRuntime } from "./runtime/opencv";
export type { OcrResult, OcrResultItem, OcrResultWord } from "./pipelines/ocr/core";
