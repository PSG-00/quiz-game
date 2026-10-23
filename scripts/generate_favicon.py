import math
from PIL import Image, ImageDraw

def create_ox_favicon():
    S = 4
    SIZE = 512 * S
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # 1. Background Rounded Tile
    pad = 14 * S
    radius = 115 * S
    bg_box = [pad, pad, SIZE - pad, SIZE - pad]
    
    # Shadow under tile
    shadow_box = [pad, pad + 14 * S, SIZE - pad, SIZE - pad + 14 * S]
    draw.rounded_rectangle(shadow_box, radius=radius, fill=(54, 47, 61, 40))
    
    # Tile base (crisp warm white + soft border)
    draw.rounded_rectangle(bg_box, radius=radius, fill=(255, 253, 248, 255), outline=(225, 215, 200, 255), width=9 * S)

    # 2. Golden Crown on top of O/X center
    # Center x = 256 * S, y = 140 * S
    cx = 256 * S
    cy = 135 * S
    # 5-point crown polygon
    crown_pts = [
        (cx - 52 * S, cy + 20 * S),
        (cx - 60 * S, cy - 22 * S),
        (cx - 24 * S, cy + 2 * S),
        (cx, cy - 35 * S),
        (cx + 24 * S, cy + 2 * S),
        (cx + 60 * S, cy - 22 * S),
        (cx + 52 * S, cy + 20 * S),
    ]
    # Crown shadow
    crown_shadow = [(p[0], p[1] + 5 * S) for p in crown_pts]
    draw.polygon(crown_shadow, fill=(180, 83, 9, 60))
    draw.polygon(crown_pts, fill=(245, 158, 11, 255))
    # Crown jewels (dots on peaks)
    for px, py in [(cx - 60 * S, cy - 22 * S), (cx, cy - 35 * S), (cx + 60 * S, cy - 22 * S)]:
        draw.ellipse([px - 6 * S, py - 6 * S, px + 6 * S, py + 6 * S], fill=(254, 240, 138, 255))

    # 3. Left Symbol: Emerald Green "O"
    ox = 168 * S
    oy = 280 * S
    orad = 90 * S
    owidth = 44 * S
    
    # Subtle drop shadow for O
    draw.ellipse([ox - orad, oy - orad + 8 * S, ox + orad, oy + orad + 8 * S], outline=(5, 150, 105, 55), width=owidth)
    # Main O (#10b981 emerald green)
    draw.ellipse([ox - orad, oy - orad, ox + orad, oy + orad], outline=(16, 185, 129, 255), width=owidth)
    # Inner subtle highlight ring
    draw.ellipse([ox - orad + 4 * S, oy - orad + 4 * S, ox + orad - 4 * S, oy + orad - 4 * S], outline=(52, 211, 153, 120), width=6 * S)

    # 4. Right Symbol: Coral Red "X"
    xx = 344 * S
    xy = 280 * S
    xarm = 68 * S
    xwidth = 44 * S
    r = xwidth // 2

    # Shadow for X
    draw.line([(xx - xarm, xy - xarm + 8 * S), (xx + xarm, xy + xarm + 8 * S)], fill=(220, 38, 38, 55), width=xwidth)
    draw.line([(xx - xarm, xy + xarm + 8 * S), (xx + xarm, xy - xarm + 8 * S)], fill=(220, 38, 38, 55), width=xwidth)
    for pt in [(xx - xarm, xy - xarm + 8 * S), (xx + xarm, xy + xarm + 8 * S), (xx - xarm, xy + xarm + 8 * S), (xx + xarm, xy - xarm + 8 * S)]:
        draw.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=(220, 38, 38, 55))

    # Main X (#ef4444 red)
    draw.line([(xx - xarm, xy - xarm), (xx + xarm, xy + xarm)], fill=(239, 68, 68, 255), width=xwidth)
    draw.line([(xx - xarm, xy + xarm), (xx + xarm, xy - xarm)], fill=(239, 68, 68, 255), width=xwidth)
    for pt in [(xx - xarm, xy - xarm), (xx + xarm, xy + xarm), (xx - xarm, xy + xarm), (xx + xarm, xy - xarm)]:
        draw.ellipse([pt[0] - r, pt[1] - r, pt[0] + r, pt[1] + r], fill=(239, 68, 68, 255))

    # Downsample
    img_512 = img.resize((512, 512), Image.Resampling.LANCZOS)
    img_192 = img.resize((192, 192), Image.Resampling.LANCZOS)
    img_64 = img.resize((64, 64), Image.Resampling.LANCZOS)
    img_32 = img.resize((32, 32), Image.Resampling.LANCZOS)
    img_16 = img.resize((16, 16), Image.Resampling.LANCZOS)

    # Save PNGs in client directory
    img_512.save("client/icons/icon-512.png", "PNG")
    img_192.save("client/icons/icon-192.png", "PNG")
    img_512.save("client/favicon.png", "PNG")
    img_64.save("client/favicon-64.png", "PNG")
    img_32.save("client/favicon-32.png", "PNG")

    # Save multi-size ICO
    img_512.save("client/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])

    # Copy to brain artifact for preview
    img_512.save(r"C:\Users\psg00\.gemini\antigravity\brain\d33c18d7-f735-4497-9edf-89def8f14b32\quiz_favicon_preview.png", "PNG")

    print("Updated Favicon with crown generated!")

if __name__ == "__main__":
    create_ox_favicon()
