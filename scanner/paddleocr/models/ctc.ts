/*
 * Copyright (c) 2026 PaddlePaddle Authors. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 * MenuMargin modification: retain CTC alignment and confidence for positioned words.
 */

export interface CtcCharacter {
  text: string;
  score: number;
  startStep: number;
  endStep: number;
}

export interface PositionedCtcCharacter extends CtcCharacter {
  xStart: number;
  xEnd: number;
  alignmentClipped: boolean;
}

export interface PositionedCtcWord {
  text: string;
  score: number;
  xStart: number;
  xEnd: number;
  startStep: number;
  endStep: number;
  positionSource: "ctc";
  alignmentClipped: boolean;
}

export interface CtcResult {
  text: string;
  score: number;
  timeSteps: number;
  characters: CtcCharacter[];
}

export interface PositionedCtcResult extends Omit<CtcResult, "characters"> {
  characters: PositionedCtcCharacter[];
  words: PositionedCtcWord[];
  alignment: { inputWidth: number; resizedWidth: number; timeSteps: number };
}

/** Greedy CTC decode, retaining the actual nonblank timestep runs. */
export function decodeCtcSample(
  data: Float32Array,
  offset: number,
  timeSteps: number,
  classes: number,
  charDict: string[]
): CtcResult {
  if (timeSteps < 0 || classes < 1 || offset < 0 || offset + timeSteps * classes > data.length) {
    throw new Error("Invalid recognition tensor dimensions.");
  }
  if (classes !== charDict.length + 1) {
    throw new Error(`Recognition dictionary has ${charDict.length} labels but model emits ${classes - 1}.`);
  }
  const characters: CtcCharacter[] = [];
  let previousIndex = -1;
  let run: CtcCharacter | null = null;
  let runProbabilitySum = 0;
  let runLength = 0;
  for (let step = 0; step < timeSteps; step += 1) {
    let index = 0;
    let probability = -Infinity;
    const stepOffset = offset + step * classes;
    for (let label = 0; label < classes; label += 1) {
      const value = data[stepOffset + label];
      if (value > probability) { probability = value; index = label; }
    }
    if (!Number.isFinite(probability)) throw new Error("Recognition tensor contains nonfinite values.");
    if (index > 0) {
      if (index === previousIndex && run) {
        runProbabilitySum += probability;
        runLength += 1;
        run.endStep = step + 1;
        run.score = runProbabilitySum / runLength;
      } else {
        runProbabilitySum = probability;
        runLength = 1;
        run = { text: charDict[index - 1], score: probability, startStep: step, endStep: step + 1 };
        characters.push(run);
      }
    } else {
      run = null;
    }
    previousIndex = index;
  }
  return {
    text: characters.map(character => character.text).join(""),
    score: characters.length ? characters.reduce((sum, character) => sum + character.score, 0) / characters.length : 0,
    timeSteps,
    characters
  };
}

/** Remove recognition/batch padding from the timestep coordinate system. */
export function positionCtcResult(decoded: CtcResult, inputWidth: number, resizedWidth: number): PositionedCtcResult {
  if (!(inputWidth > 0) || !(resizedWidth > 0) || resizedWidth > inputWidth || decoded.timeSteps < 1) {
    throw new Error("Invalid recognition alignment dimensions.");
  }
  const factor = inputWidth / (decoded.timeSteps * resizedWidth);
  const characters = decoded.characters.map(character => {
    const start = character.startStep * factor;
    const end = character.endStep * factor;
    return {
      ...character,
      xStart: Math.min(1, Math.max(0, start)),
      xEnd: Math.min(1, Math.max(0, end)),
      alignmentClipped: start < 0 || end > 1
    };
  });
  const words: PositionedCtcWord[] = [];
  let wordCharacters: PositionedCtcCharacter[] = [];
  const flush = () => {
    if (!wordCharacters.length) return;
    const first = wordCharacters[0], last = wordCharacters[wordCharacters.length - 1];
    words.push({
      text: wordCharacters.map(character => character.text).join(""),
      score: wordCharacters.reduce((sum, character) => sum + character.score, 0) / wordCharacters.length,
      startStep: first.startStep,
      endStep: last.endStep,
      xStart: first.xStart,
      xEnd: last.xEnd,
      positionSource: "ctc",
      alignmentClipped: wordCharacters.some(character => character.alignmentClipped)
    });
    wordCharacters = [];
  };
  for (const character of characters) {
    if (character.text.trim() === "") flush();
    else wordCharacters.push(character);
  }
  flush();
  return { ...decoded, characters, words, alignment: { inputWidth, resizedWidth, timeSteps: decoded.timeSteps } };
}
