import test from 'node:test';
import assert from 'node:assert/strict';
import {extractPage} from '../scanner/table.js';
import {refineUnreadableCells} from '../scanner/refine.js';
const w=(text,x,y,width=String(text).length*9)=>({id:text+x+y,text,confidence:.99,poly:[[x,y],[x+width,y],[x+width,y+20],[x,y+20]]});
const words=()=>[w('Description',100,100),w('Pack',430,100),w('Size',480,100),w('Qty',600,100),w('Unit',700,100),w('Price',750,100),w('Net',850,100),w('Amount',895,100),w('Tomatoes',100,160),w('10x250g',440,160),w('2',600,160),w('£99.00',720,160),w('£6.00',880,160)];
test('a plausible wrong amount is reread from image evidence and both readings remain inspectable',async()=>{
 const raw=words(),page=extractPage(raw,{width:1000,height:500});
 const result=await refineUnreadableCells({recognizeRegions:async(mat,polys)=>polys.map(poly=>({score:.99,words:[{text:poly[0][0]>650&&poly[0][0]<800?'£3.00':'unreadable',score:.99,poly}]}))},{pixels:{width:1000,height:500},grayMat:{}},raw,page);
 const price=result.refinements.find(r=>r.field==='unitPrice');assert.equal(price.accepted,true);assert.equal(price.originalWords[0].text,'£99.00');assert.equal(price.candidateWords[0].text,'£3.00');
 assert.equal(result.page.rows[0].unitPrice,3);assert.equal(result.page.rows[0].needsReview,true,'Image rereads still require chef confirmation');
});
test('a reread with zero pack count cannot replace an existing valid pack',async()=>{
 const raw=words(),page=extractPage(raw,{width:1000,height:500});
 const result=await refineUnreadableCells({recognizeRegions:async(mat,polys)=>polys.map(poly=>({score:.99,words:[{text:'0x250g',score:.99,poly}]}))},{pixels:{width:1000,height:500},grayMat:{}},raw,page);
 const pack=result.refinements.find(r=>r.field==='pack');assert.equal(pack.accepted,false);assert.deepEqual(result.page.rows[0].pack,{caseCount:10,eachSize:250,unit:'g'});
});
