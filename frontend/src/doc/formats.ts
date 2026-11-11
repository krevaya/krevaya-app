export type Format = { id: string; label: string; group: string; width: number; height: number; unit?: 'px' | 'in' | 'mm'; inches?: [number, number] }

export const FORMATS: Format[] = [
  { id: 'ig-post', label: 'Instagram post', group: 'Social', width: 1080, height: 1350 },
  { id: 'square', label: 'Square post', group: 'Social', width: 1080, height: 1080 },
  { id: 'story', label: 'Story', group: 'Social', width: 1080, height: 1920 },
  { id: 'fb-post', label: 'Facebook post', group: 'Social', width: 1200, height: 630 },
  { id: 'x-post', label: 'X post', group: 'Social', width: 1600, height: 900 },
  { id: 'linkedin', label: 'LinkedIn post', group: 'Social', width: 1200, height: 1200 },
  { id: 'pinterest', label: 'Pin', group: 'Social', width: 1000, height: 1500 },
  { id: 'yt-thumb', label: 'YouTube thumbnail', group: 'Video', width: 1280, height: 720 },
  { id: 'yt-banner', label: 'YouTube banner', group: 'Video', width: 2560, height: 1440 },
  { id: 'presentation', label: 'Presentation', group: 'Slides', width: 1920, height: 1080 },
  { id: 'video', label: 'Widescreen video', group: 'Video', width: 1920, height: 1080 },
  { id: 'presentation-43', label: 'Slides 4:3', group: 'Slides', width: 1440, height: 1080 },
  { id: 'poster', label: 'Poster 18x24in', group: 'Print', width: 1800, height: 2400, inches: [18, 24] },
  { id: 'a4', label: 'A4 document', group: 'Print', width: 2480, height: 3508 },
  { id: 'letter', label: 'Letter page', group: 'Print', width: 2550, height: 3300 },
  { id: 'flyer', label: 'A5 flyer', group: 'Print', width: 1748, height: 2480 },
  { id: 'invitation', label: '5x7 invitation', group: 'Print', width: 1500, height: 2100, inches: [5, 7] },
  { id: 'business-card', label: 'Business card', group: 'Print', width: 1050, height: 600 },
  { id: 'resume', label: 'Resume', group: 'Print', width: 2550, height: 3300 },
  { id: 'logo', label: 'Logo', group: 'Other', width: 500, height: 500 },
  { id: 'desktop', label: 'Desktop wallpaper', group: 'Other', width: 1920, height: 1080 },
  { id: 'phone', label: 'Phone wallpaper', group: 'Other', width: 1080, height: 2340 },
]

export function formatLabel(w: number, h: number): string {
  const f = FORMATS.find((x) => x.width === w && x.height === h)
  return f ? f.label : 'Custom size'
}

/** Print sizes are authored at 300 dpi. */
export const PRINT_DPI = 300
