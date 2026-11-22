#!/usr/bin/env python3
"""Generate the standalone banner: uv run --with fonttools --with brotli python scripts/brand/banner.py."""
from pathlib import Path
from fonts import font, license_text

ROOT = Path(__file__).resolve().parents[2]

name = "Market Blaster"
tag = "Ship a feature. Announce it where developers read."
cmd = "$ mblast new my-feature --range v1.2.0..HEAD"
features = ["Grounded in your change", "You approve every draft", "API publishing + handoffs", "No browser automation", "Credentials in Keychain"]
label = f"{name}. {tag} {cmd}. " + "; ".join(features) + "."
from html import escape
style = f'''@font-face{{font-family:SpaceGrotesk;src:url(data:font/woff2;base64,{font('spacegrotesk/SpaceGrotesk%5Bwght%5D.ttf', name)}) format('woff2');font-weight:100 900}}
@font-face{{font-family:PlexSans;src:url(data:font/woff2;base64,{font('ibmplexsans/IBMPlexSans%5Bwdth,wght%5D.ttf', tag + ''.join(features))}) format('woff2');font-weight:100 900}}
@font-face{{font-family:PlexMono;src:url(data:font/woff2;base64,{font('ibmplexmono/IBMPlexMono-Regular.ttf', cmd)}) format('woff2')}}'''
rows = ''.join(f'<path d="M805 {y-7} l5 5 10 -11" fill="none" stroke="#FF765C" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><text x="834" y="{y}" class="feature">{escape(value)}</text>' for y, value in zip(range(130, 331, 48), features))
licenses = '\n\n'.join(license_text(family) for family in ('spacegrotesk', 'ibmplexsans', 'ibmplexmono'))
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="420" viewBox="0 0 1280 420" role="img" aria-label="{escape(label, quote=True)}">
<metadata>{escape(licenses)}</metadata>
<style>{style}
.mark{{font:700 78px SpaceGrotesk,sans-serif;letter-spacing:-2px;fill:#F9F4F0}}
.tag{{font:400 24px PlexSans,sans-serif;fill:#E9E5E5}}
.cmd{{font:400 16px PlexMono,monospace;fill:#F9F4F0}}
.feature{{font:500 20px PlexSans,sans-serif;fill:#F9F4F0}}</style>
<rect width="1280" height="420" fill="#101120"/>
<g fill="none" stroke="#62D2CA" opacity=".16"><circle cx="1240" cy="402" r="116"/><circle cx="1240" cy="402" r="160"/><circle cx="1240" cy="402" r="204"/></g>
<circle cx="1240" cy="402" r="4" fill="#62D2CA"/>
<rect x="66" y="70" width="42" height="5" rx="2.5" fill="#FF765C"/>
<text x="64" y="160" class="mark">{escape(name)}</text>
<text x="68" y="212" class="tag">{escape(tag)}</text>
<rect x="68" y="257" width="556" height="50" rx="7" fill="#1B1C30" stroke="#454053"/>
<text x="86" y="288" class="cmd">{escape(cmd)}</text>
<line x1="760" y1="88" x2="760" y2="332" stroke="#454053"/>
{rows}
</svg>'''
(ROOT / 'docs/assets/banner.svg').write_text(svg + '\n')
