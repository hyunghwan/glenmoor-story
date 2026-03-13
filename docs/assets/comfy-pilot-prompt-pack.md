# Comfy Pilot Prompt Pack

This prompt pack supports two uses:

- human-readable prompt review for the master batch manifests
- debug or lookdev prompting for the smaller exploratory workflows

The machine-readable batch source of truth now lives under `docs/assets/comfy-batch/`.

## Global Style Lock

Use this as the common positive prompt base for debug lookdev and as the conceptual positive base for the master batch manifests.

```text
moody medieval-fantasy tactical RPG art, painterly SRPG production concept, readable game-ready silhouettes, restrained material realism, overcast glen pass atmosphere, worn steel, weathered leather, muted natural palette, deliberate value grouping, strong silhouette separation, grounded production art, no modern elements, no UI, no text, no watermark
```

Use this as the common negative prompt.

```text
anime splash art, glossy skin, chibi proportions, photobash collage, noisy background clutter, extreme fisheye perspective, floating props, extra limbs, duplicate weapons, cropped feet, unreadable silhouette, tiny face, giant portrait closeup, abstract art, color smear, rainbow glitch, logo, watermark, text, frame, border
```

## Unit Master Batch Blocks

The unit master workflow generates three outputs per named unit:

- reference sheet
- head portrait
- battle atlas

### Reference Directive

```text
single named unit concept plate on a wide neutral backdrop, full body fully visible, character centered, practical grounded costume design, clear empty space around the silhouette, designed to anchor portrait and sprite-sheet derivation
```

### Portrait Directive

```text
single character head-and-shoulders portrait illustration, centered face and upper collar, clear facial features, plain neutral backdrop, slight three-quarter view, readable at 32x32, no hands or weapons crossing the face, no abstract shapes, no giant glowing effects hiding the face
```

### Atlas Directive

```text
sprite-source contact sheet for the same character, many small full-body action poses arranged cleanly on a flat neutral sheet, same costume and weapon in every pose, four world directions north east south west, readable idle move attack cast hit defeat motion, no labels, no grid numbers, no environment scene, no giant portrait, no abstract blocks
```

### Class Tone Blocks

- `vanguard`:
  `frontline vanguard silhouette, shield-first stance, practical armor layering, stable sword arm read`
- `ranger`:
  `field ranger silhouette, longbow read, travel leathers and cloak, agile grounded stance`
- `arcanist`:
  `battle arcanist silhouette, staff or focus-hand read, layered robes, controlled sigil glow`
- `warden`:
  `defensive warden silhouette, broad shield massing, heavy grounded posture, fortified material language`
- `skirmisher`:
  `mobile skirmisher silhouette, light armor, quick duelist posture, clean weapon read`
- `cleric`:
  `support cleric silhouette, ritual sash or charm, calm posture, readable support-caster profile`

### Named-Unit Identity Fragments

- `rowan`: veteran frontline knight in worn steel-blue surcoat over mail, heater shield, straight longsword
- `elira`: disciplined field archer in moss-green cloak, leather travel gear, yew longbow
- `sable`: allied duelist in smoked leather, dark scarf, quick curved blade
- `maelin`: allied battle mage in slate and ember-trimmed robes, brass focus rod
- `osric`: allied shield warden in tempered steel, broad tower shield, heavy mace
- `talia`: allied field cleric in linen and soft gold, prayer sash, ward charm, short staff
- `brigandCaptain`: enemy brigand captain in battered plate scraps, chipped shield, rough broadsword
- `huntmaster`: enemy huntmaster in dark green and fur-trimmed leathers, hunting bow
- `hexbinder`: hostile ember-sigil caster in charred burgundy and soot-black layered robes, hooked staff
- `shieldbearer`: enemy slab-armored shield brute with iron-rimmed wall shield and blunt mace
- `cutpurse`: enemy knife duelist in dark travel leathers with narrow scarf
- `fanatic`: enemy zealot in tattered ritual cloth with censer and hymn scroll
- `fordStalker`: enemy marsh ambusher in reed-green cloak with recurved bow
- `roadReaver`: enemy highway raider in patched leathers with hooked axe and looted belt gear

## Terrain Master Batch Blocks

The terrain master workflow emits final block and overlay candidates directly.

### Block Directive

```text
single isolated isometric terrain tile block, readable top diamond and short side face, centered composition on a plain backdrop, no surrounding map, no extra tiles, no abstract shapes
```

### Overlay Directive

```text
single isolated terrain overlay asset for one tactical tile, centered composition on a plain backdrop, readable when layered above a terrain block without hiding unit feet, no surrounding environment
```

### Terrain Family Fragments

- `grass`: olive turf, subtle damp tufts, low-contrast natural breakup
- `road`: packed dirt lane, cart-rut wear, clear travel-line readability
- `forest`: mossy woodland floor, brush clusters, negative space around the tile center
- `water`: dark impassable water, soft ripples, current lines
- `stone`: weathered flagstone or masonry slab, muted seam cracking
- `bridge`: weathered timber crossing, strong plank direction, edge trim
- `ruins`: fractured masonry ground, rubble scatter kept outside the occupied center

### Overlay Fragments

- `forest canopy`: sparse canopy and brush masses that do not bury unit feet
- `water ripple`: soft ring current accent
- `road rut`: subtle track wear and muddy edge breakup
- `bridge plank`: clearer plank seams and grain direction
- `ruins debris`: broken fragments and debris kept outside the center anchor

## VFX Master Batch Blocks

The VFX master workflow currently emits four primary sheets.

### Effect Sheet Directive

```text
single centered combat effect plate, clean silhouette, restrained particles, readable at gameplay scale, no environment scene, no character body, no abstract color smear
```

### Primary Cue Fragments

- `impact-flash / steel`: sharp steel-toned impact flash with restrained sparks
- `cast-burst / radiant`: radiant magical bloom with a clean layered halo
- `status-pulse / ward`: looping ward pulse ring with stable circular readability
- `projectile-burst / wind`: wind-toned projectile streak and centered impact flare

## Style Bible Lookdev Shots

These are retained for the optional debug workflow.

### 1. Grass Battlefield Mood

```text
moody medieval-fantasy tactical RPG battlefield, grassy isometric pass at dawn under cloud cover, painterly SRPG environment, readable tileable ground breakup, subtle height changes, controlled palette of olive, moss, slate, and worn gold, grounded composition for game asset lookdev
```

### 2. Road Battlefield Mood

```text
medieval mountain road through a glen pass, painterly tactical RPG environment, packed dirt road cutting through grass and stone, readable path language for strategy game terrain, muted browns and cool greens, soft atmospheric distance, built for later tile material extraction
```

### 3. Forest Battlefield Mood

```text
defensive forest edge in a medieval glen pass, painterly SRPG terrain lookdev, sparse canopy and brush clusters that stay readable from a tactical camera, mossy trunks, damp ground, cool green and charcoal palette, clear playable negative space
```

### 4. Bridge Battlefield Mood

```text
narrow wooden bridge over dark water in a medieval-fantasy pass, painterly strategy game terrain, readable plank direction, worn timber, cool mist, clear tactical crossing, dramatic but controlled values, built for later isometric tile extraction
```

### 5. Rowan Key Art

```text
Rowan, allied vanguard, frontline breaker, mature battlefield knight in worn steel-blue surcoat over mail, heater shield, straight longsword, practical medieval armor, calm disciplined expression, painterly tactical RPG character concept, full body near three-quarter view, feet visible, readable silhouette for later sprite conversion
```

### 6. Elira Key Art

```text
Elira, allied ranger, line archer, lean scout archer in moss-green cloak and leather layers, yew longbow, travel bracers, muted forest palette, focused but composed expression, painterly tactical RPG character concept, full body near three-quarter view, feet visible, readable silhouette for later sprite conversion
```

### 7. Hexbinder Key Art

```text
Hexbinder, enemy arcanist, battle mage, hostile ember-sigil caster in charred burgundy and soot-black layered robes, hooked staff, ember and radiant runic glow, severe expression, painterly tactical RPG character concept, full body near three-quarter view, feet visible, readable silhouette for later sprite conversion
```

### 8. Zoom Combat Mood A

```text
zoomed tactical RPG combat exchange, painterly SRPG presentation, two combatants enlarged from battlefield sprites, impact VFX and motion carrying the spectacle, information cards secondary, dramatic but readable framing, no portrait-card focus, no UI text
```

### 9. Zoom Combat Mood B

```text
medieval fantasy duel presentation for a tactical RPG, enlarged battlefield character art, strong hit reaction, cast burst, and directional motion, painterly but game-readable, compact stage framing, built for reusable combat presentation
```

## Direction Variant Template

This legacy template remains useful for manual spot-fixing or smaller exploratory runs.

```text
Use case: stylized-concept
Asset type: tactical RPG sprite source frame
Primary request: same character as the approved reference sheet, maintain face, palette, costume, weapon, and silhouette identity
Scene/background: plain neutral backdrop
Style/medium: painterly SRPG sprite-source render
Composition/framing: full figure inside square frame, feet fully visible, readable negative space around silhouette
Lighting/mood: same as the approved reference
Constraints: preserve identity; preserve costume palette; preserve weapon design; preserve proportions; preserve silhouette anchors
Avoid: costume drift, new accessories, extra weapons, cropped feet, off-model face, text, watermark
```

## Terrain Prompt Templates

These legacy prompts remain useful for smaller terrain experiments.

### Grass Material

```text
tileable painterly fantasy grass material for an isometric tactical RPG, muted olive and moss palette, subtle tufts, damp soil breakup, restrained value range, no flowers, no large landmarks, designed for later extraction into a readable game tile
```

### Road Material

```text
tileable medieval road material for a painterly tactical RPG, packed dirt with cart-rut wear, muted umber and cool gray, readable lane language, no large stones that would break tile reuse, designed for later isometric terrain assembly
```

### Forest Overlay

```text
forest brush and canopy overlay source for a painterly tactical RPG, readable brush masses, sparse leaf clusters, cool green and charcoal palette, enough negative space to avoid hiding unit feet, designed for later tactical tile overlay use
```

### Bridge Material

```text
weathered timber plank material for a narrow medieval bridge in a painterly tactical RPG, clear plank direction, iron fasteners, worn edge trim, damp wood tones, readable at small scale, designed for later isometric bridge tile assembly
```

## VFX Prompt Templates

These legacy prompts remain useful for smaller effect experiments.

### Impact Flash

```text
clean steel-toned impact flash for a painterly tactical RPG, circular burst with sharp center and restrained sparks, readable silhouette, centered composition, isolated effect plate, no background scene, no text, no watermark
```

### Cast Burst

```text
controlled magical cast burst for a painterly tactical RPG, radiant or ember energy bloom, centered composition, readable outer silhouette, isolated effect plate, no character, no background scene, no text, no watermark
```

### Status Pulse

```text
status pulse effect plate for a painterly tactical RPG, looping aura-style energy ring, readable at small scale, centered composition, restrained particles, isolated effect plate, no background scene, no text, no watermark
```

### Projectile Burst

```text
projectile impact or streak burst for a painterly tactical RPG, wind or radiant energy trail, centered impact read, clean silhouette, isolated effect plate, no character, no background scene, no text, no watermark
```
