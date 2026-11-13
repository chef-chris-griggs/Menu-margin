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
