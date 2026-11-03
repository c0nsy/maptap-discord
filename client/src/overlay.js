// Country highlight + distance ring, drawn on an equirectangular canvas that wraps the globe
// as a transparent texture. Country shapes come from bundled Natural Earth data (world-atlas).
import * as THREE from 'three';
import { geoEquirectangular, geoPath, geoContains, geoCircle } from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-50m.json';

const W = 4096, H = 2048;

export function createOverlay(radius) {
  const countries = feature(world, world.objects.countries).features;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  const projection = geoEquirectangular().scale(W / (2 * Math.PI)).translate([W / 2, H / 2]);
  const path = geoPath(projection, ctx);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.0015, 96, 96),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );

  function clear() {
    ctx.clearRect(0, 0, W, H);
    texture.needsUpdate = true;
  }

  /** Highlight the country containing [lon, lat] (if any) and draw a ring of `km` radius around it. */
  function show([lon, lat], km) {
    ctx.clearRect(0, 0, W, H);
    // Coastal cities (Venice, Singapore...) can fall just outside the polygon, so probe nearby too.
    let country = null;
    outer: for (const r of [0, 0.15, 0.4, 0.8]) {
      for (let i = 0; i < (r ? 8 : 1); i++) {
        const a = (i / 8) * 2 * Math.PI;
        const pt = [lon + r * Math.cos(a), lat + r * Math.sin(a)];
        country = countries.find((f) => geoContains(f, pt));
        if (country) break outer;
      }
    }
    if (country) {
      ctx.beginPath(); path(country);
      ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.stroke();
    }
    if (km > 10) {
      const deg = (km / 6371) * (180 / Math.PI);
      ctx.beginPath(); path(geoCircle().center([lon, lat]).radius(deg)());
      ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(140,240,255,0.75)'; ctx.stroke();
      ctx.fillStyle = 'rgba(140,240,255,0.08)'; ctx.fill();
    }
    texture.needsUpdate = true;
    return country?.properties?.name || null;
  }

  return { mesh, show, clear };
}
