/* OpenCV-only image cleanup. All coordinates refer to the returned cleaned image. */
const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function orderCorners(points){
  const sorted=points.slice().sort((a,b)=>a[1]-b[1]);
  const top=sorted.slice(0,2).sort((a,b)=>a[0]-b[0]);
  const bottom=sorted.slice(2).sort((a,b)=>a[0]-b[0]);
  return [top[0],top[1],bottom[1],bottom[0]];
}
function paperCorners(cv,rgba){
  const scale=Math.min(1,1000/Math.max(rgba.cols,rgba.rows));
  const small=new cv.Mat(),gray=new cv.Mat(),blur=new cv.Mat(),edges=new cv.Mat(),closed=new cv.Mat();
  const contours=new cv.MatVector(),hierarchy=new cv.Mat(),kernel=cv.Mat.ones(5,5,cv.CV_8U);
  try{
    cv.resize(rgba,small,new cv.Size(Math.round(rgba.cols*scale),Math.round(rgba.rows*scale)),0,0,cv.INTER_AREA);
    cv.cvtColor(small,gray,cv.COLOR_RGBA2GRAY);cv.GaussianBlur(gray,blur,new cv.Size(5,5),0);
    cv.Canny(blur,edges,35,110);cv.morphologyEx(edges,closed,cv.MORPH_CLOSE,kernel);
    cv.findContours(closed,contours,hierarchy,cv.RETR_LIST,cv.CHAIN_APPROX_SIMPLE);
    let best=null,bestArea=0;
    for(let i=0;i<contours.size();i++){
      const contour=contours.get(i),approx=new cv.Mat();
      try{
        const area=Math.abs(cv.contourArea(contour));
        // A table rectangle must not be mistaken for the paper and crop off its heading.
        if(area<small.cols*small.rows*.55||area<=bestArea)continue;
        cv.approxPolyDP(contour,approx,.018*cv.arcLength(contour,true),true);
        if(approx.rows!==4||!cv.isContourConvex(approx))continue;
        const points=[];for(let j=0;j<4;j++)points.push([approx.data32S[j*2]/scale,approx.data32S[j*2+1]/scale]);
        const ordered=orderCorners(points),width=Math.max(distance(ordered[0],ordered[1]),distance(ordered[2],ordered[3])),height=Math.max(distance(ordered[0],ordered[3]),distance(ordered[1],ordered[2]));
        if(width/height<.25||width/height>4)continue;
        best=ordered;bestArea=area;
      }finally{approx.delete();contour.delete();}
    }
    return best;
  }finally{small.delete();gray.delete();blur.delete();edges.delete();closed.delete();contours.delete();hierarchy.delete();kernel.delete();}
}
function verticalRules(cv,binary){
  const inverted=new cv.Mat(),lines=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat();
  const kernel=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(1,Math.max(50,Math.round(binary.rows*.12))));
  try{
    cv.bitwise_not(binary,inverted);cv.morphologyEx(inverted,lines,cv.MORPH_OPEN,kernel);
    cv.findContours(lines,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
    const found=[];
    for(let i=0;i<contours.size();i++){const c=contours.get(i);try{const r=cv.boundingRect(c);if(r.height>binary.rows*.12&&r.width<binary.cols*.025)found.push({x:r.x+r.width/2,y:r.y,height:r.height});}finally{c.delete();}}
    return found.sort((a,b)=>a.x-b.x).filter((r,i,a)=>!i||r.x-a[i-1].x>6);
  }finally{inverted.delete();lines.delete();contours.delete();hierarchy.delete();kernel.delete();}
}
function normaliseDarkLabels(cv,gray,cleaned){
  const samples=[];for(let i=0;i<gray.data.length;i+=997)samples.push(gray.data[i]);samples.sort((a,b)=>a-b);const paper=samples[Math.floor(samples.length*.65)]||190;
  const mask=new cv.Mat(),closed=new cv.Mat(),blocks=new cv.Mat(),contours=new cv.MatVector(),hierarchy=new cv.Mat();
  const closeKernel=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(19,5)),openKernel=cv.getStructuringElement(cv.MORPH_RECT,new cv.Size(Math.max(60,Math.round(gray.cols*.025)),Math.max(8,Math.round(gray.rows*.005))));
  let count=0;
  try{
    cv.threshold(gray,mask,paper*.84,255,cv.THRESH_BINARY_INV);cv.morphologyEx(mask,closed,cv.MORPH_CLOSE,closeKernel);cv.morphologyEx(closed,blocks,cv.MORPH_OPEN,openKernel);
    cv.findContours(blocks,contours,hierarchy,cv.RETR_EXTERNAL,cv.CHAIN_APPROX_SIMPLE);
    for(let i=0;i<contours.size();i++){
      const contour=contours.get(i);let roi=null,target=null,binary=null;
      try{
        const r=cv.boundingRect(contour);
        if(r.height<10||r.height>gray.rows*.08||r.width<r.height*2||r.width*r.height>gray.cols*gray.rows*.12)continue;
        roi=gray.roi(r);if(cv.mean(roi)[0]>paper*.84)continue;
        binary=new cv.Mat();cv.threshold(roi,binary,0,255,cv.THRESH_BINARY+cv.THRESH_OTSU);cv.bitwise_not(binary,binary);target=cleaned.roi(r);binary.copyTo(target);count++;
      }finally{contour.delete();roi?.delete();target?.delete();binary?.delete();}
    }
    return count;
  }finally{mask.delete();closed.delete();blocks.delete();contours.delete();hierarchy.delete();closeKernel.delete();openKernel.delete();}
}
export function matPixels(cv,mat){
  const rgba=new cv.Mat();try{if(mat.channels()===1)cv.cvtColor(mat,rgba,cv.COLOR_GRAY2RGBA);else if(mat.channels()===3)cv.cvtColor(mat,rgba,cv.COLOR_RGB2RGBA);else mat.copyTo(rgba);return {width:rgba.cols,height:rgba.rows,data:new Uint8ClampedArray(rgba.data)};}finally{rgba.delete();}
}
export function preprocessImage(cv,input,{maxSide=2600,minSide=1500}={}){
  const source=cv.matFromImageData(input),warnings=[];
  const detected=paperCorners(cv,source);
  const corners=detected||[[0,0],[source.cols-1,0],[source.cols-1,source.rows-1],[0,source.rows-1]];
  if(!detected)warnings.push('Paper edges were not confidently detected; the full image was retained.');
  const naturalW=Math.max(distance(corners[0],corners[1]),distance(corners[2],corners[3]));
  const naturalH=Math.max(distance(corners[0],corners[3]),distance(corners[1],corners[2]));
  let scale=Math.min(1,maxSide/Math.max(naturalW,naturalH));
  if(Math.max(naturalW,naturalH)<minSide)scale=Math.min(2,minSide/Math.max(naturalW,naturalH));
  const width=Math.max(64,Math.round(naturalW*scale)),height=Math.max(64,Math.round(naturalH*scale));
  const from=cv.matFromArray(4,1,cv.CV_32FC2,corners.flat()),to=cv.matFromArray(4,1,cv.CV_32FC2,[0,0,width-1,0,width-1,height-1,0,height-1]);
  const transform=cv.getPerspectiveTransform(from,to),warped=new cv.Mat(),gray=new cv.Mat(),background=new cv.Mat(),normalised=new cv.Mat(),cleaned=new cv.Mat(),adaptive=new cv.Mat();
  try{
    cv.warpPerspective(source,warped,transform,new cv.Size(width,height),cv.INTER_CUBIC,cv.BORDER_REPLICATE);
    cv.cvtColor(warped,gray,cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray,background,new cv.Size(0,0),Math.max(15,Math.min(width,height)/65));
    cv.divide(gray,background,normalised,255);
    cv.adaptiveThreshold(normalised,cleaned,255,cv.ADAPTIVE_THRESH_GAUSSIAN_C,cv.THRESH_BINARY,35,13);
    cleaned.copyTo(adaptive);
    // Retain antialiasing and faint decimal points. A hard binary image erases
    // small type; blend the adaptive shadow mask with the normalised grayscale.
    cv.addWeighted(normalised,.85,cleaned,.15,0,cleaned);
    const darkLabelsNormalised=normaliseDarkLabels(cv,gray,cleaned);
    const pixels=matPixels(cv,cleaned),rules=verticalRules(cv,cleaned);
    const info={originalWidth:source.cols,originalHeight:source.rows,width,height,paperDetected:Boolean(detected),corners,homography:Array.from(transform.data64F),scale,darkLabelsNormalised,method:'EXIF decode → paper quadrilateral → perspective warp → grayscale → illumination normalisation → adaptive Gaussian mask blended with grayscale → dark header inversion',warnings};
    return {mat:cleaned.clone(),binaryMat:adaptive.clone(),pixels,verticalRules:rules,info};
  }finally{source.delete();from.delete();to.delete();transform.delete();warped.delete();gray.delete();background.delete();normalised.delete();cleaned.delete();adaptive.delete();}
}
