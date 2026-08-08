# Image credits

Every product photograph in `assets/products/` is stored in this repository — the application
makes no image request off its own origin.

**Every one of them was edited: the background was removed.** Each file is the product cut out of
its photograph and saved as a 600px square PNG with a real alpha channel, so the tile shows the
object and nothing else and the app's own white surface is the background. Nothing was retouched,
added or restyled inside the subject; the only change is that everything behind it is gone. The
grounding shadow you see under a product is drawn by CSS at render time (`.tile__img` in
`assets/cartline.css`), not painted into the file.

How the cut-outs were made: macOS Vision (`VNGenerateForegroundInstanceMaskRequest`) produced the
foreground mask, the mask was eroded one pixel to drop the fringe, the result was trimmed to the
subject, centred on a square canvas at 94% of the long edge, and saved as an optimised PNG.

Transparency costs more bytes than a JPEG on white — these files run roughly 95–240KB each rather
than the 20–80KB the old JPEGs did. That is the price of the product reading as a cut-out rather
than as a photograph of a scene, and the tiles lazy-load.

All photographs below are used under the [Unsplash License](https://unsplash.com/license) or the
[Pexels License](https://www.pexels.com/license/), both of which permit free commercial use with
no attribution required, and both of which permit modification. Attribution is given here anyway,
because the photographers earned it.

**These photographs are not covered by this repository's LICENSE.** That licence covers the code,
design and documentation, which are the author's own. Each photograph stays under its own upstream
licence and belongs to the photographer credited beside it. If you obtain permission to reuse
anything from this repository, that permission does not extend to the photographs — take those
from the source linked below, under the terms the provider sets.

One product, **Chicken Puff**, ships with no photograph and keeps its solid colour tile.

## Photographs kept from the first pass, now cut out

The shot is the same one credited before; only the background was removed.

| Product | File | Photographer | Source | Licence |
|---|---|---|---|---|
| Butter Croissant | `butter-croissant.png` | [personalgraphic.com](https://unsplash.com/@personal_graphic) | [Unsplash](https://unsplash.com/photos/a-croissant-sitting-on-top-of-a-white-surface-VzUE5RtCuBA) | [Unsplash License](https://unsplash.com/license) |
| Coconut Loaf | `coconut-loaf.png` | [Анна Ширяева](https://unsplash.com/@ann_integra) | [Unsplash](https://unsplash.com/photos/a-loaf-of-whole-wheat-bread-on-a-white-surface-h3MVMRHitDU) | [Unsplash License](https://unsplash.com/license) |
| Date Roll | `date-roll.png` | [jonathan ocampo](https://unsplash.com/@johnophoto) | [Unsplash](https://unsplash.com/photos/cooked-food-CUbyC8PxPB4) | [Unsplash License](https://unsplash.com/license) |
| Wheat Rusk 200g | `wheat-rusk-200g.png` | [Elviss Railijs Bitāns](https://www.pexels.com/@ellis/) | [Pexels](https://www.pexels.com/photo/plate-of-sliced-breads-1448665/) | [Pexels License](https://www.pexels.com/license/) |
| Chicken Biryani | `chicken-biryani.png` | [Atikah Akhtar](https://unsplash.com/@atikahakhtar) | [Unsplash](https://unsplash.com/photos/white-ceramic-plate-with-rice-and-green-leaves-DIdQP3HUMXQ) | [Unsplash License](https://unsplash.com/license) |
| Veg Meals Box | `veg-meals-box.png` | [I Own My Food Art](https://www.pexels.com/@i-own-my-food-art-76108785/) | [Pexels](https://www.pexels.com/photo/meal-with-rice-on-plate-8996219/) | [Pexels License](https://www.pexels.com/license/) |
| Fish Curry Meal | `fish-curry-meal.png` | [Samia Liamani](https://unsplash.com/@mialiamani) | [Unsplash](https://unsplash.com/photos/cooked-dish-in-plate-6-I1gLkYugc) | [Unsplash License](https://unsplash.com/license) |
| Paneer Rice Bowl | `paneer-rice-bowl.png` | [Kunal Lakhotia](https://www.pexels.com/@kunal-lakhotia-781256899/) | [Pexels](https://www.pexels.com/photo/spicy-paneer-stir-fry-in-white-bowl-29631461/) | [Pexels License](https://www.pexels.com/license/) |
| Filter Coffee | `filter-coffee.png` | [Jonathan Cooper](https://unsplash.com/@theshuttervision) | [Unsplash](https://unsplash.com/photos/white-ceramic-mug-with-brown-liquid-BklOiZomvjM) | [Unsplash License](https://unsplash.com/license) |
| Lime Mint Cooler | `lime-mint-cooler.png` | [Kofi Buckley](https://unsplash.com/@kofi_buckley) | [Unsplash](https://unsplash.com/photos/a-glass-filled-with-a-liquid-and-a-green-leaf-JhxdBUmkqqU) | [Unsplash License](https://unsplash.com/license) |
| Mango Lassi | `mango-lassi.png` | [Kofi Buckley](https://unsplash.com/@kofi_buckley) | [Unsplash](https://unsplash.com/photos/a-glass-of-lemonade-with-a-lime-slice-on-the-rim-o5X6yaiJLqE) | [Unsplash License](https://unsplash.com/license) |
| Banana Chips 200g | `banana-chips-200g.png` | [Gary Tamin](https://unsplash.com/@gtamin) | [Unsplash](https://unsplash.com/photos/a-white-bowl-filled-with-chips-on-top-of-a-white-table-Z2C-yghfQMc) | [Unsplash License](https://unsplash.com/license) |
| Samosa (2 pcs) | `samosa-2-pcs.png` | [Sutee Pheera](https://www.pexels.com/@supibee/) | [Pexels](https://www.pexels.com/photo/a-fried-dish-on-white-ceramic-plate-5031949/) | [Pexels License](https://www.pexels.com/license/) |
| Matta Rice 5kg | `matta-rice-5kg.png` | [Mockup Graphics](https://unsplash.com/@mockupgraphics) | [Unsplash](https://unsplash.com/photos/blue-and-white-round-illustration-PO06zMP4BUg) | [Unsplash License](https://unsplash.com/license) |
| Coconut Oil 1L | `coconut-oil-1l.png` | [Jesper Riknie](https://unsplash.com/@jespernice) | [Unsplash](https://unsplash.com/photos/clear-glass-bottle-IImMljDvM80) | [Unsplash License](https://unsplash.com/license) |
| Coffee Powder 500g | `coffee-powder-500g.png` | [Irish83](https://unsplash.com/@irish83) | [Unsplash](https://unsplash.com/photos/a-bowl-of-coffee-beans-FRRRVHDj2JQ) | [Unsplash License](https://unsplash.com/license) |

## Photographs replaced in this pass, then cut out

These ten were re-shot from the library because the first choice would not survive a cut-out: the
subject ran off the edge of the frame, or the picture was of a scene (a hand, a wooden board, a
prop beside the plate) rather than of the product. The old credits for them no longer apply.

| Product | File | Photographer | Source | Licence | Why it changed |
|---|---|---|---|---|---|
| Malabar Bun | `malabar-bun.png` | [Paul Hermann](https://unsplash.com/@plhrmnn) | [Unsplash](https://unsplash.com/photos/breads-in-basket-rLJflZ_ufpo) | [Unsplash License](https://unsplash.com/license) | old shot was a wooden board, and the board cut out with the bread |
| Kuboos Wrap | `kuboos-wrap.png` | [Kashish Lamba](https://unsplash.com/@drunkenchimp) | [Unsplash](https://unsplash.com/photos/selective-focus-photography-of-taco-p-O37cSAV_4) | [Unsplash License](https://unsplash.com/license) | old shot was clipped flat along the bottom of the frame |
| Sulaimani Tea | `sulaimani-tea.png` | [Takenori Okada](https://unsplash.com/@takenori1128) | [Unsplash](https://unsplash.com/photos/a-cup-of-tea-on-a-saucer-with-a-spoon-gcLiLh2b05s) | [Unsplash License](https://unsplash.com/license) | old shot was a hand holding the glass |
| Karak Chai | `karak-chai.png` | [Kamal Preet Kaur](https://unsplash.com/@kamalpreetkaur) | [Unsplash](https://unsplash.com/photos/a-cup-of-coffee-sitting-on-top-of-a-table-hT_xR7_1YH8) | [Unsplash License](https://unsplash.com/license) | old shot was a cup cropped by two edges of the frame |
| Kerala Mixture 250g | `kerala-mixture-250g.png` | [Tori S.](https://unsplash.com/@torineli) | [Unsplash](https://unsplash.com/photos/a-bowl-of-food-that-is-sitting-on-a-table-zKD2Xb3yYO4) | [Unsplash License](https://unsplash.com/license) | loose scattered pulses read as spilled mess once cut out |
| Masala Peanuts | `masala-peanuts.png` | [Fidias Cervantes](https://unsplash.com/@fidpad) | [Unsplash](https://unsplash.com/photos/brown-beans-in-white-ceramic-bowl-4-lD-BSL99I) | [Unsplash License](https://unsplash.com/license) | same — scattered nuts had no object to ground |
| Toor Dal 1kg | `toor-dal-1kg.png` | [Zhang liven](https://unsplash.com/@lvenfoto) | [Unsplash](https://unsplash.com/photos/a-black-bowl-filled-with-yellow-sprinkles-6Y-WGm8IA3U) | [Unsplash License](https://unsplash.com/license) | old shot was a full-bleed texture with no foreground to mask |
| Payasam Cup | `payasam-cup.png` | [Srujan Shetty](https://unsplash.com/@srujanshetty) | [Unsplash](https://unsplash.com/photos/white-ceramic-bowl-with-white-cream-and-strawberry-CvzDi8hrOVY) | [Unsplash License](https://unsplash.com/license) | old ramekin sat flat on the bottom edge of the frame |
| Date Pudding | `date-pudding.png` | [yiseul han](https://unsplash.com/@hanyiseul) | [Unsplash](https://unsplash.com/photos/a-slice-of-chocolate-cake-on-a-white-plate-_K-yx6wIgt8) | [Unsplash License](https://unsplash.com/license) | old plate ran off two edges and brought a fork with it |
| Tender Coconut Souffle | `tender-coconut-souffle.png` | [Atikah Akhtar](https://unsplash.com/@atikahakhtar) | [Unsplash](https://unsplash.com/photos/brown-and-white-ceramic-saucer-with-stainless-steel-spoon-s-zorsOnnaY) | [Unsplash License](https://unsplash.com/license) | old glass was clipped at the base and a passion fruit prop cut out with it |

## Alt text

The alt text served with each photograph lives in `PRODUCT_IMAGES` in `src/data.js`. It describes
the product on its own, because that is all the picture contains.

## Replacing a photograph

Drop a new 600px square PNG with a transparent background over the file of the same name, update
the table above, and bump `CACHE_VERSION` in `sw.js` so the service worker stops serving the cached
copy. If you cannot get a clean cut-out, remove the product's row from `PRODUCT_IMAGES` in
`src/data.js` instead — the solid colour tile is a better answer than a ragged mask.
