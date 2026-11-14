// Synthetic printed document fixtures, not real photographs or handwriting.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
const dir=new URL('../tests/fixtures/recipes/',import.meta.url);await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true});
try{
 const page=await browser.newPage();
 const images=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=1200;c.height=1250;const x=c.getContext('2d');
  x.fillStyle='#b9b5ab';x.fillRect(0,0,c.width,c.height);x.translate(34,15);x.rotate(.007);x.fillStyle='#fcfaf4';x.fillRect(0,0,1120,1200);
  x.fillStyle='#171d19';x.font='bold 54px Arial';x.fillText('CHICKEN CURRY',55,135);x.font='46px Arial';
  ['Serves: 10','Ingredients','1000 g chicken breast','500 g onions','800 ml coconut milk','Method','Simmer and serve'].forEach((line,i)=>x.fillText(line,55,245+i*110));
  const shade=x.createLinearGradient(0,0,1100,1200);shade.addColorStop(0,'rgba(70,60,40,.12)');shade.addColorStop(.5,'rgba(0,0,0,0)');shade.addColorStop(1,'rgba(70,60,40,.08)');x.fillStyle=shade;x.fillRect(0,0,1120,1200);
  return {jpg:c.toDataURL('image/jpeg',.9).split(',')[1],png:c.toDataURL('image/png').split(',')[1]};
 });
 for(const [ext,data] of Object.entries(images))await writeFile(new URL('printed-recipe.'+ext,dir),Buffer.from(data,'base64'));
 const jpg=Buffer.from(images.jpg,'base64'),objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Count 1 /Kids [3 0 R] >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 625] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>'),Buffer.concat([Buffer.from('<< /Type /XObject /Subtype /Image /Width 1200 /Height 1250 /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+jpg.length+' >>\nstream\n'),jpg,Buffer.from('\nendstream')])];
 const draw='q 600 0 0 625 0 0 cm /Im0 Do Q';objects.push(Buffer.from('<< /Length '+draw.length+' >>\nstream\n'+draw+'\nendstream'));
 let chunks=[Buffer.from('%PDF-1.4\n')],offsets=[0],size=chunks[0].length;
 objects.forEach((obj,i)=>{offsets.push(size);const b=Buffer.concat([Buffer.from((i+1)+' 0 obj\n'),obj,Buffer.from('\nendobj\n')]);chunks.push(b);size+=b.length;});
 chunks.push(Buffer.from('xref\n0 6\n0000000000 65535 f \n'+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+'trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n'+size+'\n%%EOF'));
 await writeFile(new URL('printed-recipe.pdf',dir),Buffer.concat(chunks));
}finally{await browser.close();}
