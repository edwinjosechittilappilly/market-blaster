"""Subset OFL fonts from a pinned google/fonts revision for standalone SVGs."""
import base64
import io
from urllib.request import urlopen

from fontTools import subset
from fontTools.ttLib import TTFont

REV = "06bfe0d62a98375cb09c942fa18e68bd32cff057"
BASE = f"https://raw.githubusercontent.com/google/fonts/{REV}/ofl/"

def license_text(path):
    with urlopen(BASE + path + "/OFL.txt") as response:
        return response.read().decode("utf-8")


def font(path, text):
    with urlopen(BASE + path) as response:
        source = io.BytesIO(response.read())
    face = TTFont(source)
    options = subset.Options()
    options.flavor = "woff2"
    sub = subset.Subsetter(options=options)
    sub.populate(text=text)
    sub.subset(face)
    out = io.BytesIO()
    face.save(out)
    return base64.b64encode(out.getvalue()).decode()
