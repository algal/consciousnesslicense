import { escape, layout, type License } from './render.ts';

export const CARD_VERSION = '1';
export const cardAlt = (license: License) => `Consciousness License${license.handle ? ` · @${license.handle}` : ''}. Licensed to discuss consciousness. Issued by the Bureau of Consciousness Licensing.`;

// This card celebrates issuance, not account verification. It is deliberately
// identical before/after X verification: social platforms cache their previews.
export function socialCardSvg(license: License) {
  const rays = Array.from({ length: 72 }, (_, i) => {
    const a = i * Math.PI / 36;
    return `<path d="M${960 + Math.cos(a) * 114} ${285 + Math.sin(a) * 114}L${960 + Math.cos(a) * 132} ${285 + Math.sin(a) * 132}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
<title>${escape(cardAlt(license))}</title>
<defs>
 <linearGradient id="paper" x2="1" y2="1"><stop stop-color="#d3eced"/><stop offset=".4" stop-color="#faf3df"/><stop offset=".7" stop-color="#efddea"/><stop offset="1" stop-color="#c9def1"/></linearGradient>
 <linearGradient id="gold" x2=".8" y2="1"><stop stop-color="#8e692d"/><stop offset=".23" stop-color="#f4df9f"/><stop offset=".43" stop-color="#d4ad54"/><stop offset=".54" stop-color="#fff1ba"/><stop offset=".78" stop-color="#b88a3e"/><stop offset="1" stop-color="#eacf89"/></linearGradient>
 <pattern id="engraving" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0" stroke="#142b40" stroke-opacity=".045" stroke-width=".6"/></pattern>
</defs>
<rect width="1200" height="630" fill="url(#paper)"/>
<rect width="1200" height="630" fill="url(#engraving)"/>
<g fill="none" stroke="#526675"><rect x="18" y="18" width="1164" height="594"/><rect x="25" y="25" width="1150" height="580" stroke-opacity=".4"/>
 <path d="M38 82V38H82M1118 38H1162V82M38 548V592H82M1118 592H1162V548" stroke-width="2"/>
 <path d="M64 124H1136" stroke-opacity=".35"/>
</g>
<g fill="#142b40" font-family="DejaVu Sans" font-weight="bold">
 <text x="64" y="72" font-size="19" letter-spacing="2.5">BUREAU OF CONSCIOUSNESS LICENSING</text>
 <text x="64" y="102" font-size="12" letter-spacing="2.7">DEPARTMENT OF INFORMED OPINION</text>
 <text x="1136" y="74" text-anchor="end" font-size="14" letter-spacing="2">FORM C–01</text>
</g>
<g fill="#142b40" font-family="DejaVu Serif" font-size="73">
 <text x="60" y="215">Licensed to</text>
 <text x="60" y="297">discuss</text>
 <text x="60" y="379">consciousness.</text>
</g>
<g transform="rotate(-9 960 285)">
 <circle cx="960" cy="285" r="140" fill="url(#gold)" stroke="#9e7a3e"/>
 <g stroke="#71592e" stroke-opacity=".6" stroke-width="1">${rays}</g>
 <circle cx="960" cy="285" r="109" fill="none" stroke="#71592e"/>
 <circle cx="960" cy="285" r="103" fill="none" stroke="#fff4cd"/>
 <g fill="#463d26" text-anchor="middle">
  <text x="960" y="229" font-family="DejaVu Sans" font-weight="bold" font-size="13" letter-spacing="2">BASIC FAMILIARITY</text>
  <text x="957" y="324" font-family="DejaVu Serif" font-size="104">C</text>
  <text x="960" y="358" font-family="DejaVu Sans" font-weight="bold" font-size="14" letter-spacing="4">LICENSE ISSUED</text>
 </g>
</g>
<path d="M64 420H744" stroke="#526675" stroke-opacity=".4"/>
<text x="64" y="477" fill="#142b40" font-family="DejaVu Sans" font-weight="bold" font-size="${license.handle ? '40' : '30'}">${escape(license.handle ? `@${license.handle}` : 'An informed anonymous bearer.')}</text>
<rect x="38" y="524" width="1124" height="68" fill="#142b40"/>
<g fill="#f6efdb" font-family="DejaVu Sans" font-weight="bold">
 <text x="64" y="567" font-size="25">consciousnesslicense.com</text>
 <text x="1136" y="564" text-anchor="end" font-size="13" letter-spacing="1.5">INVALUABLE CREDENTIALS.</text>
</g>
</svg>`;
}

export function socialPreview(license: License, origin: string) {
  const url = `${origin}/license/${license.id}`;
  return layout('Social card preview', `<section class="social-preview"><p class="eyebrow">BUREAU DESIGN OFFICE / PREVIEW</p><h1>Your opinion has paperwork.</h1><p class="lede">The proposed link preview for your license. X controls the final presentation and when cached previews refresh.</p><figure class="social-card-preview"><img src="${escape(url)}/social.png" width="1200" height="630" alt="${escape(cardAlt(license))}"><figcaption><span>consciousnesslicense.com</span><strong>Consciousness License${license.handle ? ` · @${escape(license.handle)}` : ''}</strong></figcaption></figure><p class="small">The artwork celebrates license issuance. The certificate page records the current account-verification status.</p><a class="text-link" href="${escape(url)}">View the certificate →</a></section>`, { noindex: true });
}
