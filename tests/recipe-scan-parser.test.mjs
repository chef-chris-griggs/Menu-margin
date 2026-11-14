import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRecipeText,prepareRecipeImport} from '../js/recipe-scan-parser.mjs';

test('reads printed recipe title, yield and metric quantities',()=>{
 const scanned=parseRecipeText('Chicken curry\nServes: 10\nIngredients\n1.5 kg chicken breast\n500 g onions\nCoconut milk 800 ml\nMethod\nStir and cook for 20 minutes');
 assert.equal(scanned.name,'Chicken curry');
 assert.equal(scanned.yield,10);
 assert.deepEqual(scanned.ingredients.map(i=>[i.name,i.qty,i.qtyUnit]),[['chicken breast',1.5,'kg'],['onions',500,'g'],['Coconut milk',800,'ml']]);
 assert.equal(scanned.requiresReview,true);
});
test('unknown units or missing quantities need explicit review, never guessed',()=>{
 const scanned=parseRecipeText('Soup\nIngredients\n2 tbsp oil\nSalt to taste\n300 g carrots');
 assert.equal(scanned.ingredients.length,3);
 assert.equal(scanned.ingredients[0].needsReview,true);
 assert.equal(scanned.ingredients[1].qty,null);
 assert.match(scanned.warnings.join(' '),/Confirm number of portions/);
});
test('import never fabricates pack price or saves automatically',()=>{
 const imported=prepareRecipeImport(parseRecipeText('Stew\nServes 4\nIngredients\n250 g beef'));
 assert.equal(imported.ingredients[0].price,0);
 assert.equal(imported.ingredients[0].priceEntered,false);
 assert.equal(imported.ingredients[0].priceBookId,null);
 assert.equal(imported.yield,4);
});
test('rejects invalid source sizes',()=>{
 assert.throws(()=>parseRecipeText('x'.repeat(30001)));
});
test('titleless ingredients and trailing measurements are retained',()=>{
 for(const text of ['Ingredients\nSalt to taste\nOlive oil 200 ml','Olive oil 200 ml\n500 g onions']){
  const p=parseRecipeText(text);assert.equal(p.ingredients.length,2);assert.equal(p.name,'Scanned recipe');
 }
});
test('ambiguous thousands separators and split measurements require correction',()=>{
 const p=parseRecipeText('Soup\nIngredients\n1,000 g carrots\n500\ng onions');
 assert.ok(p.ingredients.every(i=>i.qty===null));
 assert.equal(prepareRecipeImport(parseRecipeText('Soup\nIngredients\n200 ml olive oil')).ingredients[0].priceLinkMode,'manual');
});
test('ranges, mixed fractions, negative quantities and extra measurements never become a plausible wrong amount',()=>{
 const p=parseRecipeText('Soup\nIngredients\n200-300 g carrots\nOlive oil 1 1/2 l\n-200 g onions\n200 g flour 100 g sugar');
 assert.equal(p.ingredients.length,4);assert.ok(p.ingredients.every(i=>i.qty===null));
 assert.equal(parseRecipeText('Soup\nServes 2.5\nIngredients\n500 g onions').yield,null);
});
test('unquantified capitalised ingredients survive and inline method text is excluded',()=>{
 const p=parseRecipeText('Soup\nIngredients\nBLACK PEPPER\n500 g carrots\nMethod: chop and simmer\n200 g water');
 assert.equal(p.ingredients.length,2);assert.equal(p.ingredients[0].name,'BLACK PEPPER');assert.equal(p.ingredients[0].qty,null);
});
