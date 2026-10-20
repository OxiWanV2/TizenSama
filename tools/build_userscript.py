import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HEADER = """// ==UserScript==
// @name         TizenSama agent
// @namespace    tizensama
// @version      1.4.3
// @description  Injecte l'agent TizenSama dans les iframes des lecteurs, comme TizenBrew sur la TV
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

"""

with open(os.path.join(ROOT, 'app', 'agent.js'), encoding='utf-8') as f:
    agent = f.read()
out = os.path.join(ROOT, 'tools', 'agent.user.js')
with open(out, 'w', encoding='utf-8') as f:
    f.write(HEADER + agent)
print(out)
