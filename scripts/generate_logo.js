import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Resvg } = require('B:/workgit/node_modules/@resvg/resvg-js');

export function buildRouteReplyLogoSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <defs>
    <clipPath id="squircle-clip">
      <rect x="24" y="24" width="976" height="976" rx="220" />
    </clipPath>

    <!-- Electric Cyan Telemetry Gradients -->
    <linearGradient id="cyan-glow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#00f5ff"/>
      <stop offset="100%" stop-color="#0284c7"/>
    </linearGradient>

    <!-- Warm Amber Raptor Beak Gradient (High-Contrast Luxury Accent) -->
    <linearGradient id="beak-lit" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#fef08a"/>
      <stop offset="35%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#d97706"/>
    </linearGradient>

    <linearGradient id="beak-shadow" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#f59e0b"/>
      <stop offset="60%" stop-color="#b45309"/>
      <stop offset="100%" stop-color="#78350f"/>
    </linearGradient>

    <!-- Obsidian & Titanium Metallic Facet Shading Hierarchy -->
    <linearGradient id="f-hi" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#94a3b8"/>
      <stop offset="100%" stop-color="#64748b"/>
    </linearGradient>

    <linearGradient id="f-bright" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#64748b"/>
      <stop offset="100%" stop-color="#475569"/>
    </linearGradient>

    <linearGradient id="f-lit" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#475569"/>
      <stop offset="100%" stop-color="#334155"/>
    </linearGradient>

    <linearGradient id="f-mid" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>

    <linearGradient id="f-dark" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>

    <linearGradient id="f-deep" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#080c14"/>
    </linearGradient>

    <!-- Drop Shadow for Subtle Depth -->
    <filter id="subtle-shadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#0b0f19" flood-opacity="0.16" />
    </filter>
  </defs>

  <!-- Luxury White Squircle Container -->
  <rect x="24" y="24" width="976" height="976" rx="220" fill="#ffffff" stroke="#e2e8f0" stroke-width="6" />

  <g clip-path="url(#squircle-clip)">
    <g transform="translate(512, 512)" filter="url(#subtle-shadow)">

      <!-- Outer Hexagonal Architectural Gateway Frame -->
      <polygon points="
        0,-400
        346,-200
        346,200
        0,400
        -346,200
        -346,-200
      " fill="none" stroke="#0f172a" stroke-width="36" stroke-linejoin="round" />

      <!-- Inner Dashed Telemetry Hexagon -->
      <polygon points="
        0,-365
        316,-182
        316,182
        0,365
        -316,182
        -316,-182
      " fill="none" stroke="#00f5ff" stroke-width="4" opacity="0.38" stroke-dasharray="16, 12" />

      <!-- Gateway Telemetry Precision Nodes -->
      <circle cx="0" cy="-400" r="12" fill="#00f5ff" />
      <circle cx="346" cy="-200" r="10" fill="#0f172a" stroke="#00f5ff" stroke-width="3" />
      <circle cx="346" cy="200" r="10" fill="#0f172a" stroke="#00f5ff" stroke-width="3" />
      <circle cx="0" cy="400" r="12" fill="#00f5ff" />
      <circle cx="-346" cy="200" r="10" fill="#0f172a" stroke="#00f5ff" stroke-width="3" />
      <circle cx="-346" cy="-200" r="10" fill="#0f172a" stroke="#00f5ff" stroke-width="3" />

      <!-- ========================================================= -->
      <!-- THE PEREGRINE ROUTE FALCON (WORK ROUTE & HUMAN DISPATCH) -->
      <!-- ========================================================= -->

      <!-- 1. 100% Watertight Solid Silhouette Base (Zero-Leak Rule) -->
      <polygon points="
        0,-335
        75,-295
        140,-345
        125,-205
        235,-115
        275,35
        215,195
        125,290
        0,355
        -125,290
        -215,195
        -275,35
        -235,-115
        -125,-205
        -140,-345
        -75,-295
      " fill="#080d16" stroke="#080d16" stroke-width="4" stroke-linejoin="round" />

      <!-- ================= 2. CROWN & OCCIPITAL CREST ================= -->
      <!-- Center Crown Keel -->
      <polygon points="0,-335 48,-255 0,-225" fill="url(#f-hi)" />
      <polygon points="0,-335 -48,-255 0,-225" fill="url(#f-bright)" />

      <!-- Crown Lateral Crest Facets -->
      <polygon points="0,-335 75,-295 48,-255" fill="url(#f-bright)" />
      <polygon points="0,-335 -75,-295 -48,-255" fill="url(#f-lit)" />

      <!-- Aerodynamic Swept-Back Crest Wings (Falcon Feathers) -->
      <polygon points="75,-295 140,-345 125,-205 48,-255" fill="url(#f-hi)" />
      <polygon points="-75,-295 -140,-345 -125,-205 -48,-255" fill="url(#f-lit)" />

      <!-- Upper Forehead Shield -->
      <polygon points="0,-225 48,-255 62,-175 0,-190" fill="url(#f-bright)" />
      <polygon points="0,-225 -48,-255 -62,-175 0,-190" fill="url(#f-lit)" />

      <!-- Supraorbital Brow Ridge (Fierce Raptor Slant) -->
      <polygon points="0,-190 62,-175 105,-135 42,-135" fill="url(#f-hi)" />
      <polygon points="0,-190 -62,-175 -105,-135 -42,-135" fill="url(#f-mid)" />

      <!-- ================= 3. PREDATOR RAPTOR OPTICS (HIGH-PERCEPTION EYES) ================= -->
      <!-- Left Eye Dark Recessed Socket -->
      <polygon points="-42,-135 -105,-135 -72,-95" fill="#050811" stroke="#00f5ff" stroke-width="2" stroke-linejoin="round" />
      <!-- Left Glowing Cyan Iris -->
      <polygon points="-48,-130 -96,-130 -70,-102" fill="url(#cyan-glow)" />
      <!-- Left Slit Pupil -->
      <polygon points="-70,-126 -74,-116 -66,-110" fill="#040812" />
      <circle cx="-80" cy="-122" r="3.5" fill="#ffffff" />

      <!-- Right Eye Dark Recessed Socket -->
      <polygon points="42,-135 105,-135 72,-95" fill="#050811" stroke="#00f5ff" stroke-width="2" stroke-linejoin="round" />
      <!-- Right Glowing Cyan Iris -->
      <polygon points="48,-130 96,-130 70,-102" fill="url(#cyan-glow)" />
      <!-- Right Slit Pupil -->
      <polygon points="70,-126 74,-116 66,-110" fill="#040812" />
      <circle cx="80" cy="-122" r="3.5" fill="#ffffff" />

      <!-- ================= 4. SNOUT BRIDGE & AMBER GOLDEN BEAK ================= -->
      <!-- Culmen (Nasal Bridge) -->
      <polygon points="0,-190 42,-135 0,-75" fill="url(#f-hi)" />
      <polygon points="0,-190 -42,-135 0,-75" fill="url(#f-bright)" />

      <polygon points="42,-135 30,-35 0,-75" fill="url(#f-bright)" />
      <polygon points="-42,-135 -30,-35 0,-75" fill="url(#f-lit)" />

      <!-- Hooked Amber Gold Raptor Beak -->
      <polygon points="0,-75 30,-35 0,45" fill="url(#beak-lit)" stroke="#0f172a" stroke-width="1.5" />
      <polygon points="0,-75 -30,-35 0,45" fill="url(#beak-shadow)" stroke="#0f172a" stroke-width="1.5" />
      <line x1="0" y1="-75" x2="0" y2="45" stroke="#78350f" stroke-width="2" />

      <!-- ================= 5. CHEEK MALAR FEATHERS (SIGNATURE FALCON HOOD) ================= -->
      <!-- Inner Cheeks -->
      <polygon points="42,-135 72,-95 30,-35" fill="url(#f-hi)" />
      <polygon points="-42,-135 -72,-95 -30,-35" fill="url(#f-lit)" />

      <polygon points="72,-95 62,-15 30,-35" fill="url(#f-bright)" />
      <polygon points="-72,-95 -62,-15 -30,-35" fill="url(#f-mid)" />

      <!-- Outer Cheeks & Malar Stripe -->
      <polygon points="105,-135 125,-65 72,-95" fill="url(#f-bright)" />
      <polygon points="-105,-135 -125,-65 -72,-95" fill="url(#f-dark)" />

      <polygon points="72,-95 125,-65 62,-15" fill="url(#f-lit)" />
      <polygon points="-72,-95 -125,-65 -62,-15" fill="url(#f-mid)" />

      <!-- Cheek Base Flares -->
      <polygon points="125,-65 95,25 62,-15" fill="url(#f-bright)" />
      <polygon points="-125,-65 -95,25 -62,-15" fill="url(#f-dark)" />

      <!-- ================= 6. THROAT & CHIN GORGET ================= -->
      <polygon points="0,45 30,-35 62,-15" fill="url(#f-hi)" />
      <polygon points="0,45 -30,-35 -62,-15" fill="url(#f-lit)" />

      <polygon points="0,45 62,-15 48,65" fill="url(#f-bright)" />
      <polygon points="0,45 -62,-15 -48,65" fill="url(#f-mid)" />

      <polygon points="0,45 48,65 0,95" fill="url(#f-hi)" />
      <polygon points="0,45 -48,65 0,95" fill="url(#f-lit)" />

      <!-- Throat Flanks -->
      <polygon points="62,-15 95,25 48,65" fill="url(#f-lit)" />
      <polygon points="-62,-15 -95,25 -48,65" fill="url(#f-dark)" />

      <polygon points="95,25 105,85 48,65" fill="url(#f-bright)" />
      <polygon points="-95,25 -105,85 -48,65" fill="url(#f-mid)" />

      <!-- ================= 7. PECTORAL COLLAR & ROUTE MOUNT ================= -->
      <polygon points="0,95 48,65 58,155 0,185" fill="url(#f-hi)" />
      <polygon points="0,95 -48,65 -58,155 0,185" fill="url(#f-lit)" />

      <polygon points="48,65 105,85 58,155" fill="url(#f-bright)" />
      <polygon points="-48,65 -105,85 -58,155" fill="url(#f-dark)" />

      <polygon points="105,85 115,115 58,155" fill="url(#f-lit)" />
      <polygon points="-105,85 -115,115 -58,155" fill="url(#f-mid)" />

      <!-- ================= 8. SWEPT FALCON WINGS (DAG EXECUTION NODES) ================= -->
      <!-- Right Wing Top & Primaries -->
      <polygon points="125,-205 235,-115 175,-55 105,-135" fill="url(#f-hi)" />
      <polygon points="105,-135 175,-55 125,-65" fill="url(#f-bright)" />
      <polygon points="235,-115 275,35 175,-55" fill="url(#f-bright)" />
      <polygon points="175,-55 275,35 195,45" fill="url(#f-lit)" />
      <polygon points="175,-55 195,45 95,25" fill="url(#f-bright)" />
      <polygon points="175,-55 95,25 125,-65" fill="url(#f-lit)" />

      <polygon points="195,45 275,35 215,195" fill="url(#f-lit)" />
      <polygon points="195,45 215,195 155,135" fill="url(#f-bright)" />
      <polygon points="195,45 155,135 115,115" fill="url(#f-lit)" />
      <polygon points="195,45 115,115 95,25" fill="url(#f-mid)" />

      <polygon points="155,135 215,195 125,290" fill="url(#f-mid)" />
      <polygon points="155,135 125,290 105,195" fill="url(#f-bright)" />
      <polygon points="155,135 105,195 58,155" fill="url(#f-lit)" />
      <polygon points="155,135 58,155 115,115" fill="url(#f-bright)" />

      <!-- Left Wing Top & Primaries (Volumetric Shadow Modulation) -->
      <polygon points="-125,-205 -235,-115 -175,-55 -105,-135" fill="url(#f-lit)" />
      <polygon points="-105,-135 -175,-55 -125,-65" fill="url(#f-mid)" />
      <polygon points="-235,-115 -275,35 -175,-55" fill="url(#f-mid)" />
      <polygon points="-175,-55 -275,35 -195,45" fill="url(#f-dark)" />
      <polygon points="-175,-55 -195,45 -95,25" fill="url(#f-lit)" />
      <polygon points="-175,-55 -95,25 -125,-65" fill="url(#f-mid)" />

      <polygon points="-195,45 -275,35 -215,195" fill="url(#f-dark)" />
      <polygon points="-195,45 -215,195 -155,135" fill="url(#f-mid)" />
      <polygon points="-195,45 -155,135 -115,115" fill="url(#f-dark)" />
      <polygon points="-195,45 -115,115 -95,25" fill="url(#f-mid)" />

      <polygon points="-155,135 -215,195 -125,290" fill="url(#f-deep)" />
      <polygon points="-155,135 -125,290 -105,195" fill="url(#f-mid)" />
      <polygon points="-155,135 -105,195 -58,155" fill="url(#f-dark)" />
      <polygon points="-155,135 -58,155 -115,115" fill="url(#f-mid)" />

      <!-- ================= 9. ROUTE TELEMETRY REACTOR CORE (DISPATCH GATE) ================= -->
      <!-- Outer Hexagonal Housing -->
      <polygon points="
        0,185
        48,210
        48,270
        0,295
        -48,270
        -48,210
      " fill="#070a12" stroke="#00f5ff" stroke-width="4" stroke-linejoin="round" />

      <!-- Glowing Cyan Route Core -->
      <polygon points="
        0,197
        36,217
        36,263
        0,283
        -36,263
        -36,217
      " fill="url(#cyan-glow)" />

      <!-- Amber Telegram Waypoint Node Center -->
      <circle cx="0" cy="240" r="11" fill="url(#beak-lit)" stroke="#070a12" stroke-width="2" />

      <!-- Route Vectors Diverging to Operators (DAG Flow) -->
      <line x1="0" y1="240" x2="-26" y2="240" stroke="#070a12" stroke-width="2.5" />
      <line x1="0" y1="240" x2="26" y2="240" stroke="#070a12" stroke-width="2.5" />
      <circle cx="-26" cy="240" r="2.5" fill="#ffffff" />
      <circle cx="26" cy="240" r="2.5" fill="#ffffff" />

      <!-- ================= 10. ABDOMINAL KEEL & TAIL SPIRE ================= -->
      <polygon points="0,295 48,270 105,195" fill="url(#f-lit)" />
      <polygon points="0,295 -48,270 -105,195" fill="url(#f-dark)" />

      <polygon points="0,295 105,195 78,315 0,335" fill="url(#f-bright)" />
      <polygon points="0,295 -105,195 -78,315 0,335" fill="url(#f-mid)" />

      <polygon points="105,195 125,290 78,315" fill="url(#f-lit)" />
      <polygon points="-105,195 -125,290 -78,315" fill="url(#f-dark)" />

      <polygon points="0,335 78,315 0,355" fill="url(#f-bright)" />
      <polygon points="0,335 -78,315 0,355" fill="url(#f-deep)" />

      <!-- Central Vertical Route Telemetry Spine -->
      <line x1="0" y1="295" x2="0" y2="355" stroke="#00f5ff" stroke-width="2" opacity="0.8" stroke-dasharray="4, 3" />
    </g>
  </g>
</svg>`;
}

async function render() {
  const svg = buildRouteReplyLogoSvg();
  const docsDir = path.resolve('B:/workgit/routereply/docs/images');
  const svgPath = path.join(docsDir, 'logo.svg');
  const pngPath = path.join(docsDir, 'logo.png');

  fs.writeFileSync(svgPath, svg, 'utf8');
  console.log('✓ Wrote logo.svg');

  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: 1024 }
  });
  const pngData = resvg.render().asPng();
  fs.writeFileSync(pngPath, pngData);
  console.log('✓ Rendered full 1024x1024 logo.png with Resvg (bytes: ' + pngData.length + ')');
}

render().catch(console.error);
