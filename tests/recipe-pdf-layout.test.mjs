import test from 'node:test';
import assert from 'node:assert/strict';
import {recipeLinesFromPdfText} from '../scanner/recipe-pdf-layout.js';
import {parseRecipeText} from '../js/recipe-scan-parser.mjs';

// Reproduces the four separate text spans per row in the customer's PDF.
// Input is intentionally scrambled to ensure coordinates, not text stream order,
// define the ingredient pairings.
test('native two-column Korean tofu PDF text retains all 15 ingredient quantities',()=>{
 const rows=[
  ['Vegetable stock','5 litres','Light soy sauce','150 ml'],
  ['Silken or soft tofu','1.5 kg','Gochugaru (Korean chilli flakes)','25 g'],
  ['Fresh ginger, finely grated','120 g','Sesame oil','60 ml'],
  ['Garlic, minced','80 g','Rice vinegar','80 ml'],
  ['Spring onions','250 g','Sugar','30 g'],
  ['Shiitake or chestnut mushrooms','600 g','Pak choi','500 g'],
  ['Carrots, julienned','300 g','Sesame seeds','40 g'],
  ['White miso paste','120 g']
 ];
 const spans=[
  {str:'Korean Tofu & Ginger Soup',transform:[1,0,0,1,63,786]},
  {str:'Yield: 20 portions',transform:[1,0,0,1,63,755]},
  {str:'Ingredients',transform:[1,0,0,1,63,730]},
  ...rows.flatMap((row,i)=>row.map((str,j)=>({str,transform:[1,0,0,1,[68,243,297,473][j],700-i*23]}))),
  {str:'Method',transform:[1,0,0,1,63,490]}
 ].reverse();
 const lines=recipeLinesFromPdfText(spans);
 assert.equal(lines.length,12);
 const parsed=parseRecipeText(lines.map(l=>l.text).join('\n'));
 assert.equal(parsed.yield,20);
 assert.deepEqual(parsed.ingredients.map(i=>[i.name,i.qty,i.qtyUnit]),[
  ['Vegetable stock',5,'l'],['Light soy sauce',150,'ml'],
  ['Silken or soft tofu',1.5,'kg'],['Gochugaru (Korean chilli flakes)',25,'g'],
  ['Fresh ginger, finely grated',120,'g'],['Sesame oil',60,'ml'],
  ['Garlic, minced',80,'g'],['Rice vinegar',80,'ml'],
  ['Spring onions',250,'g'],['Sugar',30,'g'],
  ['Shiitake or chestnut mushrooms',600,'g'],['Pak choi',500,'g'],
  ['Carrots, julienned',300,'g'],['Sesame seeds',40,'g'],
  ['White miso paste',120,'g']
 ]);
});
