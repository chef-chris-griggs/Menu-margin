import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeLinesFromOcr} from '../scanner/recipe-lines.js';
const fragment=(text,x,y,w=80,score=.96)=>({poly:[[x,y],[x+w,y],[x+w,y+30],[x,y+30]],words:[{text,score}]});
test('rejoins fragments on same printed ingredient row in x-order',()=>{
 const out=recipeLinesFromOcr([
  fragment('500',30,170,68),fragment('onions',190,173,150),
  fragment('g',110,171,28),fragment('Ingredients',30,90,250),
  fragment('chicken breast',200,250,260),fragment('1000',30,248,95),fragment('g',143,249,30)
 ]);
 assert.deepEqual(out.lines.map(l=>l.text),['Ingredients','500 g onions','1000 g chicken breast']);
});
test('keeps physically separate recipe rows apart and ignores stray punctuation',()=>{
 const out=recipeLinesFromOcr([fragment('5',30,100),fragment('kg beef',120,160),fragment('−',15,145)]);
 assert.deepEqual(out.lines.map(l=>l.text),['5','kg beef']);
 assert.match(out.warnings.join(' '),/bullet/);
});
test('retains unpositioned text for chef review rather than dropping it',()=>{
 const out=recipeLinesFromOcr([{words:[{text:'salt',score:.5}]}]);
 assert.equal(out.lines[0].text,'salt');assert.equal(out.lines[0].confidence,.5);
});
