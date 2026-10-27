import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeCtcSample, positionCtcResult } from './models/ctc.ts';
import { mapCropInterval, mapCropPoint } from './pipelines/ocr/word-geometry.ts';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-6, `${actual} != ${expected}`);
function logits(labels, dictionary, scores = []) {
  const classes = dictionary.length + 1;
  const data = new Float32Array(labels.length * classes).fill(.001);
  labels.forEach((label, step) => { data[step * classes + (label === null ? 0 : dictionary.indexOf(label) + 1)] = scores[step] ?? .9; });
  return { data, classes };
}

test('CTC collapses consecutive runs but preserves identical characters separated by blanks', () => {
  const dictionary = ['A', 'B', ' '];
  const labels = [null, 'A', 'A', null, 'A', ' ', 'B', 'B', null];
  const { data, classes } = logits(labels, dictionary, [.9, .6, .8]);
  const decoded = decodeCtcSample(data, 0, labels.length, classes, dictionary);
  assert.equal(decoded.text, 'AA B');
  assert.deepEqual(decoded.characters.map(c => [c.text, c.startStep, c.endStep]), [['A', 1, 3], ['A', 4, 5], [' ', 5, 6], ['B', 6, 8]]);
  close(decoded.characters[0].score, .7);
});

test('word coordinates follow uneven CTC spans and remove the full batch padding width', () => {
  const dictionary = ['A', 'B', ' '];
  const labels = Array(32).fill(null);
  for (const i of [1, 2, 3]) labels[i] = 'A';
  labels[5] = ' ';
  labels[6] = 'B'; labels[7] = 'B';
  const { data, classes } = logits(labels, dictionary);
  const result = positionCtcResult(decodeCtcSample(data, 0, labels.length, classes, dictionary), 640, 160);
  assert.deepEqual(result.words.map(w => w.text), ['A', 'B']);
  close(result.words[0].xStart, .125); close(result.words[0].xEnd, .5);
  close(result.words[1].xStart, .75); close(result.words[1].xEnd, 1);
  assert.notEqual(result.words[0].xEnd - result.words[0].xStart, result.words[1].xEnd - result.words[1].xStart);
  assert.equal(result.words[0].positionSource, 'ctc');
});

test('low-confidence GBP words are retained with their real probabilities', () => {
  const dictionary = ['£', '1', ',', '2', '.', '5', '0'];
  const labels = ['£', '1', ',', '2', '5', '0', '.', '0', null, '0'];
  const { data, classes } = logits(labels, dictionary, Array(labels.length).fill(.2));
  const result = positionCtcResult(decodeCtcSample(data, 0, labels.length, classes, dictionary), 100, 100);
  assert.equal(result.text, '£1,250.00');
  assert.equal(result.words.length, 1);
  close(result.words[0].score, .2);
});

test('predictions in padding stay visible and explicitly flag clipped geometry', () => {
  const dictionary = ['A'];
  const labels = Array(16).fill(null); labels[15] = 'A';
  const { data, classes } = logits(labels, dictionary);
  const result = positionCtcResult(decodeCtcSample(data, 0, labels.length, classes, dictionary), 320, 160);
  assert.equal(result.words[0].text, 'A');
  assert.equal(result.words[0].alignmentClipped, true);
  assert.equal(result.words[0].xStart, 1);
  assert.equal(result.words[0].xEnd, 1);
});

test('a mismatched character dictionary fails instead of decoding wrong labels', () => {
  assert.throws(() => decodeCtcSample(new Float32Array(4), 0, 1, 4, ['A']), /dictionary/);
});

test('word intervals map through the actual affine crop transform', () => {
  const geometry = { cropWidth: 200, cropHeight: 40, rotated90: false, inverseTransform: [1, 0, 10, 0, 1, 20, 0, 0, 1] };
  assert.deepEqual(mapCropInterval(geometry, .1, .3), [[30, 20], [70, 20], [70, 60], [30, 60]]);
});

test('perspective division is applied when mapping a word onto a photographed page', () => {
  const geometry = { cropWidth: 200, cropHeight: 40, rotated90: false, inverseTransform: [1, 0, 100, 0, 1, 50, .002, 0, 1] };
  const point = mapCropPoint(geometry, .5, .25);
  close(point[0], 200 / 1.2);
  close(point[1], 60 / 1.2);
});

test('tall text crops reverse the 90-degree counterclockwise rotation before projection', () => {
  const geometry = { cropWidth: 20, cropHeight: 100, rotated90: true, inverseTransform: [1, 0, 0, 0, 1, 0, 0, 0, 1] };
  assert.deepEqual(mapCropInterval(geometry, .2, .5), [[20, 20], [20, 50], [0, 50], [0, 20]]);
});
