import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium,webkit} from 'playwright';

// Use the two production origins with intercepted, local-only resources.
const website='https://miseenprice.co.uk', app='https://menu-margin.pages.dev';
for (const engine of [chromium,webkit]) {
  const browser=await engine.launch();
  try {
    const context=await browser.newContext({viewport:{width:390,height:844}});
    await context.route('**/*',async route=>{
      const url=new URL(route.request().url());
      if (url.origin===website) {
        if (!['/one-recipe-demo','/one-recipe-demo.js'].includes(url.pathname)) return route.fulfill({status:204});
        const js=url.pathname.endsWith('.js');
        return route.fulfill({contentType:js?'application/javascript':'text/html',body:await readFile(js?'marketing/one-recipe-demo.js':'marketing/one-recipe-demo.html')});
      }
      if (url.origin!==app) return route.abort();
      if (url.pathname==='/js/calculator-draft.js') return route.fulfill({contentType:'text/javascript',body:await readFile('js/calculator-draft.js')});
      const source=await readFile('index.html','utf8');
      const panel=source.match(/<section id="calculatorDraftPanel"[\s\S]*?<\/section>/)[0];
      await route.fulfill({contentType:'text/html',body:panel+'<script src="/js/calculator-draft.js"></script>'});
    });
    const site=await context.newPage();await site.goto(website+'/one-recipe-demo');
    await site.locator('#recipeName').fill('Soup for Friday');
    const pending=context.waitForEvent('page');await site.locator('#carryDish').click();const opened=await pending;
    await site.getByText(/Your dish is in the app tab/).waitFor();
    assert.ok(!opened.url().includes('Soup'));
    await opened.reload();
    await opened.evaluate(()=>{
      window.mmUser={id:'test'};document.body.classList.add('mm-authenticated');
      window.maybeSaveChanges=()=>true;window.loadRecipe=d=>window.openedDish=d;
      window.setActiveView=()=>{};window.updateRecipeHeader=()=>{};window.mmSaveRecipeDraft=()=>{};
      window.hasUnsavedChanges=false;window.mmRefreshCalculatorDraft();
    });
    await opened.getByRole('button',{name:'Review my dish'}).click();
    const dish=await opened.evaluate(()=>window.openedDish);
    assert.equal(dish.name,'Soup for Friday');assert.equal(dish.ingredients.length,3);
    assert.equal(dish.ingredients[0].price,8);assert.equal(dish.ingredients[0].priceLinkMode,'manual');
    assert.equal(await opened.locator('#calculatorDraftPanel').isHidden(),true);
  } finally {await browser.close();}
}
