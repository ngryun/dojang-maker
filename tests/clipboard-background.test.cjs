// Run with Playwright available: node tests/clipboard-background.test.cjs
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:360,height:780}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.route('https://fonts.googleapis.com/**',route=>route.fulfill({contentType:'text/css',body:''}));
    await page.goto(pathToFileURL(path.join(__dirname,'../index.html')).href);
    assert.equal(await page.locator('#size').inputValue(),'256');
    await page.evaluate(()=>{
      window.copied=[];
      window.ClipboardItem=class{constructor(data){this.data=data}};
      Object.defineProperty(navigator,'clipboard',{configurable:true,value:{write:async items=>{
        window.copied.push(await items[0].data['image/png']);
      }}});
    });
    for(const style of ['yang','eum']){
      await page.evaluate(style=>{S.style=style;S.ink=40},style);
      await page.locator('#copyWhite').click();
      await page.waitForFunction(()=>!document.getElementById('copyWhite').disabled);
      const result=await page.evaluate(async()=>{
        async function pixels(blob){
          const bitmap=await createImageBitmap(blob);
          const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;
          const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
          return {width:c.width,data:ctx.getImageData(0,0,c.width,c.height).data};
        }
        const white=await pixels(window.copied.at(-1));
        const transparent=await pixels(await renderToBlob({...S},256));
        let opaque=true,matches=true,ink=false,partial=false;
        for(let i=0;i<white.data.length;i+=4){
          const a=transparent.data[i+3]/255;
          opaque &&= white.data[i+3]===255;
          ink ||= a>0;
          partial ||= a>0 && a<1;
          for(let k=0;k<3;k++){
            const expected=transparent.data[i+k]*a+255*(1-a);
            matches &&= Math.abs(white.data[i+k]-expected)<=2;
          }
        }
        return {width:white.width,corner:[...white.data.slice(0,4)],transparentCorner:transparent.data[3],opaque,matches,ink,partial};
      });
      assert.equal(result.width,256);
      assert.deepEqual(result.corner,[255,255,255,255]);
      assert.equal(result.transparentCorner,0);
      for(const key of ['opaque','matches','ink','partial'])assert.equal(result[key],true,style+': '+key);
    }
    await page.locator('#copy').click();
    await page.waitForFunction(()=>!document.getElementById('copy').disabled);
    assert.match(await page.locator('#status').textContent(),/투명 배경/);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    console.log('PASS: 256px default, white clipboard PNG pixels for both engraving styles, translucent ink compositing, transparent PNG preservation, 360px layout.');
  }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});