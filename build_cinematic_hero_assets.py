import os
import math
import random
from PIL import Image, ImageEnhance, ImageFilter, ImageDraw

brain_dir = r"C:\Users\PC\.gemini\antigravity-ide\brain\ccc26f53-0207-49f6-bd54-594a0abd31ed"
assets_dir = r"c:\Users\PC\Desktop\mushbio\assets"

island_path = os.path.join(brain_dir, "floating_mushroom_island_1787827014989.jpg")
basket_path = os.path.join(brain_dir, "mushroom_basket_1787826600008.jpg")
oyster_path = os.path.join(brain_dir, "oyster_isolated_1787827038229.jpg")

print("Generating high-resolution photographic scene layers for 3D cinematic scroll...")

# 1. UNDERGROUND DARK SOIL LAYER (1920x1080)
# Deep rich peat, moist earth tones (#14190e / #1a1610), organic root hairs
w, h = 1920, 1080
soil_img = Image.new("RGB", (w, h), (18, 22, 14))
draw = ImageDraw.Draw(soil_img)

# Generate rich natural soil gradients and fine root filaments
for _ in range(800):
    x = random.randint(0, w)
    y = random.randint(0, h)
    rad = random.randint(30, 180)
    shade = random.randint(12, 28)
    draw.ellipse((x - rad, y - rad, x + rad, y + rad), fill=(shade + 5, shade + 8, shade))

# Draw organic natural root filaments (warm wood & tan tones)
for _ in range(45):
    cur_x = random.randint(100, w - 100)
    cur_y = random.randint(0, h // 3)
    points = [(cur_x, cur_y)]
    for _ in range(random.randint(6, 14)):
        cur_x += random.randint(-40, 40)
        cur_y += random.randint(30, 90)
        points.append((cur_x, cur_y))
    for i in range(len(points) - 1):
        draw.line([points[i], points[i+1]], fill=(75, 60, 40), width=random.randint(2, 4))
        # Fine rootlets
        if random.random() > 0.4:
            draw.line([points[i], (points[i][0] + random.randint(-25, 25), points[i][1] + random.randint(10, 30))], fill=(95, 80, 55), width=1)

soil_img = soil_img.filter(ImageFilter.GaussianBlur(1.5))
soil_img.save(os.path.join(assets_dir, "hero-soil.jpg"), quality=95)
print("Saved hero-soil.jpg")

# 2. MYCELIUM NETWORK (Delicate cream/pale-gold fungal hyphae web spreading in dark earth)
myc_img = soil_img.copy()
draw_m = ImageDraw.Draw(myc_img)

# Draw branching mycelium network
def draw_branch(d, x, y, angle, length, depth):
    if depth <= 0 or length < 5:
        return
    rad = math.radians(angle)
    x2 = x + length * math.cos(rad)
    y2 = y + length * math.sin(rad)
    # Warm cream / soft gold color with depth fading
    alpha = max(140, 255 - (5 - depth) * 25)
    color = (225, 218, 185) if depth > 2 else (195, 210, 160)
    d.line([(x, y), (x2, y2)], fill=color, width=max(1, depth // 2))
    
    # Branching
    draw_branch(d, x2, y2, angle + random.randint(15, 35), length * 0.75, depth - 1)
    draw_branch(d, x2, y2, angle - random.randint(15, 35), length * 0.75, depth - 1)

for start_x in [300, 700, 1100, 1500, 950]:
    start_y = random.randint(300, 700)
    for a in range(0, 360, 45):
        draw_branch(draw_m, start_x, start_y, a + random.randint(-15, 15), 60, 5)

myc_img = myc_img.filter(ImageFilter.GaussianBlur(0.8))
myc_img.save(os.path.join(assets_dir, "hero-mycelium.jpg"), quality=95)
print("Saved hero-mycelium.jpg")

# 3. EMERGING MUSHROOMS IN SOIL (Photographic blend from high-res island)
if os.path.exists(island_path):
    island = Image.open(island_path).convert("RGBA")
    # Resize island to fit beautifully in 1920x1080 stage
    stage_img = Image.new("RGBA", (1920, 1080), (250, 247, 238, 255))
    island_resized = island.resize((1200, int(1200 * island.size[1] / island.size[0])), Image.Resampling.LANCZOS)
    
    # Paste centered
    offset_x = (1920 - island_resized.size[0]) // 2 + 200
    offset_y = (1080 - island_resized.size[1]) // 2
    stage_img.paste(island_resized, (offset_x, offset_y), island_resized if island_resized.mode == "RGBA" else None)
    
    # Save as pristine JPG
    stage_img.convert("RGB").save(os.path.join(assets_dir, "hero-emerged-stage.jpg"), quality=95)
    print("Saved hero-emerged-stage.jpg")

# 4. FOREST CANOPY SUNLIGHT BACKGROUND
forest_bg = Image.new("RGB", (1920, 1080), (242, 237, 224))
draw_f = ImageDraw.Draw(forest_bg)
# Soft warm sunlight gradients
for r in range(500, 0, -20):
    alpha = int(255 * (1 - r / 500))
    draw_f.ellipse((1920 * 0.7 - r, 1080 * 0.35 - r, 1920 * 0.7 + r, 1080 * 0.35 + r), fill=(255, 250, 230))
forest_bg = forest_bg.filter(ImageFilter.GaussianBlur(30))
forest_bg.save(os.path.join(assets_dir, "hero-forest-bg.jpg"), quality=95)
print("Saved hero-forest-bg.jpg")

print("All cinematic scene assets generated successfully!")
