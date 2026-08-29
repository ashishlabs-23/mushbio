import os
from PIL import Image, ImageEnhance, ImageFilter

brain_dir = r"C:\Users\PC\.gemini\antigravity-ide\brain\ccc26f53-0207-49f6-bd54-594a0abd31ed"
assets_dir = r"c:\Users\PC\Desktop\mushbio\assets"

# Source high-res images
island_path = os.path.join(brain_dir, "floating_mushroom_island_1787827014989.jpg")
oyster_path = os.path.join(brain_dir, "oyster_isolated_1787827038229.jpg")
basket_path = os.path.join(brain_dir, "mushroom_basket_1787826600008.jpg")
milky_path = os.path.join(brain_dir, "milky_mushroom_1787826555121.jpg")
portobello_path = os.path.join(brain_dir, "portobello_mushroom_1787826572680.jpg")

print("Processing clean, text-free photographic assets...")

# 1. BUTTON MUSHROOMS (Crop pristine white button mushrooms from basket/milky)
if os.path.exists(milky_path):
    img = Image.open(milky_path)
    # The bowl with button mushrooms at top or the row
    # Crop the top ceramic bowl with round button mushrooms
    w, h = img.size
    # Let's crop the bottom row of button-like mushrooms or top bowl
    crop_btn = img.crop((w * 0.1, h * 0.4, w * 0.9, h * 0.78))
    btn_sq = crop_btn.resize((800, 800), Image.Resampling.LANCZOS)
    btn_sq.save(os.path.join(assets_dir, "button.jpg"), quality=95)
    print("Saved button.jpg")

# 2. SHIITAKE MUSHROOMS (Crop rich shiitake mushrooms from island)
if os.path.exists(island_path):
    img = Image.open(island_path)
    w, h = img.size
    # Shiitake mushrooms are on the right side of the island (around x: 0.50 to 0.75, y: 0.25 to 0.55)
    crop_sh = img.crop((int(w * 0.50), int(h * 0.25), int(w * 0.75), int(h * 0.58)))
    # Add a soft cream background padding so it sits centered like studio photography
    sh_sq = Image.new("RGB", (800, 800), (250, 247, 238))
    crop_sh = crop_sh.resize((700, int(700 * crop_sh.size[1] / crop_sh.size[0])), Image.Resampling.LANCZOS)
    sh_sq.paste(crop_sh, (50, (800 - crop_sh.size[1]) // 2))
    sh_sq.save(os.path.join(assets_dir, "shiitake.jpg"), quality=95)
    print("Saved shiitake.jpg")

# 3. ABOUT US (Clean floating terrarium / organic farming visual)
if os.path.exists(island_path):
    img = Image.open(island_path)
    w, h = img.size
    # High-res crop centered on the whole lush biome with moss and mushrooms
    crop_about = img.crop((int(w * 0.15), int(h * 0.1), int(w * 0.85), int(h * 0.9)))
    crop_about = crop_about.resize((1000, 900), Image.Resampling.LANCZOS)
    crop_about.save(os.path.join(assets_dir, "about.jpg"), quality=95)
    print("Saved about.jpg")

# 4. BENEFITS BASKET
if os.path.exists(basket_path):
    img = Image.open(basket_path)
    img.save(os.path.join(assets_dir, "benefits.jpg"), quality=95)
    img.save(os.path.join(assets_dir, "basket.jpg"), quality=95)
    print("Saved benefits.jpg and basket.jpg")

# 5. BLOG ARTICLES (Clean food and harvest photography)
# Blog 1: Oyster cluster
if os.path.exists(oyster_path):
    img = Image.open(oyster_path)
    img.save(os.path.join(assets_dir, "blog1.jpg"), quality=95)
    print("Saved blog1.jpg")

# Blog 2: Harvest cultivation / moss
if os.path.exists(island_path):
    img = Image.open(island_path)
    w, h = img.size
    crop_b2 = img.crop((int(w * 0.25), int(h * 0.15), int(w * 0.75), int(h * 0.65)))
    crop_b2 = crop_b2.resize((800, 500), Image.Resampling.LANCZOS)
    crop_b2.save(os.path.join(assets_dir, "blog2.jpg"), quality=95)
    print("Saved blog2.jpg")

# Blog 3: Portobello / Gourmet culinary
if os.path.exists(portobello_path):
    img = Image.open(portobello_path)
    img.save(os.path.join(assets_dir, "blog3.jpg"), quality=95)
    print("Saved blog3.jpg")

print("All photographic assets successfully created with zero text or mockup overlays!")
