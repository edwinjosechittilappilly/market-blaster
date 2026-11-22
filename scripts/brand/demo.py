#!/usr/bin/env python3
"""Render the recorded CLI session; run with uv run --with fonttools --with brotli python scripts/brand/demo.py."""
from html import escape
from pathlib import Path
from fonts import font, license_text

ROOT = Path(__file__).resolve().parents[2]
lines = (ROOT / 'scripts/brand/demo-transcript.txt').read_text().splitlines()
# Only truncate the payload; the complete line remains in the transcript.
shown = [line[:112] + '…' if ' payload: ' in line and len(line) > 113 else line for line in lines]
face = font('ibmplexmono/IBMPlexMono-Regular.ttf', ''.join(shown) + 'Terminal · dry run')
height = 88 + len(shown) * 26 + 30
rows = '\n'.join(f'<text x="30" y="{88 + i * 26}" fill="{ "#FF917B" if line.startswith("$") else "#E9E5E5" }">{escape(line)}</text>' for i, line in enumerate(shown))
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="{height}" viewBox="0 0 1280 {height}" role="img" aria-label="A recorded mblast session creates and checks a demo campaign, approves its DEV draft, and previews an API publish without sending it.">
<metadata>{escape(license_text('ibmplexmono'))}</metadata>
<style>@font-face{{font-family:PlexMono;src:url(data:font/woff2;base64,{face}) format('woff2')}} text{{font:15px PlexMono,monospace;white-space:pre}}</style>
<rect width="1280" height="{height}" rx="12" fill="#101120"/>
<path d="M12 0h1256a12 12 0 0 1 12 12v38H0V12A12 12 0 0 1 12 0" fill="#202135"/>
<circle cx="26" cy="25" r="5" fill="#FF765C"/><circle cx="44" cy="25" r="5" fill="#E5BC6A"/><circle cx="62" cy="25" r="5" fill="#62D2CA"/>
<text x="90" y="30" fill="#C7CAD2">Terminal · dry run</text>
{rows}
</svg>'''
(ROOT / 'docs/assets/demo.svg').write_text(svg + '\n')
