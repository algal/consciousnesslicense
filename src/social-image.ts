import { initWasm, Resvg } from '@resvg/resvg-wasm';
import wasm from '@resvg/resvg-wasm/index_bg.wasm';
import serif from './fonts/DejaVuSerif.ttf';
import sans from './fonts/DejaVuSans-Bold.ttf';
import { socialCardSvg } from './social-card.ts';
import type { License } from './render.ts';

let ready: Promise<void> | undefined;
export async function renderSocialPng(license: License): Promise<Uint8Array> {
  await (ready ??= initWasm(wasm).catch(error => { ready = undefined; throw error; }));
  const renderer = new Resvg(socialCardSvg(license), {
    font: { fontBuffers: [new Uint8Array(serif), new Uint8Array(sans)], defaultFontFamily: 'DejaVu Sans' },
  });
  try {
    const image = renderer.render();
    try { return image.asPng(); } finally { image.free(); }
  } finally { renderer.free(); }
}
