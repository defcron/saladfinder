"""MIT: reproduce path-only SVG brand assets with Pillow 11.3.0/vtracer 0.6.15.

Run from the repository root using a Python environment with those packages.
PNG originals are preserved; intermediate files live in ignored .local/.
"""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageFilter
import vtracer

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / "public/brand"
TMP = ROOT / ".local/brand-vectors"
TMP.mkdir(parents=True, exist_ok=True)
NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", NS)

for stem, label in [
    ("saladfinder-logo-v1", "SaladFinder horizontal logo"),
    ("saladfinder-logo-square-v1", "SaladFinder square logo"),
    ("saladfinder-banner-v1", "SaladFinder neighbourhood work banner"),
]:
    source = Image.open(BRAND / f"{stem}.png").convert("RGBA")
    width, height = source.size
    banner = "banner" in stem
    if banner:
        # Remove fine generated texture without erasing the illustration.
        prepared = source.convert("RGB").filter(ImageFilter.MedianFilter(3))
        # Keep brand lettering flat instead of tracing its generated shading.
        pixels = prepared.load()
        for y in range(150, min(550, height)):
            for x in range(min(880, width)):
                r, g, b = pixels[x, y]
                if r < 110 and g < 145 and b < 120:
                    pixels[x, y] = (23, 62, 50)
                elif r > 120 and g > 160 and b < 170:
                    pixels[x, y] = (213, 237, 131)
        prepared = prepared.quantize(colors=128, method=Image.Quantize.MEDIANCUT).convert("RGBA")
    else:
        # Enforce the specified two-colour identity and remove faint alpha noise.
        pixels = []
        for r, g, b, a in source.getdata():
            if a < 180:
                pixels.append((0, 0, 0, 0))
            elif r + g + b > 350:
                pixels.append((213, 237, 131, 255))
            else:
                pixels.append((23, 62, 50, 255))
        prepared = Image.new("RGBA", source.size)
        prepared.putdata(pixels)
        prepared = prepared.filter(ImageFilter.MedianFilter(3))
    intermediate = TMP / f"{stem}.png"
    prepared.save(intermediate)
    output = BRAND / f"{stem}.svg"
    vtracer.convert_image_to_svg_py(
        str(intermediate), str(output), colormode="color",
        hierarchical="stacked", mode="spline", filter_speckle=2 if banner else 30,
        color_precision=8, layer_difference=4 if banner else 1,
        corner_threshold=60, length_threshold=3 if banner else 4,
        max_iterations=10, splice_threshold=45, path_precision=2,
    )
    tree = ET.parse(output)
    svg = tree.getroot()
    svg.set("viewBox", f"0 0 {width} {height}")
    svg.set("role", "img")
    svg.set("aria-label", label)
    title = ET.Element(f"{{{NS}}}title")
    title.text = label
    svg.insert(0, title)
    desc = ET.Element(f"{{{NS}}}desc")
    desc.text = ("Vectorized from the generated PNG artwork; editable outlined paths, "
                 "no embedded raster images or font dependencies. Project license: MIT.")
    svg.insert(1, desc)
    tree.write(output, encoding="utf-8", xml_declaration=True)
    paths = list(svg.iter(f"{{{NS}}}path"))
    assert paths and not list(svg.iter(f"{{{NS}}}image"))
    print(f"{output.name}: {width}x{height}, {len(paths)} paths, {output.stat().st_size:,} bytes")
