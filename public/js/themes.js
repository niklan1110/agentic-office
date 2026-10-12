// Office themes: the light, the sky and a colour wash over the office (furniture,
// floors, walls). The characters keep their own colours, so the team reads the same
// in every theme. Applying a theme again from any other one gives the same result.

export const THEMES = Object.freeze([
  { id: 'studio', name: 'Warm studio', blurb: 'Soft daylight on warm wood: the original look.', swatch: ['#EFE6DA', '#C2B5A2', '#5B5BD6'],
    bg: '#EFE6DA', hemi: ['#FFF1DD', '#B49A80', 1.0], key: ['#FFE2BF', 1.9], win: ['#FFF4E2', 0.45], tint: null, glow: 1, dark: false },
  { id: 'night', name: 'Late night', blurb: 'Lights down, monitors and desk lamps glowing.', swatch: ['#161925', '#2B3150', '#FFD9A0'],
    bg: '#161925', hemi: ['#7080B8', '#1C1A24', 0.55], key: ['#8FA6FF', 0.5], win: ['#9FB4FF', 0.25], tint: ['#1D2236', 0.45], glow: 2.6, dark: true },
  { id: 'cabin', name: 'Cozy cabin', blurb: 'Honey-coloured wood and a late-afternoon sun.', swatch: ['#E8D3B8', '#9A6A40', '#E8833A'],
    bg: '#E8D3B8', hemi: ['#FFE2C0', '#8A6A4A', 0.95], key: ['#FFC98A', 1.9], win: ['#FFD9A8', 0.4], tint: ['#9A6A40', 0.28], glow: 1.3, dark: false },
  { id: 'glass', name: 'Glass HQ', blurb: 'Cool, bright, a little corporate.', swatch: ['#E9EEF2', '#CDD8E2', '#4C8DF6'],
    bg: '#E9EEF2', hemi: ['#F4F8FF', '#A9B4BF', 1.05], key: ['#FFFFFF', 1.8], win: ['#EAF2FF', 0.5], tint: ['#CDD8E2', 0.35], glow: 1, dark: false },
  { id: 'matrix', name: 'Matrix', blurb: 'Green phosphor glow and fluorescent grey.', swatch: ['#0B140E', '#1C3A27', '#39FF7A'],
    bg: '#0B140E', hemi: ['#9FE8B0', '#0E1A12', 0.55], key: ['#B8FFC9', 0.8], win: ['#7DFF9E', 0.3], tint: ['#16301F', 0.5], glow: 2.4, dark: true },
  { id: 'neon', name: 'Neon arcade', blurb: 'Purple dusk, pink and cyan light.', swatch: ['#120E1F', '#2A1D4A', '#FF7AD9'],
    bg: '#120E1F', hemi: ['#9A6BFF', '#1A1030', 0.6], key: ['#FF7AD9', 0.7], win: ['#5EE7FF', 0.45], tint: ['#2A1D4A', 0.5], glow: 3, dark: true },
])

export const themeById = (id) => THEMES.find((t) => t.id === id) ?? THEMES[0]

// Recolours the office in `root`, skipping anything marked `keepColor` (characters,
// status markers) and their children. `THREE` is passed in so this module stays light.
export function applyTheme(THREE, { scene, hemi, key, win, root = scene }, id, colors = {}) {
  const t = themeById(id)
  const tint = t.tint ? new THREE.Color(t.tint[0]) : null

  scene.background = new THREE.Color(t.bg)
  if (scene.fog) scene.fog.color = new THREE.Color(t.bg)
  hemi.color.set(t.hemi[0])
  hemi.groundColor.set(t.hemi[1])
  hemi.intensity = t.hemi[2]
  key.color.set(t.key[0])
  key.intensity = t.key[1]
  win.color.set(t.win[0])
  win.intensity = t.win[1]

  const seen = new Set()
  const visit = (o) => {
    if (o.userData?.keepColor || o.userData?.agent !== undefined) return
    for (const m of [].concat(o.material ?? [])) {
      if (!m?.color || seen.has(m)) continue
      seen.add(m)
      m.userData.base ??= { color: m.color.clone(), emissive: m.emissiveIntensity ?? 0 }
      m.color.copy(m.userData.base.color)
      if (m.userData.paint && colors[m.userData.paint]) m.color.set(colors[m.userData.paint])
      else if (tint) m.color.lerp(tint, t.tint[1])
      if (m.userData.base.emissive > 0) m.emissiveIntensity = m.userData.base.emissive * t.glow
    }
    o.children.forEach(visit)
  }

  visit(root)
  document.body.classList.toggle('dark', t.dark)

  return t
}
