import ingredientRows from "./ingredients.json" with { type: "json" };
import type { EstimatedIngredient, IngredientObj, Recipe } from "@/lib/recipes/types";
import type { SourcedIngredient } from "./index.ts";

/**
 * Pairing between the sourced ingredient library (`ingredients.json`) and
 * original recipes in the recipe file (`public/all_recipes.json`, plus the
 * copy stored in the browser).
 *
 * The library stays its own database. Recipe pages do not import its macro
 * helpers. This file only writes two fields onto each original ingredient
 * line so later code can read the link without guessing from the text:
 *
 * - `sourced_name`: a `name` from the ingredient library, or null.
 * - `sourced_match`:
 *   - `exact` — the line is that library item. The recipe screen says "Library:".
 *   - `closest` — nearest substitute, not the same product. Screen says "Closest:".
 *   - `none` — no library row, and it was not told to be zero. Screen says "No library match".
 *   - `zero` — count this line as 0 calories / 0 macros. It is NOT a library row. Screen says "Zero macros".
 * - `sourced_recipe`: uid of another recipe in the recipe file. A line such as
 *   "1 recipe Flaxseed Meal Crêpes" is not flaxseed meal. `linkReferencedRecipes`
 *   stores the other recipe's uid here and clears the pantry fields. The meal
 *   total then adds that recipe's whole batch (her ingredient list, not one
 *   crepe and not her published nutrition card). The recipe screen links it
 *   and says what that batch makes (12 crepes, not "1 batch").
 * - Diabetic Chef's "taco seasoning" spoonfuls are her Low Carb Taco Seasoning
 *   spice mix, not the Siete packet. Those lines store that recipe's uid too.
 *   The meal total scales the spoonful against the mix's full volume. It does
 *   not add the whole jar, and it does not use the packet's dates or cassava.
 *
 * Original ingredient wording is never rewritten. Versions (`variant` version/mod,
 * or a uid containing `::v` / `::mod`) are not annotated.
 *
 * One list per recipe is walked: `ingredient_sections` if any section has items,
 * otherwise `ingredients`, otherwise `estimated_ingredients`. A string line is
 * turned into `{ raw, sourced_name, sourced_match }` so the visible text stays
 * the same.
 *
 * Deliberate exceptions. Do not "fix" these by adding library rows or new pairings:
 * - Water is a real library row (`name: "water"`) with all macros 0, no brand,
 *   no price, and an empty `macroSource`. Hot, warm, cold, and boiling water
 *   pair to it. Ice is closest, not a separate product.
 * - "Any meat you like" on Skillet Frittata pairs to `ground beef 80/20`.
 * - Red food coloring (Chinese BBQ pork / char siu) is `zero`. Not a library row.
 * - Oreo-Breaded Wings was removed from the recipe file. A leftover "oreo" line
 *   still comes back as `zero`, not a library cookie.
 * - "Dressing to taste" on the open-faced Reuben is ignored: both pairing fields
 *   are cleared and nothing is shown. Do not pair it and do not add a dressing.
 *   Mississippi Comeback Sauce exists as its own recipe, not as a library row.
 * - "1 t Dry Dipping Ingredients" on the garlic knots is left unmatched on purpose.
 *   The same recipe already lists that mix with amounts (basil, garlic powder,
 *   thyme, oregano, rosemary, marjoram, pepper, salt, pepper flakes), and those
 *   lines are paired. Do not add a blend row for the teaspoon line.
 * - The enchilada "or favorite canned sauce" line was deleted from that recipe.
 *   Do not put canned sauce in the ingredient library.
 * - Cookware, toothpicks, and instruction scraps are left as `none`. Do not invent
 *   matches for them.
 *
 * `annotateRecipes` is safe to run on every load. It returns true only when a
 * field actually changes, which is what makes the stored recipe file pick up
 * pairings. `scripts/apply-pairs.ts` writes the same result into the bundled file.
 *
 * Meal planning reads the link in `meal.ts` and scales that library row by
 * the recipe amount. It does not write pairings back, and recipe screens
 * still do not show library macros. A version saved from the editor drops
 * the two fields (`buildVersionRecipe` writes a new ingredient list), so
 * `pairLine` pairs that line from its text at calc time. Same exceptions:
 * dressing to taste is ignored, and the dry-dipping teaspoon stays `none`
 * because the herbs are already listed with amounts.
 */
export type PairKind = "exact" | "closest" | "none" | "zero";

export interface IngredientPair {
  name: string | null;
  match: PairKind;
}

const GENERIC = new Set(["beef", "pork", "chicken", "cheese", "sauce", "oil", "pepper", "powder", "ground", "cream", "butter", "onion", "garlic", "tomato", "salt", "fish", "meat", "steak", "broth", "stock", "seed", "leaf", "herb", "spice"]);

const WEAK_ALIAS = new Set(["salt", "wine", "cheese", "cream", "oil", "soy", "file", "lamb", "bran", "curry", "sesame", "orange", "flank", "veal", "honey", "pork", "fish", "meat", "sauce", "milk", "gravy", "lime", "lemon", "ice"]);

const FRESH_HERB = new Map<string, string>([
  ["basil", "basil fresh"],
  ["rosemary", "rosemary fresh"],
  ["parsley", "parsley fresh"],
  ["mint", "mint fresh"],
  ["cilantro", "cilantro"],
  ["dill", "dill dried"],
  ["thyme", "thyme dried"],
  ["oregano", "oregano"],
  ["sage", "sage"],
]);

const FILLER = new Set([
  "a", "an", "the", "of", "and", "or", "to", "for", "with", "in", "on", "into", "plus", "more", "about", "approx", "approximately",
  "optional", "divided", "garnish", "serving", "serve", "side", "nice", "favorite", "choice", "your", "additional", "extra",
  "fresh", "frozen", "raw", "cooked", "roasted", "melted", "softened", "cold", "warm", "hot", "boiling", "boiled", "lukewarm", "tepid", "tap", "filtered", "room", "temperature",
  "chopped", "minced", "diced", "sliced", "grated", "shredded", "crushed", "peeled", "trimmed", "cut", "cubes", "cubed",
  "finely", "coarsely", "roughly", "thinly", "thickly", "freshly", "packed", "heaping", "scant", "large", "small", "medium", "big",
  "boneless", "skinless", "skin", "out", "inch", "inches", "thick", "piece", "pieces", "slice", "slices",
  "can", "cans", "jar", "package", "pkg", "bunch", "head", "heads", "sprig", "sprigs",
  "stick", "sticks", "cup", "cups", "tbsp", "tsp", "tablespoon", "tablespoons", "teaspoon", "teaspoons", "oz", "ounce", "ounces",
  "lb", "lbs", "pound", "pounds", "gram", "grams", "kg", "ml", "liter", "pint", "quart",
  "good", "quality", "very", "best", "color", "halved", "slivered", "left", "over", "leftover", "handful", "handfuls", "pinch", "pinches",
  "desiccated", "unsweetened", "sweetened", "organic", "toasted", "blanched", "drained", "rinsed", "seeded", "deveined", "powdered", "uncooked",
  "taste", "tasting", "finish", "finished", "wanted", "needed", "necessary", "beaten", "lightly", "well", "wash", "temp", "freshly",
]);

const ALIAS_ROWS: Array<[string, string]> = [
  ["salt", "salt"],
  ["sea salt", "salt"],
  ["table salt", "salt"],
  ["pepper", "black pepper"],
  ["black pepper", "black pepper"],
  ["ground pepper", "black pepper"],
  ["cracked pepper", "black pepper"],
  ["garlic", "garlic minced"],
  ["garlic clove", "garlic minced"],
  ["garlic cloves", "garlic minced"],
  ["minced garlic", "garlic minced"],
  ["garlic power", "garlic powder"],
  ["egg", "eggs (large)"],
  ["eggs", "eggs (large)"],
  ["egg yolk", "eggs (large)"],
  ["egg yolks", "eggs (large)"],
  ["egg white", "eggs (large)"],
  ["egg whites", "eggs (large)"],
  ["butter", "butter"],
  ["unsalted butter", "butter"],
  ["salted butter", "butter"],
  ["melted butter", "butter"],
  ["mayo", "mayonnaise"],
  ["mayonnaise", "mayonnaise"],
  ["dijon mustard", "dijon"],
  ["soy sauce", "tamari"],
  ["apple cider vinegar", "acv"],
  ["balsamic vinegar", "balsamic"],
  ["heavy cream", "heavy cream"],
  ["heavy whipping cream", "heavy cream"],
  ["whipping cream", "heavy cream"],
  ["whipped cream", "heavy cream"],
  ["pork panko", "pork rinds"],
  ["pork rind panko", "pork rinds"],
  ["xanthan gum", "xanthan guar"],
  ["xanthan", "xanthan guar"],
  ["baking powder", "baking soda"],
  ["cocoa", "cocoa powder"],
  ["unsweetened cocoa", "cocoa powder"],
  ["cocoa powder", "cocoa powder"],
  ["swerve", "erythritol"],
  ["monk fruit", "erythritol (GV monk fruit)"],
  ["monkfruit", "erythritol (GV monk fruit)"],
  ["allulose", "allulose (pure)"],
  ["sugar", "allulose (pure)"],
  ["powdered sugar", "allulose (pure)"],
  ["confectioners sugar", "allulose (pure)"],
  ["brown sugar", "allulose (pure)"],
  ["chicken broth", "chicken broth"],
  ["chicken stock", "chicken broth"],
  ["beef broth", "beef base"],
  ["beef stock", "beef base"],
  ["beef bone broth", "bone broth"],
  ["chicken bone broth", "bone broth"],
  ["scallion", "green onion"],
  ["scallions", "green onion"],
  ["green onion", "green onion"],
  ["green onions", "green onion"],
  ["yellow onion", "onion"],
  ["white onion", "onion"],
  ["sweet onion", "onion"],
  ["cheese", "cheddar"],
  ["shredded cheese", "cheddar"],
  ["shredded cheddar", "cheddar"],
  ["italian herbs", "italian seasoning"],
  ["italian seasoning", "italian seasoning"],
  ["dried italian herbs", "italian seasoning"],
  ["greens", "spring mix"],
  ["mixed greens", "spring mix"],
  ["salad greens", "spring mix"],
  ["whipped topping", "heavy cream"],
  ["cream", "heavy cream"],
  ["sour cream", "sour cream"],
  ["cream cheese", "cream cheese"],
  ["ground beef", "ground beef 80/20"],
  ["hamburger", "ground beef 80/20"],
  ["tallow", "beef tallow"],
  ["beef tallow", "beef tallow"],
  ["beef cracklings", "beef cracklings"],
  ["beef crackling", "beef cracklings"],
  ["cracklings", "beef cracklings"],
  ["crackling", "beef cracklings"],
  ["fried beef tallow bites", "beef cracklings"],
  ["beef tallow bites", "beef cracklings"],
  ["tallow bites", "beef cracklings"],
  ["olive oil", "olive oil"],
  ["extra virgin olive oil", "olive oil"],
  ["evoo", "olive oil"],
  ["coconut oil", "coconut oil"],
  ["avocado oil", "avocado oil"],
  ["bacon", "bacon"],
  ["pork rinds", "pork rinds"],
  ["pork skins", "pork rinds"],
  ["ground pork rinds", "pork rinds"],
  ["ground pork skins", "pork rinds"],
  ["crushed pork skins", "pork rinds"],
  ["chicharrones", "pork rinds"],
  ["hot sauce", "hot sauce"],
  ["frank's", "hot sauce"],
  ["franks", "hot dogs (beef franks)"],
  ["worcestershire", "worcestershire alt (coconut aminos)"],
  ["worcestershire sauce", "worcestershire alt (coconut aminos)"],
  ["fish sauce", "fish sauce"],
  ["coconut aminos", "coconut aminos"],
  ["almond flour", "almond flour"],
  ["coconut flour", "coconut flour"],
  ["pork rind", "pork rinds"],
  ["pork rinds crushed", "pork rinds"],
  ["garlic paste", "garlic minced"],
  ["ginger powder", "ground ginger"],
  ["powdered ginger", "ground ginger"],
  ["chili flakes", "red pepper flakes"],
  ["dried chili flakes", "red pepper flakes"],
  ["chili flake", "red pepper flakes"],
  ["zaatar", "zaatar"],
  ["za atar", "zaatar"],
  ["labne", "greek yogurt whole milk"],
  ["labneh", "greek yogurt whole milk"],
  ["pork tenderloin", "pork loin"],
  ["top sirloin", "beef roast cuts"],
  ["sirloin", "beef roast cuts"],
  ["hamburger meat", "ground beef 80/20"],
  ["fennel powder", "fennel seed"],
  ["roquefort", "blue cheese"],
  ["pumpkin puree", "pumpkin puree"],
  ["pumpkin pur\u00e9e", "pumpkin puree"],
  ["carbalose flour", "almond flour"],
  ["carbalose", "almond flour"],
  ["just like sugar", "allulose (pure)"],
  ["ez sweets", "liquid sucralose"],
  ["ez sweetz", "liquid sucralose"],
  ["ezsweetz", "liquid sucralose"],
  ["low carb ketchup", "sf ketchup"],
  ["sugar free ketchup", "sf ketchup"],
  ["porcini dust", "dried porcini"],
  ["dried porcini", "dried porcini"],
  ["shishito", "mini peppers"],
  ["shishito pepper", "mini peppers"],
  ["padron pepper", "mini peppers"],
  ["italian grinder", "italian seasoning"],
  ["mccormick italian grinder", "italian seasoning"],
  ["white wine", "white wine vinegar"],
  ["wine", "red wine"],
  ["red wine", "red wine"],
  ["white wine vinegar", "white wine vinegar"],
  ["rice vinegar", "rice vinegar"],
  ["red wine vinegar", "red wine vinegar"],
  ["sherry vinegar", "white wine vinegar"],
  ["cooking wine", "white wine vinegar"],
  ["dry white wine", "white wine vinegar"],
  ["parmesan cheese", "parmesan"],
  ["parmigiano", "parmesan"],
  ["parmigiano reggiano", "parmesan"],
  ["cheddar cheese", "cheddar"],
  ["mozzarella cheese", "mozzarella"],
  ["pepper jack", "pepper jack cheese (block)"],
  ["monterey jack", "monterey jack"],
  ["cream of tartar", "cream of tartar"],
  ["baking soda", "baking soda"],
  ["vanilla extract", "vanilla"],
  ["vanilla", "vanilla"],
  ["lemon juice", "lemon juice"],
  ["lime juice", "lime"],
  ["lemon", "lemon"],
  ["lime", "lime"],
  ["lemon zest", "lemon"],
  ["lime zest", "lime"],
  ["tomato paste", "tomato paste"],
  ["tomato sauce", "tomato sauce (plain, no sugar)"],
  ["crushed tomatoes", "canned tomato"],
  ["diced tomatoes", "canned tomato"],
  ["canned tomatoes", "canned tomato"],
  ["chicken thigh", "chicken thigh"],
  ["chicken thighs", "chicken thigh"],
  ["chicken breast", "chicken breast"],
  ["chicken breasts", "chicken breast"],
  ["chicken wing", "chicken wings"],
  ["chicken wings", "chicken wings"],
  ["whole chicken", "whole chicken"],
  ["rotisserie chicken", "rotisserie chicken"],
  ["ground chicken", "chicken other"],
  ["ground pork", "ground pork"],
  ["ground lamb", "ground lamb"],
  ["pork loin", "pork loin"],
  ["pork butt", "pork butt"],
  ["pork shoulder", "pork butt"],
  ["pork roast", "pork loin"],
  ["pork belly", "pork belly"],
  ["pork chop", "pork chop"],
  ["pork chops", "pork chop"],
  ["ribeye", "ribeye"],
  ["rib eye", "ribeye"],
  ["brisket", "brisket"],
  ["short rib", "short rib"],
  ["short ribs", "short rib"],
  ["cream cheese room temperature", "cream cheese"],
  ["cajun seasoning", "cajun"],
  ["cajun spice", "cajun"],
  ["cajun spices", "cajun"],
  ["italian herb", "italian seasoning"],
  ["gelatin", "gelatin"],
  ["collagen", "collagen"],
  ["pork sausage", "pork sausage (breakfast)"],
  ["sausage", "pork sausage (breakfast)"],
  ["breakfast sausage", "pork sausage (breakfast)"],
  ["pepperoni", "pepperoni"],
  ["salami", "salami"],
  ["kielbasa", "kielbasa (plain ground pork)"],
  ["andouille", "andouille (plain ground pork)"],
  ["smoked sausage", "smoked sausage (plain ground pork)"],
  ["heavy cream whipped", "heavy cream"],
  ["cool whip", "heavy cream"],
  ["greek yogurt", "greek yogurt whole milk"],
  ["yogurt", "greek yogurt whole milk"],
  ["buttermilk", "buttermilk"],
  ["half and half", "half and half"],
  ["half & half", "half and half"],
  ["ghee", "ghee"],
  ["lard", "lard"],
  ["duck fat", "duck fat"],
  ["sesame oil", "sesame oil"],
  ["toasted sesame oil", "sesame oil"],
  ["oyster sauce", "oyster sauce"],
  ["hoisin", "hoisin"],
  ["hoisin sauce", "hoisin"],
  ["gochujang", "gochujang"],
  ["sriracha", "hot sauce"],
  ["chili garlic sauce", "chili garlic sauce"],
  ["capers", "capers"],
  ["olives", "olives (pimento-stuffed)"],
  ["black olives", "black olives"],
  ["kalamata", "kalamata"],
  ["kalamata olives", "kalamata"],
  ["pickles", "pickles (dill chips)"],
  ["dill pickle", "pickles (dill chips)"],
  ["dill pickles", "pickles (dill chips)"],
  ["sauerkraut", "sauerkraut"],
  ["kimchi", "kimchi"],
  ["babybel", "babybel"],
  ["string cheese", "string cheese"],
  ["cottage cheese", "cottage cheese (Daisy 4%)"],
  ["ricotta", "ricotta"],
  ["feta", "feta"],
  ["blue cheese", "blue cheese"],
  ["goat cheese", "goat cheese"],
  ["brie", "brie"],
  ["gruyere", "gruyere"],
  ["provolone", "provolone"],
  ["havarti", "havarti"],
  ["gouda", "gouda (smoked, Yancey's)"],
  ["swiss", "swiss cheese (block)"],
  ["swiss cheese", "swiss cheese (block)"],
  ["american cheese", "American cheese (Kraft Singles)"],
  ["cream of mushroom", "mushroom"],
  ["mushrooms", "mushroom"],
  ["mushroom", "mushroom"],
  ["spinach", "spinach"],
  ["kale", "kale"],
  ["lettuce", "lettuce"],
  ["arugula", "arugula"],
  ["cabbage", "cabbage"],
  ["napa cabbage", "napa cabbage"],
  ["red cabbage", "red cabbage"],
  ["cauliflower", "cauliflower"],
  ["broccoli", "broccoli"],
  ["zucchini", "zucchini"],
  ["cucumber", "cucumber"],
  ["celery", "celery"],
  ["carrot", "carrot"],
  ["carrots", "carrot"],
  ["radish", "radish"],
  ["radishes", "radish"],
  ["turnip", "turnip"],
  ["asparagus", "asparagus"],
  ["avocado", "avocado"],
  ["avocadoes", "avocado"],
  ["avocados", "avocado"],
  ["tomato", "tomato"],
  ["tomatoes", "tomato"],
  ["cherry tomatoes", "cherry tomato"],
  ["grape tomatoes", "grape tomato"],
  ["roma tomatoes", "roma tomato"],
  ["sun dried tomatoes", "sundried tomato"],
  ["sun-dried tomatoes", "sundried tomato"],
  ["jalapeno", "jalapeno"],
  ["jalape\u00f1o", "jalapeno"],
  ["bell pepper", "bell pepper"],
  ["red bell pepper", "red bell pepper"],
  ["green bell pepper", "bell pepper"],
  ["shallot", "shallot"],
  ["shallots", "shallot"],
  ["red onion", "red onion"],
  ["onion", "onion"],
  ["onions", "onion"],
  ["garlic powder", "garlic powder"],
  ["onion powder", "onion powder"],
  ["paprika", "paprika"],
  ["smoked paprika", "smoked paprika"],
  ["cumin", "cumin"],
  ["chili powder", "chili powder"],
  ["cayenne", "cayenne"],
  ["oregano", "oregano"],
  ["dried oregano", "oregano"],
  ["thyme", "thyme dried"],
  ["dried thyme", "thyme dried"],
  ["fresh thyme", "thyme dried"],
  ["basil", "basil dried"],
  ["dried basil", "basil dried"],
  ["fresh basil", "basil fresh"],
  ["parsley", "parsley dried"],
  ["dried parsley", "parsley dried"],
  ["fresh parsley", "parsley fresh"],
  ["cilantro", "cilantro"],
  ["fresh cilantro", "cilantro"],
  ["dill", "dill dried"],
  ["dried dill", "dill dried"],
  ["fresh dill", "dill dried"],
  ["rosemary", "rosemary dried"],
  ["dried rosemary", "rosemary dried"],
  ["fresh rosemary", "rosemary fresh"],
  ["sage", "sage"],
  ["bay leaf", "bay leaf"],
  ["bay leaves", "bay leaf"],
  ["red pepper flakes", "red pepper flakes"],
  ["crushed red pepper", "red pepper flakes"],
  ["cinnamon", "cinnamon"],
  ["nutmeg", "nutmeg"],
  ["garlic salt", "garlic salt"],
  ["seasoned salt", "seasoned salt"],
  ["kosher salt", "kosher salt"],
  ["smoked salt", "smoked salt"],
  ["old bay", "old bay"],
  ["taco seasoning", "taco seasoning"],
  ["ranch seasoning", "ranch seasoning"],
  ["poultry seasoning", "poultry seasoning"],
  ["curry powder", "curry powder"],
  ["garam masala", "garam masala"],
  ["five spice", "five spice powder"],
  ["chinese five spice", "five spice powder"],
  ["ginger", "ground ginger"],
  ["fresh ginger", "ground ginger"],
  ["ground ginger", "ground ginger"],
  ["ginger paste", "ginger paste"],
  ["turmeric", "turmeric"],
  ["white pepper", "white pepper"],
  ["sesame seeds", "sesame seed"],
  ["poppy seeds", "poppy seed"],
  ["chia seeds", "chia"],
  ["flax meal", "flaxseed meal"],
  ["flaxseed", "flaxseed meal"],
  ["almond butter", "almond butter"],
  ["peanut butter", "peanut butter"],
  ["shrimp", "shrimp"],
  ["salmon", "salmon"],
  ["tuna", "tuna"],
  ["white fish", "white fish"],
  ["tilapia", "tilapia"],
  ["cod", "white fish"],
  ["crab", "crab (real, claw)"],
  ["lobster", "lobster"],
  ["scallops", "scallops"],
  ["anchovy", "anchovy"],
  ["anchovies", "anchovy"],
  ["sardines", "sardines"],
  ["ham", "ham (Frick's boneless half)"],
  ["prosciutto", "prosciutto"],
  ["beef ribs", "beef ribs"],
  ["pork ribs", "pork ribs"],
  ["oxtail", "oxtail"],
  ["beef stew meat", "beef stew"],
  ["stew meat", "beef stew"],
  ["chuck roast", "chuck roast"],
  ["pot roast", "beef roast cuts"],
  ["chicken liver", "chicken liver"],
  ["duck", "duck"],
  ["cornish hen", "cornish hen"],
  ["cornish game hen", "cornish hen"],
  ["hard boiled eggs", "eggs (large)"],
  ["boiled eggs", "eggs (large)"],
  ["bbq sauce", "BBQ sauce (G Hughes sugar free)"],
  ["barbecue sauce", "BBQ sauce (G Hughes sugar free)"],
  ["keto bbq sauce", "BBQ sauce (G Hughes sugar free)"],
  ["ranch dressing", "ranch dressing"],
  ["caesar dressing", "caesar dressing"],
  ["blue cheese dressing", "blue cheese dressing"],
  ["alfredo sauce", "alfredo sauce (Classico four cheese)"],
  ["salsa", "salsa"],
  ["enchilada sauce", "enchilada sauce"],
  ["marinara", "pasta sauce (bettergoods basil garlic)"],
  ["pasta sauce", "pasta sauce (bettergoods basil garlic)"],
  ["pizza sauce", "tomato sauce (plain, no sugar)"],
  ["ketchup", "sf ketchup"],
  ["mustard", "mustard"],
  ["yellow mustard", "mustard"],
  ["spicy brown mustard", "mustard"],
  ["whole grain mustard", "mustard"],
  ["vinegar", "white vinegar"],
  ["white vinegar", "white vinegar"],
  ["distilled vinegar", "white vinegar"],
  ["cider vinegar", "acv"],
  ["rice wine vinegar", "rice vinegar"],
  ["coconut milk", "coconut milk"],
  ["coconut cream", "coconut cream"],
  ["almond milk", "whole milk"],
  ["milk", "whole milk"],
  ["whole milk", "whole milk"],
  ["liquid stevia", "stevia"],
  ["stevia", "stevia"],
  ["erythritol", "erythritol"],
  ["powdered erythritol", "erythritol"],
  ["confectioners erythritol", "erythritol"],
  ["maple syrup", "sf maple syrup"],
  ["sugar free maple syrup", "sf maple syrup"],
  ["almond extract", "almond extract"],
  ["orange extract", "orange extract"],
  ["lemon extract", "lemon extract"],
  ["maple extract", "maple extract"],
  ["liquid smoke", "liquid smoke"],
  ["tamari", "tamari"],
  ["bone broth", "bone broth"],
  ["broth", "bone broth"],
  ["stock", "bone broth"],
  ["chicken base", "chicken base"],
  ["beef base", "beef base"],
  ["unflavored gelatin", "gelatin"],
  ["pork rind crumbs", "pork rinds"],
  ["crushed pork rinds", "pork rinds"],
  ["breadcrumbs", "pork rinds"],
  ["bread crumbs", "pork rinds"],
  ["panko", "pork rinds"],
  ["whey protein", "protein powder (whey)"],
  ["protein powder", "protein powder (whey)"],
  ["whey isolate", "protein powder (whey)"],
  ["nutritional yeast", "nutritional yeast"],
  ["boursin", "Boursin garlic & herb"],
  ["laughing cow", "babybel"],
  ["mozzarella", "mozzarella"],
  ["fresh mozzarella", "fresh mozzarella"],
  ["hard salami", "salami"],
  ["genoa salami", "salami"],
  ["beef hot dogs", "hot dogs (beef franks)"],
  ["hot dogs", "hot dogs (beef franks)"],
  ["hot dog", "hot dogs (beef franks)"],
  ["frank", "hot dogs (beef franks)"],
  ["vienna sausage", "Vienna sausage"],
  ["corned beef", "corned beef"],
  ["dried beef", "dried beef (eye of round)"],
  ["chipped beef", "dried beef (eye of round)"],
  ["beef jerky", "beef jerky"],
  ["shaved steak", "shaved steak"],
  ["picanha", "picanha"],
  ["ribeye steak", "ribeye"],
  ["ny strip", "strip steak"],
  ["new york strip", "strip steak"],
  ["strip steak", "strip steak"],
  ["filet mignon", "beef tenderloin"],
  ["tenderloin", "beef tenderloin"],
  ["beef tenderloin", "beef tenderloin"],
  ["beef bones", "beef bones"],
  ["sliced beef", "beef stew"],
  ["stew beef", "beef stew"],
  ["beef", "beef stew"],
  ["marrow bones", "beef bones"],
  ["bone marrow", "beef bones"],
  ["chicken drumsticks", "drumsticks"],
  ["drumsticks", "drumsticks"],
  ["chicken leg", "chicken thigh"],
  ["chicken legs", "chicken thigh"],
  ["chicken quarters", "chicken thigh"],
  ["deli chicken", "rotisserie chicken"],
  ["canned chicken", "chicken other"],
  ["ground turkey", "chicken other"],
  ["turkey", "chicken other"],
  ["shrimp peeled", "shrimp"],
  ["raw shrimp", "shrimp"],
  ["peeled shrimp", "shrimp"],
  ["peeled raw shrimp", "shrimp"],
  ["beef bacon", "bacon"],
  ["bacon grease", "bacon"],
  ["reserved bacon grease", "bacon"],
  ["mct oil", "MCT oil"],
  ["frying fat", "beef tallow"],
  ["fat for frying", "beef tallow"],
  ["oil for frying", "avocado oil"],
  ["chocolate", "baking chocolate"],
  ["chocolate bar", "baking chocolate"],
  ["dark chocolate", "baking chocolate"],
  ["unsweetened chocolate", "baking chocolate"],
  ["tahini", "tahini"],
  ["peanuts", "peanuts"],
  ["almonds", "almonds"],
  ["sliced almonds", "sliced almonds"],
  ["walnuts", "walnuts"],
  ["pecans", "pecans"],
  ["hazelnuts", "hazelnuts"],
  ["macadamia nuts", "macadamia"],
  ["pine nuts", "pine nuts"],
  ["flax seed", "flaxseed meal"],
  ["hemp hearts", "chia"],
  ["raspberries", "raspberries"],
  ["blueberries", "blueberries"],
  ["cranberries", "cranberries (fresh)"],
  ["liquid aminos", "coconut aminos"],
  ["duke's mayo", "mayonnaise"],
  ["dukes mayo", "mayonnaise"],
  ["avocado mayo", "mayonnaise"],
  ["olive oil mayo", "mayonnaise"],
  ["plain yogurt", "greek yogurt whole milk"],
  ["full fat yogurt", "greek yogurt whole milk"],
  ["large eggs", "eggs (large)"],
  ["whole eggs", "eggs (large)"],
  ["fresh oregano", "oregano"],
  ["boneless skinless chicken thighs", "chicken thigh"],
  ["80/20 ground beef", "ground beef 80/20"],
  ["73/27 ground beef", "ground beef 73/27"],
  ["ground beef 73/27", "ground beef 73/27"],
  ["73/27 beef", "ground beef 73/27"],
  ["beef 73/27", "ground beef 73/27"],
  ["73 ground beef", "ground beef 73/27"],
  ["ground beef 73", "ground beef 73/27"],
  ["73/27", "ground beef 73/27"],
  ["cream cheese softened", "cream cheese"],
  ["softened cream cheese", "cream cheese"],
  ["clove", "cloves"],
  ["ground clove", "cloves"],
  ["clove powder", "cloves"],
  ["dried clove", "cloves"],
  ["espresso", "instant espresso"],
  ["espresso powder", "instant espresso"],
  ["instant coffee", "instant espresso"],
  ["coffee powder", "instant espresso"],
  ["desiccated coconut", "coconut flakes"],
  ["shredded coconut", "coconut flakes"],
  ["toasted coconut", "coconut flakes"],
  ["unsweetened coconut", "coconut flakes"],
  ["coconut unsweetened", "coconut flakes"],
  ["honey", "allulose (pure)"],
  ["molasses", "sf maple syrup"],
  ["arrowroot", "xanthan guar"],
  ["arrowroot powder", "xanthan guar"],
  ["corn starch", "xanthan guar"],
  ["cornstarch", "xanthan guar"],
  ["tapioca", "xanthan guar"],
  ["tapioca flour", "xanthan guar"],
  ["tapioca starch", "xanthan guar"],
  ["chorizo", "andouille (plain ground pork)"],
  ["raw chorizo", "andouille (plain ground pork)"],
  ["crabmeat", "crab (real, claw)"],
  ["crab meat", "crab (real, claw)"],
  ["lump crab", "crab (real, claw)"],
  ["lump crabmeat", "crab (real, claw)"],
  ["soy", "tamari"],
  ["snow pea", "green beans"],
  ["snow peas", "green beans"],
  ["snap pea", "green beans"],
  ["snap peas", "green beans"],
  ["mussel", "shellfish"],
  ["mussels", "shellfish"],
  ["squid", "shellfish"],
  ["calamari", "shellfish"],
  ["flat iron", "beef roast cuts"],
  ["flat iron steak", "beef roast cuts"],
  ["flank steak", "shaved steak"],
  ["flank", "shaved steak"],
  ["chuck eye", "chuck roast"],
  ["chuck eye steak", "chuck roast"],
  ["denver steak", "beef roast cuts"],
  ["minute steak", "beef roast cuts"],
  ["prime rib", "ribeye"],
  ["standing rib roast", "ribeye"],
  ["rib roast", "ribeye"],
  ["baby back", "pork ribs"],
  ["baby back ribs", "pork ribs"],
  ["orange zest", "orange extract"],
  ["orange peel", "orange extract"],
  ["grated orange", "orange extract"],
  ["strawberry", "fruit"],
  ["strawberries", "fruit"],
  ["mixed berries", "fruit"],
  ["berries", "fruit"],
  ["sour cherries", "fruit"],
  ["cherries", "fruit"],
  ["bbq seasoning", "bbq rub"],
  ["barbecue seasoning", "bbq rub"],
  ["tabasco", "hot sauce"],
  ["tabasco sauce", "hot sauce"],
  ["parm", "parmesan"],
  ["grated parm", "parmesan"],
  ["pancetta", "bacon"],
  ["baccon", "bacon"],
  ["pulled pork", "pork butt"],
  ["pork cutlet", "pork loin"],
  ["pork cutlets", "pork loin"],
  ["chicken tender", "chicken breast"],
  ["chicken tenders", "chicken breast"],
  ["all spice", "allspice"],
  ["gumbo file", "file powder"],
  ["file", "file powder"],
  ["ground fennel", "fennel seed"],
  ["fennel bulb", "celery"],
  ["fennel bulbs", "celery"],
  ["creme fraiche", "sour cream"],
  ["picante", "salsa"],
  ["picante sauce", "salsa"],
  ["medium picante sauce", "salsa"],
  ["lox", "smoked salmon"],
  ["smoked lox", "smoked salmon"],
  ["rack of lamb", "ground lamb"],
  ["lamb chop", "ground lamb"],
  ["lamb chops", "ground lamb"],
  ["lamb", "ground lamb"],
  ["daikon", "turnip"],
  ["sprout", "bean sprouts"],
  ["sprouts", "bean sprouts"],
  ["bean sprout", "bean sprouts"],
  ["veal", "beef roast cuts"],
  ["beef shank", "beef stew"],
  ["beef shanks", "beef stew"],
  ["sole", "white fish"],
  ["tasso", "ham (Frick's boneless half)"],
  ["chicken heart", "chicken liver"],
  ["chicken hearts", "chicken liver"],
  ["chicken paste", "chicken base"],
  ["pork dust", "pork rinds"],
  ["steak umm", "shaved steak"],
  ["porterhouse", "strip steak"],
  ["drippings", "beef tallow"],
  ["chicken drippings", "chicken broth"],
  ["splenda", "liquid sucralose"],
  ["liquid splenda", "liquid sucralose"],
  ["sucralose", "liquid sucralose"],
  ["maggi", "worcestershire alt (coconut aminos)"],
  ["maggi seasoning", "worcestershire alt (coconut aminos)"],
  ["spike", "seasoned salt"],
  ["spike seasoning", "seasoned salt"],
  ["seasoning blend", "seasoned salt"],
  ["enchilada powder", "chili powder"],
  ["guacamole", "avocado"],
  ["tzatziki", "greek yogurt whole milk"],
  ["v8", "tomato sauce (plain, no sugar)"],
  ["v 8", "tomato sauce (plain, no sugar)"],
  ["spicy v8", "tomato sauce (plain, no sugar)"],
  ["cacao", "cocoa powder"],
  ["100 cacao", "baking chocolate"],
  ["curry", "curry powder"],
  ["powdered curry", "curry powder"],
  ["sweet relish", "sf relish"],
  ["pickle relish", "sf relish"],
  ["low carb sweetener", "allulose (pure)"],
  ["sweetener", "allulose (pure)"],
  ["sweetener of choice", "allulose (pure)"],
  ["sherry", "red wine"],
  ["cooking sherry", "red wine"],
  ["marsala", "red wine"],
  ["madeira", "red wine"],
  ["brandy", "red wine"],
  ["cognac", "red wine"],
  ["rum", "red wine"],
  ["grand marnier", "red wine"],
  ["spearmint", "mint dried"],
  ["mint leaves", "mint fresh"],
  ["fresh mint", "mint fresh"],
  ["dried mint", "mint dried"],
  ["wheat bran", "flaxseed meal"],
  ["bran", "flaxseed meal"],
  ["naan", "pork rinds"],
  ["flatbread", "pork rinds"],
  ["hoagie", "pork rinds"],
  ["chaffle", "mozzarella"],
  ["chaffle bun", "mozzarella"],
  ["chaffle buns", "mozzarella"],
  ["reduction gravy", "beef base"],
  ["gravy", "beef base"],
  ["tomato sauce bolognese", "pasta sauce (bettergoods basil garlic)"],
  ["bolognese", "pasta sauce (bettergoods basil garlic)"],
  ["bolognese sauce", "pasta sauce (bettergoods basil garlic)"],
  ["no soy", "coconut aminos"],
  ["soy free", "coconut aminos"],
  ["soy free sauce", "coconut aminos"],
  ["northwoods fire", "bbq rub"],
  ["italian dipping", "italian seasoning"],
  ["dry italian", "italian seasoning"],
  ["onion garlic powder", "garlic powder"],
  ["garlic onion powder", "garlic powder"],
  ["pulled chicken", "chicken breast"],
  ["shredded chicken", "chicken breast"],
  ["rotisserie", "rotisserie chicken"],
  ["chicken quarter", "chicken thigh"],
  ["leg quarter", "chicken thigh"],
  ["oyster", "shellfish"],
  ["oysters", "shellfish"],
  ["clam", "clam juice"],
  ["clams", "clam juice"],
  ["scallop", "scallops"],
  ["tilapia filet", "tilapia"],
  ["fish filet", "white fish"],
  ["white fish filet", "white fish"],
  ["cod filet", "white fish"],
  ["salmon filet", "salmon"],
  ["smoked salmon lox", "smoked salmon"],
  ["pepperoncini", "banana peppers (pickled)"],
  ["banana pepper", "banana peppers (pickled)"],
  ["banana peppers", "banana peppers (pickled)"],
  ["green chile", "green chiles (diced)"],
  ["green chiles", "green chiles (diced)"],
  ["green chili", "green chiles (diced)"],
  ["green chilies", "green chiles (diced)"],
  ["chipotle", "chipotle powder"],
  ["chipotles", "chipotle powder"],
  ["adobo", "chipotle powder"],
  ["ancho", "ancho powder"],
  ["gochugaru flakes", "gochugaru"],
  ["korean pepper", "gochugaru"],
  ["msg", "seasoned salt"],
  ["accent seasoning", "seasoned salt"],
  ["bouillon", "chicken base"],
  ["chicken bouillon", "chicken base"],
  ["beef bouillon", "beef base"],
  ["better than bouillon", "chicken base"],
  ["tomato juice", "tomato sauce (plain, no sugar)"],
  ["passata", "tomato sauce (plain, no sugar)"],
  ["pesto", "basil fresh"],
  ["alfredo", "alfredo sauce (Classico four cheese)"],
  ["vodka sauce", "vodka sauce (bettergoods)"],
  ["classico", "pasta sauce (bettergoods basil garlic)"],
  ["marinara sauce", "pasta sauce (bettergoods basil garlic)"],
  ["pizza sauce", "tomato sauce (plain, no sugar)"],
  ["queso", "queso dip"],
  ["salsa con queso", "queso dip"],
  ["blue cheese crumble", "blue cheese"],
  ["gorgonzola", "blue cheese"],
  ["asiago", "parmesan"],
  ["romano", "parmesan"],
  ["pecorino", "parmesan"],
  ["cotija", "feta"],
  ["queso fresco", "feta"],
  ["oaxaca", "mozzarella"],
  ["pepperjack", "pepper jack cheese (block)"],
  ["colby", "colby jack cheese (block)"],
  ["colby jack", "colby jack cheese (block)"],
  ["muenster", "monterey jack"],
  ["munster", "monterey jack"],
  ["raclette", "gruyere"],
  ["fontina", "gruyere"],
  ["manchego", "parmesan"],
  ["halloumi cheese", "halloumi"],
  ["string cheese stick", "string cheese"],
  ["laughing cow cheese", "babybel"],
  ["boursin cheese", "Boursin garlic & herb"],
  ["cream of chicken", "chicken base"],
  ["cream of celery", "celery"],
  ["cream of mushroom soup", "mushroom"],
  ["condensed mushroom soup", "mushroom"],
  ["whipping cream", "heavy cream"],
  ["double cream", "heavy cream"],
  ["clotted cream", "heavy cream"],
  ["half n half", "half and half"],
  ["light cream", "half and half"],
  ["evaporated milk", "whole milk"],
  ["condensed milk", "whole milk"],
  ["fairlife", "whole milk"],
  ["fairlife milk", "whole milk"],
  ["almond milk unsweetened", "whole milk"],
  ["unsweetened almond milk", "whole milk"],
  ["coconut milk unsweetened", "coconut milk"],
  ["full fat coconut milk", "coconut milk"],
  ["canned coconut milk", "coconut milk"],
  ["greek yogurt plain", "greek yogurt whole milk"],
  ["plain greek yogurt", "greek yogurt whole milk"],
  ["skyr", "greek yogurt whole milk"],
  ["labneh", "greek yogurt whole milk"],
  ["kefir plain", "kefir"],
  ["buttermilk powder", "buttermilk powder"],
  ["cultured buttermilk", "buttermilk"],
  ["egg substitute", "eggs (large)"],
  ["liquid egg", "eggs (large)"],
  ["pasteurized egg", "eggs (large)"],
  ["yolk", "eggs (large)"],
  ["whites", "eggs (large)"],
  ["gelatin powder", "gelatin"],
  ["knox gelatin", "gelatin"],
  ["collagen peptides", "collagen"],
  ["grass fed collagen", "collagen"],
  ["pork rind crumbs", "pork rinds"],
  ["crushed pork rinds", "pork rinds"],
  ["whey", "protein powder (whey)"],
  ["isowhey", "protein powder (whey)"],
  ["casein", "protein powder (whey)"],
  ["pb2", "peanut butter powder"],
  ["peanut butter powder", "peanut butter powder"],
  ["pb fit", "peanut butter powder"],
  ["sunflower seed", "sesame seed"],
  ["pepitas", "sesame seed"],
  ["sunflower seeds", "sesame seed"],
  ["pumpkin seeds", "sesame seed"],
  ["hemp seed", "chia"],
  ["hemp seeds", "chia"],
  ["flax seeds", "flaxseed meal"],
  ["golden flax", "flaxseed meal"],
  ["psyllium", "xanthan guar"],
  ["psyllium husk", "xanthan guar"],
  ["konjac", "xanthan guar"],
  ["glucomannan", "xanthan guar"],
  ["miracle noodles", "xanthan guar"],
  ["shirataki", "xanthan guar"],
  ["palmini", "artichoke"],
  ["hearts of palm", "artichoke"],
  ["heart of palm", "artichoke"],
  ["cabbage steak", "cabbage"],
  ["cauliflower rice", "cauliflower"],
  ["cauli rice", "cauliflower"],
  ["riced cauliflower", "cauliflower"],
  ["cauliflower florets", "cauliflower"],
  ["broccoli florets", "broccoli"],
  ["broccolini", "broccoli"],
  ["broccolini stalks", "broccoli"],
  ["zoodles", "zucchini"],
  ["zucchini noodles", "zucchini"],
  ["spaghetti squash strands", "spaghetti squash"],
  ["yellow squash", "yellow squash"],
  ["summer squash", "yellow squash"],
  ["acorn squash", "spaghetti squash"],
  ["butternut", "spaghetti squash"],
  ["butternut squash", "spaghetti squash"],
  ["pumpkin", "pumpkin puree"],
  ["canned pumpkin", "pumpkin puree"],
  ["libbys pumpkin", "pumpkin puree"],
  ["pumpkin pie spice", "cinnamon"],
  ["pumpkin spice", "cinnamon"],
  ["apple", "apple (Granny Smith)"],
  ["granny smith", "apple (Granny Smith)"],
  ["green apple", "apple (Granny Smith)"],
  ["lemon wedge", "lemon"],
  ["lemon wedges", "lemon"],
  ["lime wedge", "lime"],
  ["lime wedges", "lime"],
  ["key lime", "lime"],
  ["preserved lemon", "lemon"],
  ["lemon peel", "lemon"],
  ["lime peel", "lime"],
  ["orange", "orange extract"],
  ["blood orange", "orange extract"],
  ["mandarin", "orange extract"],
  ["clementine", "orange extract"],
  ["grapefruit", "fruit"],
  ["blueberry", "blueberries"],
  ["raspberry", "raspberries"],
  ["blackberry", "raspberries"],
  ["blackberries", "raspberries"],
  ["cranberry", "cranberries (fresh)"],
  ["dried cranberries", "cranberries (fresh)"],
  ["raisins", "cranberries (fresh)"],
  ["dates", "fruit"],
  ["figs", "fruit"],
  ["avocado oil spray", "avocado oil"],
  ["cooking spray", "avocado oil"],
  ["nonstick spray", "avocado oil"],
  ["pam", "avocado oil"],
  ["canola oil", "avocado oil"],
  ["vegetable oil", "avocado oil"],
  ["peanut oil", "avocado oil"],
  ["grapeseed oil", "avocado oil"],
  ["sunflower oil", "avocado oil"],
  ["light olive oil", "olive oil"],
  ["virgin olive oil", "olive oil"],
  ["extra virgin", "olive oil"],
  ["sesame", "sesame seed"],
  ["toasted sesame", "sesame oil"],
  ["chili oil", "sesame oil"],
  ["chili crisp", "chili garlic sauce"],
  ["sambal", "chili garlic sauce"],
  ["sambal oelek", "chili garlic sauce"],
  ["sriracha sauce", "hot sauce"],
  ["franks red hot", "hot sauce"],
  ["franks hot sauce", "hot sauce"],
  ["louisiana hot sauce", "hot sauce"],
  ["crystal hot sauce", "hot sauce"],
  ["valentina", "hot sauce"],
  ["cholula", "hot sauce"],
  ["tapatio", "hot sauce"],
  ["buffalo sauce", "hot sauce"],
  ["wing sauce", "hot sauce"],
  ["soy sauce low sodium", "tamari"],
  ["low sodium soy sauce", "tamari"],
  ["shoyu", "tamari"],
  ["liquid aminos", "coconut aminos"],
  ["braggs", "coconut aminos"],
  ["bragg", "coconut aminos"],
  ["fish sauce red boat", "fish sauce"],
  ["oyster sauce lee kum kee", "oyster sauce"],
  ["hoisin sauce low carb", "hoisin"],
  ["rice wine", "rice vinegar"],
  ["mirin", "rice vinegar"],
  ["sake", "rice vinegar"],
  ["shaoxing", "rice vinegar"],
  ["black vinegar", "rice vinegar"],
  ["champagne vinegar", "white wine vinegar"],
  ["tarragon vinegar", "tarragon vinegar"],
  ["malt vinegar", "white vinegar"],
  ["seasoned rice vinegar", "rice vinegar"],
  ["pickle juice", "pickles (dill chips)"],
  ["dill pickle juice", "pickles (dill chips)"],
  ["cornichon", "pickles (dill chips)"],
  ["cornichons", "pickles (dill chips)"],
  ["gherkin", "pickles (dill chips)"],
  ["pepperoncini", "banana peppers (pickled)"],
  ["giardiniera", "banana peppers (pickled)"],
  ["pickled onion", "red onion"],
  ["pickled red onion", "red onion"],
  ["pickled jalapeno", "pickled jalapeno"],
  ["jalapenos pickled", "pickled jalapeno"],
  ["roasted red peppers", "roasted red pepper"],
  ["poblano", "bell pepper"],
  ["poblano pepper", "bell pepper"],
  ["anaheim", "green chiles (diced)"],
  ["serrano", "jalapeno"],
  ["serrano pepper", "jalapeno"],
  ["habanero", "jalapeno"],
  ["thai chili", "red pepper flakes"],
  ["thai chile", "red pepper flakes"],
  ["bird eye chili", "red pepper flakes"],
  ["fresno", "red bell pepper"],
  ["fresno pepper", "red bell pepper"],
  ["mini pepper", "mini peppers"],
  ["sweet pepper", "mini peppers"],
  ["cherry pepper", "mini peppers"],
  ["tomato puree", "tomato sauce (plain, no sugar)"],
  ["tomato passata", "tomato sauce (plain, no sugar)"],
  ["san marzano", "canned tomato"],
  ["whole peeled tomatoes", "canned tomato"],
  ["fire roasted tomatoes", "canned tomato"],
  ["rotel", "Rotel diced tomatoes & green chilies"],
  ["diced tomatoes and green chiles", "Rotel diced tomatoes & green chilies"],
  ["sun dried tomato", "sundried tomato"],
  ["tomato powder", "tomato paste"],
  ["ketchup sugar free", "sf ketchup"],
  ["heinz ketchup", "sf ketchup"],
  ["yellow mustard", "mustard"],
  ["dijon", "dijon"],
  ["whole grain mustard", "mustard"],
  ["stone ground mustard", "mustard"],
  ["dry mustard", "mustard powder"],
  ["ground mustard", "mustard powder"],
  ["horseradish sauce", "horseradish"],
  ["prepared horseradish", "horseradish"],
  ["wasabi", "horseradish"],
  ["ginger root", "ginger paste"],
  ["fresh ginger root", "ginger paste"],
  ["galangal", "ginger paste"],
  ["lemongrass", "lemon"],
  ["kaffir lime", "lime"],
  ["lime leaves", "lime"],
  ["curry leaves", "curry powder"],
  ["garam masala", "garam masala"],
  ["garam", "garam masala"],
  ["turmeric powder", "turmeric"],
  ["ground turmeric", "turmeric"],
  ["cumin seed", "cumin"],
  ["cumin seeds", "cumin"],
  ["ground cumin", "cumin"],
  ["coriander seed", "coriander"],
  ["ground coriander", "coriander"],
  ["fennel seeds", "fennel seed"],
  ["caraway", "fennel seed"],
  ["caraway seed", "fennel seed"],
  ["dill seed", "dill dried"],
  ["celery seeds", "celery seed"],
  ["mustard seed", "mustard powder"],
  ["mustard seeds", "mustard powder"],
  ["peppercorn", "peppercorns"],
  ["black peppercorn", "peppercorns"],
  ["whole pepper", "peppercorns"],
  ["white peppercorn", "white pepper"],
  ["pink pepper", "black pepper"],
  ["aleppo pepper", "aleppo"],
  ["chipotle chile", "chipotle powder"],
  ["chipotle pepper", "chipotle powder"],
  ["ancho chile", "ancho powder"],
  ["ancho chili", "ancho powder"],
  ["chili pepper", "chili powder"],
  ["ground chipotle", "chipotle powder"],
  ["cayenne pepper", "cayenne"],
  ["red pepper", "red pepper flakes"],
  ["crushed pepper", "red pepper flakes"],
  ["paprika smoked", "smoked paprika"],
  ["sweet paprika", "paprika"],
  ["hungarian paprika", "paprika"],
  ["hot paprika", "cayenne"],
  ["onion flakes", "onion powder"],
  ["dried onion", "onion powder"],
  ["garlic flakes", "garlic powder"],
  ["garlic granules", "garlic powder"],
  ["granulated garlic", "garlic powder"],
  ["granulated onion", "onion powder"],
  ["garlic herb", "italian seasoning"],
  ["herbs de provence", "italian seasoning"],
  ["herbes de provence", "italian seasoning"],
  ["everything bagel", "sesame seed"],
  ["everything seasoning", "sesame seed"],
  ["bagel seasoning", "sesame seed"],
  ["old bay seasoning", "old bay"],
  ["cajun seasoning blend", "cajun"],
  ["creole seasoning", "cajun"],
  ["tony chachere", "cajun"],
  ["blackening seasoning", "cajun"],
  ["taco seasoning packet", "taco seasoning"],
  ["ranch packet", "ranch seasoning"],
  ["ranch mix", "ranch seasoning"],
  ["poultry seasoning blend", "poultry seasoning"],
  ["italian seasoning blend", "italian seasoning"],
  ["five spice powder", "five spice powder"],
  ["chinese 5 spice", "five spice powder"],
  ["cinnamon ground", "cinnamon"],
  ["ground cinnamon", "cinnamon"],
  ["nutmeg ground", "nutmeg"],
  ["ground nutmeg", "nutmeg"],
  ["allspice berries", "allspice"],
  ["ground allspice", "allspice"],
  ["cloves ground", "cloves"],
  ["cardamom pods", "cardamom"],
  ["ground cardamom", "cardamom"],
  ["star anise", "anise"],
  ["anise seed", "anise"],
  ["aniseed", "anise"],
  ["vanilla bean", "vanilla"],
  ["vanilla paste", "vanilla"],
  ["vanilla bean paste", "vanilla"],
  ["almond flavoring", "almond extract"],
  ["maple flavoring", "maple extract"],
  ["maple flavor", "maple extract"],
  ["rum extract", "maple extract"],
  ["orange flavoring", "orange extract"],
  ["lemon flavoring", "lemon extract"],
  ["coconut extract", "coconut flakes"],
  ["cocoa unsweetened", "cocoa powder"],
  ["dutch cocoa", "cocoa powder"],
  ["cacao powder", "cocoa powder"],
  ["cacao nibs", "cocoa powder"],
  ["baking chocolate unsweetened", "baking chocolate"],
  ["unsweetened baking chocolate", "baking chocolate"],
  ["baker's chocolate", "baking chocolate"],
  ["bakers chocolate", "baking chocolate"],
  ["chocolate chips", "sf chocolate"],
  ["sugar free chocolate chips", "sf chocolate"],
  ["lily's chocolate", "sf chocolate"],
  ["lilys chocolate", "sf chocolate"],
  ["dark chocolate chips", "sf chocolate"],
  ["cocoa butter", "cocoa butter"],
  ["white chocolate", "cocoa butter"],
  ["monkfruit sweetener", "erythritol (GV monk fruit)"],
  ["monk fruit sweetener", "erythritol (GV monk fruit)"],
  ["lakanto", "erythritol (GV monk fruit)"],
  ["swerve confectioners", "erythritol"],
  ["powdered swerve", "erythritol"],
  ["bocha sweet", "allulose (pure)"],
  ["bochasweet", "allulose (pure)"],
  ["allulose powder", "allulose (pure)"],
  ["granular allulose", "allulose (pure)"],
  ["liquid allulose", "allulose (pure)"],
  ["stevia drops", "stevia"],
  ["liquid stevia drops", "stevia"],
  ["pyure", "stevia"],
  ["truvia", "erythritol"],
  ["xylitol", "erythritol"],
  ["coconut sugar", "allulose (pure)"],
  ["maple sugar", "allulose (pure)"],
  ["date sugar", "allulose (pure)"],
  ["agave", "allulose (pure)"],
  ["golden syrup", "sf maple syrup"],
  ["sugar free syrup", "sf maple syrup"],
  ["pancake syrup", "sf maple syrup"],
  ["torani", "sf maple syrup"],
  ["jordan's skinny syrup", "cinnamon sweetener"],
  ["skinny syrup", "cinnamon sweetener"],
  ["cinnamon dolce", "cinnamon sweetener"],
  ["lmnt", "lmnt"],
  ["electrolytes", "lmnt"],
  ["redmond", "redmond salt"],
  ["real salt", "redmond salt"],
  ["himalayan salt", "salt"],
  ["pink salt", "salt"],
  ["celtic salt", "salt"],
  ["flaky salt", "salt"],
  ["maldon", "salt"],
  ["kosher", "kosher salt"],
  ["diamond crystal", "kosher salt"],
  ["seasoning salt", "seasoned salt"],
  ["lawry's", "seasoned salt"],
  ["lawrys", "seasoned salt"],
  ["garlic salt seasoning", "garlic salt"],
  ["celery salt", "celery salt"],
  ["onion salt", "onion powder"],
  ["curing salt pink", "curing salt"],
  ["prague powder", "curing salt"],
  ["instacure", "curing salt"],
  ["pink curing salt", "curing salt"],
  ["tender quick", "curing salt"],
  ["liquid smoke hickory", "liquid smoke"],
  ["hickory smoke", "liquid smoke"],
  ["mesquite", "liquid smoke"],
  ["espresso instant", "instant espresso"],
  ["instant espresso powder", "instant espresso"],
  ["coffee", "coffee"],
  ["brewed coffee", "coffee"],
  ["cold brew", "coffee"],
  ["espresso shot", "instant espresso"],
  ["black cocoa", "cocoa powder"],
  ["pizza cheese", "mozzarella"],
  ["shredded pizza cheese", "mozzarella"],
  ["mexican cheese", "mexican blend"],
  ["shredded mexican cheese", "mexican blend"],
  ["parm cheese", "parmesan"],
  ["bleu cheese", "blue cheese"],
  ["bleu", "blue cheese"],
  ["provalone", "provolone"],
  ["provolone cheese", "provolone"],
  ["white american", "American cheese (Kraft Singles)"],
  ["american", "American cheese (Kraft Singles)"],
  ["baby swiss", "swiss cheese (block)"],
  ["chilli", "chili powder"],
  ["chilli powder", "chili powder"],
  ["tumeric", "turmeric"],
  ["gound beef", "ground beef 80/20"],
  ["ground chuck", "ground beef 80/20"],
  ["alluose", "allulose (pure)"],
  ["allulose", "allulose (pure)"],
  ["chocolove", "baking chocolate"],
  ["port wine", "red wine"],
  ["port", "red wine"],
  ["orange pepper", "mini peppers"],
  ["yellow pepper", "mini peppers"],
  ["green pepper", "bell pepper"],
  ["green peppers", "bell pepper"],
  ["rice", "cauliflower"],
  ["white rice", "cauliflower"],
  ["cauliflower rice", "cauliflower"],
  ["swordfish", "tuna"],
  ["flounder", "white fish"],
  ["snapper", "white fish"],
  ["red snapper", "white fish"],
  ["yellowtail", "white fish"],
  ["prawn", "shrimp"],
  ["prawns", "shrimp"],
  ["suet", "beef tallow"],
  ["fat cap", "beef tallow"],
  ["beef fat", "beef tallow"],
  ["fat trimmings", "beef tallow"],
  ["pork fat", "lard"],
  ["rendered pork fat", "lard"],
  ["pork jowl", "bacon"],
  ["jowl", "bacon"],
  ["spareribs", "pork ribs"],
  ["spare ribs", "pork ribs"],
  ["beef spareribs", "beef ribs"],
  ["potato", "turnip"],
  ["red potato", "turnip"],
  ["potatoes", "turnip"],
  ["file gumbo", "file powder"],
  ["gumbo file", "file powder"],
  ["thai basil", "basil fresh"],
  ["umami", "dried porcini"],
  ["umami powder", "dried porcini"],
  ["porcini powder", "dried porcini"],
  ["pomodoro", "pasta sauce (bettergoods basil garlic)"],
  ["pomodoro sauce", "pasta sauce (bettergoods basil garlic)"],
  ["dorketo", "cheddar powder"],
  ["dorketos", "cheddar powder"],
  ["dorito", "cheddar powder"],
  ["farm dust", "seasoned salt"],
  ["egglife", "eggs (large)"],
  ["egg life", "eggs (large)"],
  ["egg wrap", "eggs (large)"],
  ["egg wraps", "eggs (large)"],
  ["goat milk", "milk powder"],
  ["powdered milk", "milk powder"],
  ["dry milk", "milk powder"],
  ["powdered goat milk", "milk powder"],
  ["nonfat dry milk", "milk powder"],
  ["non fat dry milk", "milk powder"],
  ["pork broth", "bone broth"],
  ["seafood stock", "clam juice"],
  ["seafood broth", "clam juice"],
  ["t bone", "strip steak"],
  ["tbone", "strip steak"],
  ["arm roast", "beef roast cuts"],
  ["cube steak", "beef roast cuts"],
  ["tri tip", "beef roast cuts"],
  ["beef cheek", "beef stew"],
  ["beef cheeks", "beef stew"],
  ["chateaubriand", "beef tenderloin"],
  ["top round", "beef roast cuts"],
  ["round roast", "beef roast cuts"],
  ["london broil", "beef roast cuts"],
  ["braciole", "beef roast cuts"],
  ["meatball", "ground beef 80/20"],
  ["meatballs", "ground beef 80/20"],
  ["wild boar", "ground pork"],
  ["boar", "ground pork"],
  ["crawfish", "shellfish"],
  ["crawdad", "shellfish"],
  ["crawdads", "shellfish"],
  ["crayfish", "shellfish"],
  ["gochugaru", "gochugaru"],
  ["bidan", "gochugaru"],
  ["biden pepper", "gochugaru"],
  ["bidan pepper", "gochugaru"],
  ["mayonnaise", "mayonnaise"],
  ["probiotic mayo", "mayonnaise"],
  ["homemade mayo", "mayonnaise"],
  ["tartar sauce", "mayonnaise"],
  ["thousand island", "mayonnaise"],
  ["1000 island", "mayonnaise"],
  ["big mac sauce", "mayonnaise"],
  ["carnivore bun", "mozzarella"],
  ["carnivore buns", "mozzarella"],
  ["cloud bread", "eggs (large)"],
  ["fathead", "mozzarella"],
  ["loin roast", "pork loin"],
  ["boneless loin", "pork loin"],
  ["smoked chicken", "rotisserie chicken"],
  ["spatchcock", "whole chicken"],
  ["soup bone", "beef bones"],
  ["marrow", "beef bones"],
  ["cod liver", "white fish"],
  ["orange zested", "orange extract"],
  ["zested orange", "orange extract"],
  ["hard boiled egg", "eggs (large)"],
  ["beaten egg", "eggs (large)"],
  ["egg wash", "eggs (large)"],
  ["yolks", "eggs (large)"],
  ["dry dill", "dill dried"],
  ["stock or broth", "bone broth"],
  ["broth or stock", "bone broth"],
  ["roast broth", "beef base"],
  ["chicken gravy", "chicken base"],
  ["mixed herbs", "italian seasoning"],
  ["dried herbs", "italian seasoning"],
  ["mixed spices", "italian seasoning"],
  ["low carb veggies", "spring mix"],
  ["assorted low carb veggies", "spring mix"],
  ["romaine", "lettuce"],
  ["iceberg", "lettuce"],
  ["butterhead", "lettuce"],
  ["endive", "lettuce"],
  ["radicchio", "lettuce"],
  ["watercress", "arugula"],
  ["bean sprout", "bean sprouts"],
  ["mung bean", "bean sprouts"],
  ["edamame", "legumes"],
  ["black beans", "fermented black beans"],
  ["kidney beans", "legumes"],
  ["chickpeas", "legumes"],
  ["lentils", "legumes"],
  ["peanuts", "peanuts"],
  ["peanut", "peanuts"],
  ["scalloped veal", "beef roast cuts"],
  ["veal medallion", "beef roast cuts"],
  ["veal medallions", "beef roast cuts"],
  ["veal cutlet", "beef roast cuts"],
  ["veal cutlets", "beef roast cuts"],
  ["ground veal", "ground beef 80/20"],
  ["leg of lamb", "ground lamb"],
  ["lamb leg", "ground lamb"],
  ["lamb shoulder", "ground lamb"],
  ["stir fry beef", "shaved steak"],
  ["stir-fry beef", "shaved steak"],
  ["shaved beef", "shaved steak"],
  ["wagyu", "ribeye"],
  ["ny strip", "strip steak"],
  ["new york strip", "strip steak"],
  ["spencer roast", "ribeye"],
  ["ribeye roast", "ribeye"],
  ["beef chili", "ground beef 80/20"],
  ["low carb chili", "ground beef 80/20"],
  ["chili", "chili powder"],
  ["cheddaronies", "cheddar"],
  ["pepperoni chips", "pepperoni"],
  ["halloumi", "halloumi"],
  ["queso", "queso dip"],
  ["white wine", "white wine vinegar"],
  ["steak", "beef roast cuts"],
  ["steak sliced thin", "shaved steak"],
  ["sliced steak", "shaved steak"],
  ["burger", "ground beef 80/20"],
  ["burger patty", "ground beef 80/20"],
  ["burger patties", "ground beef 80/20"],
  ["chuck steak", "chuck roast"],
  ["wings and drums", "chicken wings"],
  ["drum", "drumsticks"],
  ["drums", "drumsticks"],
  ["mcchaffle", "mozzarella"],
  ["spatchcocked", "whole chicken"],
  ["spatchcocked chicken", "whole chicken"],
  ["biscuit", "almond flour"],
  ["biscuits", "almond flour"],
  ["hollandaise", "butter"],
  ["bearnaise", "butter"],
  ["egg noodle", "eggs (large)"],
  ["egg noodles", "eggs (large)"],
  ["tortilla", "mozzarella"],
  ["tortillas", "mozzarella"],
  ["cheese shell", "cheddar"],
  ["cheese shells", "cheddar"],
  ["taco shell", "cheddar"],
  ["pie crust", "almond flour"],
  ["spaetzle", "eggs (large)"],
  ["crepe", "eggs (large)"],
  ["crepes", "eggs (large)"],
  ["pico de gallo", "tomato"],
  ["pico", "tomato"],
  ["tonnato", "tuna"],
  ["yogurt starter", "greek yogurt whole milk"],
  ["yogourmet", "greek yogurt whole milk"],
  ["fennel bulb", "celery"],
  ["bulbs fennel", "celery"],
  ["mixed seafood", "shellfish"],
  ["seafood", "shellfish"],
  ["deep fry", "beef tallow"],
  ["oil to deep fry", "beef tallow"],
  ["frying oil", "avocado oil"],
  ["oil of choice", "avocado oil"],
  ["v 8", "tomato sauce (plain, no sugar)"],
  ["spicy v 8", "tomato sauce (plain, no sugar)"],
  ["grass fed milk", "whole milk"],
  ["non fat milk", "milk powder"],
  ["dry non fat milk", "milk powder"],
  ["nonfat milk", "milk powder"],
  ["spog", "seasoned salt"],
  ["homemade seasoning", "seasoned salt"],
  ["hard cheese", "cheddar"],
  ["soup bones", "beef bones"],
  ["scrap bones", "beef bones"],
  ["roast", "beef roast cuts"],
  ["ezsweets", "liquid sucralose"],
  ["ez sweets", "liquid sucralose"],
  ["drops ezsweets", "liquid sucralose"],
  ["squash", "spaghetti squash"],
  ["bread", "pork rinds"],
  ["chicken chips", "chicken thigh"],
  ["asian dipping", "tamari"],
  ["dipping sauce", "tamari"],
  ["pizza dough", "mozzarella"],
  ["bagel dough", "mozzarella"],
  ["noodle", "eggs (large)"],
  ["noodles", "eggs (large)"],
  ["tartar", "mayonnaise"],
  ["ranch", "ranch dressing"],
  ["ice", "water"],
  ["ice cubes", "water"],
  ["crushed ice", "water"],
  ["ice water", "water"],
];
const ALIASES = new Map<string, string>();
for (const [key, name] of ALIAS_ROWS) {
  const norm = normalize(key);
  ALIASES.set(norm, name);
  ALIASES.set(singularPhrase(norm), name);
}


interface LibEntry {
  name: string;
  tokens: string[];
  phrase: string;
}

const library: LibEntry[] = (ingredientRows as SourcedIngredient[])
  .filter((item) => item.name.toLowerCase() !== "misc flag")
  .map((item) => {
    const phrase = normalize(stripParen(item.name));
    return { name: item.name, tokens: tokensOf(phrase), phrase };
  });

const byExact = new Map<string, string>();
for (const entry of library) {
  byExact.set(entry.phrase, entry.name);
  byExact.set(entry.tokens.join(" "), entry.name);
}

function singularPhrase(phrase: string): string {
  return phrase.split(" ").map(singular).filter(Boolean).join(" ");
}

function lookupAlias(phrase: string): IngredientPair | null {
  const name = ALIASES.get(phrase) ?? ALIASES.get(singularPhrase(phrase));
  if (!name) return null;
  const aliasPhrase = normalize(stripParen(name));
  const exact = byExact.get(phrase) === name || phrase === aliasPhrase || singularPhrase(phrase) === singularPhrase(aliasPhrase);
  return { name, match: exact ? "exact" : "closest" };
}

function aliasFromTokens(tokens: string[]): string | null {
  for (let size = Math.min(tokens.length, 5); size >= 1; size -= 1) {
    for (let index = 0; index + size <= tokens.length; index += 1) {
      const key = tokens.slice(index, index + size).join(" ");
      if (size === 1 && (key.length < 3 || WEAK_ALIAS.has(key))) continue;
      const name = ALIASES.get(key) ?? ALIASES.get(singularPhrase(key));
      if (name) return name;
    }
  }
  return null;
}

export function pairIngredient(text: string): IngredientPair {
  const phrase = normalize(stripParen(text));
  if (!phrase) return { name: null, match: "none" };
  if (phrase.includes("food coloring") || phrase.includes("oreo")) return { name: null, match: "zero" };
  if (phraseIncludes(phrase, "any meat")) return { name: "ground beef 80/20", match: "closest" };
  if ((/\b73\b/.test(phrase) && /\b27\b/.test(phrase)) || (/\b73\b/.test(phrase) && phrase.includes("beef"))) {
    return { name: "ground beef 73/27", match: "closest" };
  }
  const directAlias = lookupAlias(phrase);
  if (directAlias) return directAlias;
  if (/\b(diced|crushed|canned|petite|stewed)\b/.test(phrase) && /\btomatoes?\b/.test(phrase) && !/\b(sauce|paste|puree|passata|rotel|chile|chili)\b/.test(phrase)) {
    return { name: "canned tomato", match: "exact" };
  }
  if (/pork rinds?|pork skins?/.test(phrase) && !phrase.includes("belly")) return { name: "pork rinds", match: "closest" };
  const itemTokens = splitGlued(tokensOf(phrase).filter((token) => !FILLER.has(token) && !/^\d+$/.test(token)));
  if (!itemTokens.length) return { name: null, match: "none" };
  if (itemTokens.includes("garlic") && (itemTokens.includes("clove") || itemTokens.includes("cloves"))) return { name: "garlic minced", match: "closest" };
  if (phraseIncludes(phrase, "fresh")) {
    const freshHerb = FRESH_HERB.get(itemTokens.find((token) => FRESH_HERB.has(token)) || "");
    if (freshHerb) return { name: freshHerb, match: "closest" };
  }
  if (itemTokens.includes("frying") && (itemTokens.includes("oil") || itemTokens.includes("fat"))) return { name: itemTokens.includes("oil") ? "avocado oil" : "beef tallow", match: "closest" };
  const itemPhrase = itemTokens.join(" ");
  if (itemTokens.includes("pork") && (itemTokens.includes("rind") || (itemTokens.includes("skin") && !itemTokens.includes("belly") && !itemTokens.includes("chop")))) {
    return { name: "pork rinds", match: "closest" };
  }
  const itemAlias = lookupAlias(itemPhrase);
  if (itemAlias) return itemAlias;
  const direct = byExact.get(itemPhrase);
  if (direct) return { name: direct, match: "exact" };
  const squeezed = byExact.get(itemPhrase.replace(/ /g, ""));
  if (squeezed) return { name: squeezed, match: "closest" };

  let best: { name: string; score: number; exact: boolean } | null = null;
  for (const entry of library) {
    if (!entry.tokens.length) continue;
    const contained = phraseIncludes(itemPhrase, entry.phrase);
    const extras = itemTokens.filter((token) => !entry.tokens.includes(token));
    const missing = entry.tokens.filter((token) => !itemTokens.includes(token) && !FILLER.has(token) && !/^\d+$/.test(token));
    const shared = entry.tokens.filter((token) => itemTokens.includes(token) && !/^\d+$/.test(token));
    let score = 0;
    let exact = false;
    if (itemPhrase === entry.phrase) {
      score = 1000;
      exact = true;
    } else if (contained && extras.every((token) => FILLER.has(token))) {
      score = 900 + entry.tokens.length;
      exact = true;
    } else if (contained) {
      score = 700 + entry.phrase.length;
    } else if (phraseIncludes(entry.phrase, itemPhrase) && itemTokens.length) {
      const extras = entry.tokens.filter((token) => !itemTokens.includes(token) && !/^\d+$/.test(token));
      score = 500 + itemPhrase.length * 5 - extras.length * 12;
      exact = extras.length === 0;
    } else if (shared.length) {
      const useful = shared.filter((token) => !GENERIC.has(token));
      if (!useful.length) score = 0;
      else score = useful.length * 40 + (shared.length - useful.length) * 8 - missing.length * 12 - extras.length * 4;
    }
    if (!best || score > best.score) best = { name: entry.name, score, exact };
  }
  if (!best || best.score < 36) {
    const windowed = aliasFromTokens(itemTokens);
    if (windowed) return { name: windowed, match: "closest" };
    const fallback = aliasContained(phrase) ?? aliasContained(itemPhrase);
    if (fallback) return { name: fallback, match: "closest" };
    return { name: null, match: "none" };
  }
  return { name: best.name, match: best.exact ? "exact" : "closest" };
}

export function annotateRecipes(recipes: Recipe[]): boolean {
  let changed = false;
  for (const recipe of recipes) {
    if (isOriginal(recipe) && annotateRecipe(recipe)) changed = true;
  }
  if (linkReferencedRecipes(recipes)) changed = true;
  if (linkTacoMix(recipes)) changed = true;
  return changed;
}

/**
 * "1 recipe X" is a pointer at another recipe, not a pantry item.
 * Stamp `sourced_recipe` with that uid and drop the pantry pair so the line
 * is not scaled as flaxseed meal, eggs, or whatever the closest word was.
 */
export function linkReferencedRecipes(recipes: Recipe[]): boolean {
  let changed = false;
  for (const recipe of recipes) {
    if (!isOriginal(recipe)) continue;
    const sections = recipe.ingredient_sections;
    const lists: IngredientObj[][] = [];
    if (Array.isArray(sections) && sections.some((section) => section.items?.length)) {
      for (const section of sections) if (section.items) lists.push(section.items);
    } else if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
      lists.push(recipe.ingredients as IngredientObj[]);
    } else if (Array.isArray(recipe.estimated_ingredients) && recipe.estimated_ingredients.length) {
      lists.push(recipe.estimated_ingredients as IngredientObj[]);
    }
    for (const list of lists) {
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const linked = linkedRecipe(recipePhrase(item), recipes, recipe.uid);
        if (linked) {
          const dirty = item.sourced_recipe !== linked.uid || item.sourced_name != null || item.sourced_match != null;
          if (!dirty) continue;
          item.sourced_recipe = linked.uid;
          delete item.sourced_name;
          delete item.sourced_match;
          changed = true;
        } else if (item.sourced_recipe && !isTacoMixSpoon(recipePhrase(item))) {
          delete item.sourced_recipe;
          changed = true;
        }
      }
    }
  }
  return changed;
}

const TACO_MIX_UID = "diabetic_chef:low-carb-taco-seasoning";

/** A measured spoon of "taco seasoning" in her recipes is the spice mix, not a packet. */
function linkTacoMix(recipes: Recipe[]): boolean {
  if (!recipes.some((recipe) => recipe.uid === TACO_MIX_UID)) return false;
  let changed = false;
  for (const recipe of recipes) {
    if (!isOriginal(recipe) || recipe.uid === TACO_MIX_UID) continue;
    if (!recipe.uid.startsWith("diabetic_chef:")) continue;
    for (const list of ingredientLists(recipe)) {
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const text = recipePhrase(item);
        if (!isTacoMixSpoon(text)) continue;
        if (item.sourced_recipe === TACO_MIX_UID && item.sourced_name == null && item.sourced_match == null) continue;
        item.sourced_recipe = TACO_MIX_UID;
        delete item.sourced_name;
        delete item.sourced_match;
        changed = true;
      }
    }
  }
  return changed;
}

function isTacoMixSpoon(text: string): boolean {
  return /taco seasoning/i.test(text) && !/\brecipe\b/i.test(text);
}

function ingredientLists(recipe: Recipe): IngredientObj[][] {
  const sections = recipe.ingredient_sections;
  const lists: IngredientObj[][] = [];
  if (Array.isArray(sections) && sections.some((section) => section.items?.length)) {
    for (const section of sections) if (section.items) lists.push(section.items);
  } else if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
    lists.push(recipe.ingredients as IngredientObj[]);
  } else if (Array.isArray(recipe.estimated_ingredients) && recipe.estimated_ingredients.length) {
    lists.push(recipe.estimated_ingredients as IngredientObj[]);
  }
  return lists;
}

/** The other recipe a line is pointing at, or null when the line is a normal ingredient. */
export function linkedRecipe(text: string, recipes: Iterable<Recipe>, selfUid: string): Recipe | null {
  const title = referenceTitle(text);
  if (!title) return null;
  const want = tokens(title).filter((token) => !/^\d+$/.test(token));
  if (!want.length) return null;
  const pool = [...recipes].filter((recipe) => recipe?.title && recipe.uid !== selfUid && isOriginal(recipe));
  let best: Recipe | null = null;
  let bestExtra = Infinity;
  let secondExtra = Infinity;
  for (const recipe of pool) {
    const have = tokens(recipe.title);
    if (!want.every((token) => have.includes(token))) continue;
    const extra = have.filter((token) => !want.includes(token)).length;
    if (extra < bestExtra) {
      secondExtra = bestExtra;
      best = recipe;
      bestExtra = extra;
    } else if (extra < secondExtra) {
      secondExtra = extra;
    }
  }
  if (best && bestExtra <= 4 && (want.length >= 2 || secondExtra - bestExtra >= 1 || secondExtra === Infinity)) return best;
  if (want.length === 1 && want[0].length >= 5) {
    const hits = pool.filter((recipe) => tokens(recipe.title).includes(want[0]));
    if (hits.length === 1) return hits[0];
  }
  return null;
}

function referenceTitle(text: string): string | null {
  const current = text.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  if (!current || /\b(per|entire|other|my|see)\s+recipes?\b/i.test(current) || /\brecipes?\s+below\b/i.test(current)) return null;
  if (/\bor\b/i.test(current)) return null;
  const lead = current.match(/^\s*([\d./½⅓⅔¼¾⅛⅜⅝⅞]+)\s+(?:small|medium|large|big)?\s*recipes?\b(?:\s+(?:of|for))?\s+(.+)$/i);
  const trail = current.match(/^\s*([\d./½⅓⅔¼¾⅛⅜⅝⅞]+)\s+(?:small|medium|large|big)?\s*(.+?)\s+recipes?\s*$/i);
  const title = (lead?.[2] || trail?.[2] || "").replace(/^[\d.\s]+/, "").trim();
  return title.length > 2 ? title : null;
}

function tokens(value: string): string[] {
  const folded = value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\bzerocarb\b/g, "zero carb")
    .replace(/\bmayonnaise\b/g, "mayo")
    .replace(/\bcrepes\b/g, "crepe");
  return folded.split(/[^a-z0-9]+/).filter((token) => token && !LINK_STOP.has(token));
}

const LINK_STOP = new Set(["recipe", "recipes", "of", "for", "the", "a", "an", "and"]);

function annotateRecipe(recipe: Recipe): boolean {
  let changed = false;
  const sections = recipe.ingredient_sections;
  if (Array.isArray(sections) && sections.some((section) => section.items?.length)) {
    for (const section of sections) {
      if (!section.items) continue;
      section.items = section.items.map((item) => {
        const next = annotateObject(item);
        if (next.changed) changed = true;
        return next.entry;
      });
    }
    return changed;
  }
  if (Array.isArray(recipe.ingredients) && recipe.ingredients.length) {
    recipe.ingredients = recipe.ingredients.map((item) => {
      const next = annotateObject(item);
      if (next.changed) changed = true;
      return next.entry;
    });
    return changed;
  }
  if (Array.isArray(recipe.estimated_ingredients) && recipe.estimated_ingredients.length) {
    recipe.estimated_ingredients = recipe.estimated_ingredients.map((item) => {
      const next = annotateObject(item);
      if (next.changed) changed = true;
      return next.entry;
    });
  }
  return changed;
}

function annotateObject(item: IngredientObj | EstimatedIngredient | string): { entry: IngredientObj; changed: boolean } {
  const entry: IngredientObj = typeof item === "string" ? { raw: item } : { ...item };
  const text = ingredientText(item);
  if (/dressing to taste/i.test(text)) {
    // Owner: ignore this line. No library item, no "No library match" label.
    const had = entry.sourced_name != null || entry.sourced_match != null;
    delete entry.sourced_name;
    delete entry.sourced_match;
    return { entry, changed: typeof item === "string" || had };
  }
  if (referenceTitle(recipePhrase(item))) {
    // A "1 recipe X" line is linked in linkReferencedRecipes. Do not pin it to a pantry item.
    return { entry, changed: typeof item === "string" };
  }
  if (isTacoMixSpoon(recipePhrase(item))) {
    // Her spoonful is linked to the spice mix in linkTacoMix, not the Siete packet.
    return { entry, changed: typeof item === "string" };
  }
  const pair = pairIngredient(text);
  const changed = typeof item === "string" || entry.sourced_name !== pair.name || entry.sourced_match !== pair.match;
  entry.sourced_name = pair.name;
  entry.sourced_match = pair.match;
  return { entry, changed };
}

function recipePhrase(item: IngredientObj | EstimatedIngredient | string): string {
  if (typeof item === "string") return item;
  const raw = "raw" in item && item.raw ? String(item.raw) : "";
  if (/\brecipes?\b/i.test(raw)) return raw;
  return ingredientText(item);
}

function ingredientText(item: IngredientObj | EstimatedIngredient | string): string {
  if (typeof item === "string") return item;
  if ("raw" in item && item.raw) return item.item || item.raw;
  return item.item || "";
}

/**
 * Pairing a meal total should use. Originals keep the stamped fields.
 * A line with both fields cleared is paired again, except the two lines
 * the owner told us to leave alone. Returns null for an ignored line.
 */
export function pairLine(item: IngredientObj | EstimatedIngredient | string): IngredientPair | null {
  const text = ingredientText(item);
  if (/dressing to taste/i.test(text)) return null;
  if (typeof item !== "string" && item.sourced_recipe) return null;
  if (typeof item !== "string" && (item.sourced_match != null || item.sourced_name != null)) {
    if (!item.sourced_match) return null;
    const stamped = item.sourced_name ?? null;
    if (stamped === "beef bones" && !/\bbones?\b|\bmarrow\b/i.test(text)) return pairIngredient(text);
    if ((stamped === "ground pork" || stamped === "pork chop") && /pork rinds?|pork skins?/i.test(text)) return pairIngredient(text);
    if (/mini pepper|shishito|padron/i.test(text)) return { name: "mini peppers", match: "closest" };
    if (stamped === "cloves" && /\bcloves?\b/i.test(text) && !/ground|spice/i.test(text)) return { name: "garlic minced", match: "closest" };
    if (/\b(red|yellow|orange|green|bell)\s+peppers?\b/i.test(text) && !/flake|powder|cayenne|chipotle|black pepper/i.test(text)) return { name: "bell pepper", match: "closest" };
    return { name: stamped, match: item.sourced_match };
  }
  if (/dry dipping ingredients/i.test(text)) return { name: null, match: "none" };
  return pairIngredient(text);
}

function isOriginal(recipe: Recipe): boolean {
  if (recipe.variant === "version" || recipe.variant === "mod") return false;
  return !recipe.uid.includes("::v") && !recipe.uid.includes("::mod");
}

function stripParen(value: string): string {
  let current = value.trim();
  if (/^\([^()]*\)$/.test(current)) current = current.slice(1, -1).trim();
  while (/\([^()]*\)/.test(current)) current = current.replace(/\([^()]*\)/g, " ");
  return current;
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’ʻ]/g, "")
    .replace(/jalapeno/g, "jalapeno")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokensOf(phrase: string): string[] {
  return phrase
    .split(" ")
    .map(singular)
    .filter(Boolean);
}

function singular(word: string): string {
  const irregular: Record<string, string> = {
    leaves: "leaf",
    knives: "knife",
    wives: "wife",
    wolves: "wolf",
    calves: "calf",
    halves: "half",
    loaves: "loaf",
    shelves: "shelf",
    thieves: "thief",
    tomatoes: "tomato",
    potatoes: "potato",
    heroes: "hero",
    avocadoes: "avocado",
  };
  if (irregular[word]) return irregular[word];
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`;
  if (word.endsWith("oes") && word.length > 4 && word !== "shoes" && word !== "toes") return word.slice(0, -2);
  if (/(ses|shes|ches|xes|zes)$/.test(word) && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  return word;
}

function splitGlued(tokens: string[]): string[] {
  const out: string[] = [];
  for (const token of tokens) {
    const meat = /^([a-z]{3,})meat$/.exec(token);
    if (meat) {
      out.push(meat[1], "meat");
      continue;
    }
    out.push(token);
  }
  return out;
}

function aliasContained(phrase: string): string | null {
  let hit: string | null = null;
  let length = 0;
  for (const [key, name] of ALIASES) {
    if (key.length < 3 || WEAK_ALIAS.has(key) || key.length <= length) continue;
    if (phraseIncludes(phrase, key)) {
      hit = name;
      length = key.length;
    }
  }
  return hit;
}

function phraseIncludes(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return ` ${haystack} `.includes(` ${needle} `);
}
