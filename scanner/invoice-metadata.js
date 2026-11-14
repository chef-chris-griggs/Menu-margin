/** Read small footer labels from a bounded, enlarged image region.
 * These words are used only for labelled totals and page references, never products. */
export async function rereadInvoiceMetadata(cv,ocr,prepared,{pageNumber=1,progress=()=>{}}={}){
 const {width,height}=prepared.pixels;
 const left=Math.floor(width*.45),top=Math.floor(height*.66),w=width-left,h=height-top;
 const scale=Math.min(2,1600/Math.max(w,h));
 let crop=null,large=null;
 try{
  crop=prepared.grayMat.roi(new cv.Rect(left,top,w,h));large=new cv.Mat();
  cv.resize(crop,large,new cv.Size(Math.round(w*scale),Math.round(h*scale)),0,0,cv.INTER_CUBIC);
  progress('Checking printed page numbers and labelled totals…');
  const [result]=await ocr.predict(large,{textRecScoreThresh:0});
  return (result?.items||[]).flatMap((line,li)=>(line.words||[]).map((word,wi)=>({id:`p${pageNumber}-footer${li}-${wi}`,text:word.text,confidence:word.score,poly:word.poly.map(([x,y])=>[x/scale+left,y/scale+top]),metadataReread:true})));
 }finally{crop?.delete();large?.delete();}
}
