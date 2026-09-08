// Run with Playwright available: node tests/design.test.cjs
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:960}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:4173',{waitUntil:'networkidle'});
    await page.evaluate(()=>document.fonts.ready);
    const images=[];
    for(const [preset,label] of [['modern','미니멀'],['classic','클래식 이중선'],['brush','붓글씨 낙관']]){
      await page.locator('[data-preset="'+preset+'"]').click();
      await page.waitForFunction(()=>!pending);
      await page.evaluate(async()=>{await ensureFont(FONTS[S.fontIdx],S.text+S.suffix);render(vctx,view.width,S)});
      assert.equal(await page.locator('#text').inputValue(),'남궁연');
      images.push({label,data:await page.locator('#view').evaluate(c=>c.toDataURL())});
    }
    await page.locator('[data-preset="classic"]').click();
    await page.waitForFunction(()=>!pending);
    assert.equal(await page.locator('#doubleBorder').isChecked(),true);
    await page.evaluate(()=>flushState());await page.reload({waitUntil:'networkidle'});
    assert.equal(await page.locator('#doubleBorder').isChecked(),true);
    assert.equal(await page.locator('#spacing').inputValue(),'7');
    const edges=await page.evaluate(()=>{
      const results=[];const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const ctx=canvas.getContext('2d',{willReadFrequently:true});
      for(const shape of ['circle','ellipse','rounded','square'])for(const rot of [-15,0,15]){
        render(ctx,256,{...S,shape,rot,rough:100,ink:0});
        const pixels=ctx.getImageData(0,0,256,256).data;
        let count=0,painted=0;
        for(let y=0;y<256;y++)for(let x=0;x<256;x++){
          if(pixels[(y*256+x)*4+3]){painted++;if(x<5||x>250||y<5||y>250)count++;}
        }
        results.push({shape,rot,count,painted});
      }
      return results;
    });
    for(const result of edges){assert.equal(result.count,0,JSON.stringify(result));assert.ok(result.painted>100)}
    await page.setViewportSize({width:360,height:780});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    assert.deepEqual(errors,[]);
    await page.setViewportSize({width:1200,height:550});
    await page.evaluate(images=>{
      document.body.innerHTML='';document.body.style.cssText='margin:0;background:#f6f1e7;padding:32px;font-family:serif';
      const gallery=document.createElement('div');gallery.style.cssText='display:flex;gap:24px';
      for(const image of images){const card=document.createElement('div');card.style.cssText='flex:1;text-align:center;background:#fffdf8;border:1px solid #e0d7c4;border-radius:12px;padding:20px';
        const img=document.createElement('img');img.src=image.data;img.style.cssText='width:100%;display:block';
        const title=document.createElement('h2');title.textContent=image.label;title.style.cssText='font-size:20px;margin:12px 0 0;color:#5d554a';card.append(img,title);gallery.append(card)}
      document.body.append(gallery);
    },images);
    if(process.env.DESIGN_PREVIEW_PATH)await page.screenshot({path:process.env.DESIGN_PREVIEW_PATH});
    console.log('PASS: 3 presets, settings restored, 12 shape/rotation clipping checks, 360px layout, no page errors.');
  }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
