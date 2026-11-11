import { arrowHead, heart, label, sparkle, star, svg, type LibraryItem } from './draw'

// Original stickers: badges, bursts, doodles and bubbles.

const purple = '#804ce5'
const deep = '#5a3fc0'
const wash = '#ece8ff'
const pink = '#ff8fb1'
const red = '#ff3b5c'
const coral = '#ff6b6b'
const yellow = '#ffd166'
const gold = '#f0a500'
const orange = '#ff9f43'
const green = '#57cc99'
const teal = '#2ec4b6'
const blue = '#4dabf7'
const ink = '#2b2d42'
const white = '#ffffff'

const V = '0 0 200 200'
const pen = (color: string, width = 7) => `stroke="${color}" stroke-width="${width}" fill="none" stroke-linecap="round" stroke-linejoin="round"`

export const STICKERS: LibraryItem[] = [
  {
    id: 'sale', name: 'Sale burst', tags: 'sale discount offer shop promo badge',
    svg: svg(V, `<polygon points="${star(100, 100, 94, 70, 18)}" fill="${red}"/>${label(100, 116, 44, white, 'SALE')}`),
  },
  {
    id: 'new', name: 'New badge', tags: 'new badge label launch fresh',
    svg: svg(V, `<polygon points="${star(100, 100, 92, 82, 24)}" fill="${yellow}"/><circle cx="100" cy="100" r="68" fill="none" stroke="${ink}" stroke-width="3" stroke-dasharray="3 7"/>${label(100, 116, 46, ink, 'NEW')}`),
  },
  {
    id: 'off', name: '50% off tag', tags: 'discount percent off sale price tag',
    svg: svg('0 0 200 140', `<path d="M30 20 H140 L180 70 L140 120 H30 a12 12 0 0 1 -12 -12 V32 a12 12 0 0 1 12 -12Z" fill="${purple}"/><circle cx="146" cy="70" r="8" fill="${white}"/>
${label(80, 66, 34, white, '50%')}${label(80, 98, 22, yellow, 'OFF')}`),
  },
  {
    id: 'free', name: 'Free ribbon', tags: 'free ribbon banner label offer',
    svg: svg('0 0 200 120', `<path d="M8 40 H44 V100 H8 L22 70Z" fill="#c0392b"/><path d="M192 40 H156 V100 H192 L178 70Z" fill="#c0392b"/>
<path d="M30 86 L44 100 V86Z" fill="#8e2a1f"/><path d="M170 86 L156 100 V86Z" fill="#8e2a1f"/>
<rect x="30" y="24" width="140" height="62" rx="4" fill="${coral}"/>${label(100, 68, 34, white, 'FREE')}`),
  },
  {
    id: 'hot', name: 'Hot flame', tags: 'hot fire flame trending popular',
    svg: svg(V, `<path d="M100 14 C122 56 162 70 152 130 C146 168 122 186 100 186 C68 186 46 164 48 128 C50 98 70 88 76 62 C88 80 92 94 92 108 C104 88 112 58 100 14Z" fill="${orange}"/>
<path d="M102 80 C116 108 136 118 130 148 C126 168 114 176 100 176 C82 176 70 164 72 144 C74 128 86 122 90 108 C96 120 98 128 96 136 C106 124 108 102 102 80Z" fill="${yellow}"/>${label(100, 162, 30, ink, 'HOT')}`),
  },
  {
    id: 'burst', name: 'Burst', tags: 'burst star shape pop highlight',
    svg: svg(V, `<polygon points="${star(100, 100, 96, 60, 12)}" fill="${yellow}"/><polygon points="${star(100, 100, 60, 38, 12, -75)}" fill="${orange}"/>`),
  },
  {
    id: 'wow', name: 'Wow pop', tags: 'wow comic pop exclaim surprise',
    svg: svg(V, `<polygon points="100,8 118,52 160,22 150,70 194,74 156,104 190,140 140,136 146,186 110,152 84,192 76,146 30,168 50,124 6,110 48,88 16,48 64,58 70,12" fill="${pink}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
${label(100, 114, 32, white, 'WOW!', `stroke="${ink}" stroke-width="3" paint-order="stroke"`)}`),
  },
  {
    id: 'arrow-curve', name: 'Curved arrow', tags: 'arrow hand drawn doodle point curve',
    svg: svg(V, `<path d="M30 150 C60 70 120 50 168 70" ${pen(ink)}/><path d="${arrowHead(168, 70, 120, 50)}" ${pen(ink)}/>`),
  },
  {
    id: 'arrow-loop', name: 'Loop arrow', tags: 'arrow hand drawn doodle loop swirl',
    svg: svg(V, `<path d="M24 130 C60 140 90 120 96 96 C102 70 70 66 66 90 C62 116 110 128 172 90" ${pen(ink)}/><path d="${arrowHead(172, 90, 110, 128)}" ${pen(ink)}/>`),
  },
  {
    id: 'arrow-down', name: 'Squiggle arrow', tags: 'arrow hand drawn doodle down wave',
    svg: svg('0 0 120 200', `<path d="M60 16 C30 40 90 60 60 90 C30 120 90 140 60 176" ${pen(coral, 6)}/><path d="${arrowHead(60, 176, 75, 150)}" ${pen(coral, 6)}/>`),
  },
  {
    id: 'underline', name: 'Scribble underline', tags: 'underline scribble highlight hand drawn marker',
    svg: svg('0 0 200 70', `<path d="M14 30 C60 12 120 16 186 10 M26 52 C80 38 130 38 172 32" ${pen(coral, 8)}/>`),
  },
  {
    id: 'speech-hi', name: 'Speech bubble', tags: 'speech bubble chat talk hi hello quote',
    svg: svg(V, `<path d="M100 30 C150 30 180 58 180 92 C180 126 150 150 104 152 L70 178 L76 148 C44 140 20 120 20 92 C20 58 50 30 100 30Z" fill="${white}" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/>${label(100, 110, 46, purple, 'Hi!')}`),
  },
  {
    id: 'thought', name: 'Thought bubble', tags: 'thought bubble think idea cloud dream',
    svg: svg(V, `<path d="M60 128 a24 24 0 0 1 -6 -46 a30 30 0 0 1 50 -22 a30 30 0 0 1 50 10 a24 24 0 0 1 6 46 a26 26 0 0 1 -44 16 a30 30 0 0 1 -56 -4Z" fill="${wash}" stroke="${purple}" stroke-width="5" stroke-linejoin="round"/>
<circle cx="62" cy="156" r="10" fill="${wash}" stroke="${purple}" stroke-width="4"/><circle cx="42" cy="178" r="6" fill="${wash}" stroke="${purple}" stroke-width="4"/>`),
  },
  {
    id: 'speech-wow', name: 'Box bubble', tags: 'speech bubble chat comic box shout',
    svg: svg(V, `<path d="M24 36 H176 a12 12 0 0 1 12 12 V122 a12 12 0 0 1 -12 12 H96 L62 168 L66 134 H24 a12 12 0 0 1 -12 -12 V48 a12 12 0 0 1 12 -12Z" fill="${yellow}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>${label(100, 102, 42, ink, 'YES!')}`),
  },
  {
    id: 'ribbon', name: 'Ribbon banner', tags: 'ribbon banner title label blank',
    svg: svg('0 0 200 110', `<path d="M8 36 H40 V96 H8 L22 66Z" fill="${deep}"/><path d="M192 36 H160 V96 H192 L178 66Z" fill="${deep}"/>
<path d="M30 20 Q100 40 170 20 V80 Q100 100 30 80Z" fill="${purple}"/>`),
  },
  {
    id: 'rosette', name: 'Award rosette', tags: 'award ribbon winner best prize medal',
    svg: svg(V, `<path d="M80 116 L62 186 L84 174 L96 192 L106 126Z" fill="${blue}"/><path d="M120 116 L138 186 L116 174 L104 192 L94 126Z" fill="#339af0"/>
<polygon points="${star(100, 86, 70, 60, 20)}" fill="${yellow}"/><circle cx="100" cy="86" r="48" fill="${white}"/><circle cx="100" cy="86" r="41" fill="${yellow}"/>${label(100, 98, 30, ink, 'BEST')}`),
  },
  {
    id: 'heart', name: 'Heart', tags: 'heart love like valentine',
    svg: svg(V, `<path d="${heart(100, 104, 86)}" fill="${coral}"/><path d="M52 66 C60 54 72 50 82 52" ${pen(white, 9)} opacity=".6"/>`),
  },
  {
    id: 'heart-doodle', name: 'Doodle heart', tags: 'heart love doodle hand drawn outline',
    svg: svg(V, `<path d="${heart(100, 104, 80)}" ${pen(pink, 7)}/><path d="${heart(104, 100, 72)}" ${pen(pink, 4)} opacity=".7"/>`),
  },
  {
    id: 'star', name: 'Star', tags: 'star rating favorite review',
    svg: svg(V, `<polygon points="${star(100, 108, 90, 40, 5)}" fill="${yellow}" stroke="${gold}" stroke-width="5" stroke-linejoin="round"/><path d="M70 92 L84 86" ${pen(white, 7)} opacity=".7"/>`),
  },
  {
    id: 'sparkles', name: 'Sparkles', tags: 'sparkle shine magic new clean twinkle',
    svg: svg(V, `<path d="${sparkle(84, 110, 64)}" fill="${yellow}"/><path d="${sparkle(150, 50, 30)}" fill="${pink}"/><path d="${sparkle(158, 150, 20)}" fill="${purple}"/>`),
  },
  {
    id: 'circle', name: 'Doodle circle', tags: 'circle highlight doodle hand drawn ring',
    svg: svg('0 0 200 160', `<path d="M150 34 C120 6 44 14 28 66 C14 118 88 150 142 128 C184 110 178 58 132 34 C112 24 84 26 70 32" ${pen(purple, 6)}/>`),
  },
  {
    id: 'squiggle', name: 'Squiggle', tags: 'squiggle wave line doodle divider',
    svg: svg('0 0 200 60', `<path d="M14 30 q14 -24 28 0 t28 0 t28 0 t28 0 t28 0 t28 0" ${pen(teal, 8)}/>`),
  },
  {
    id: 'smiley', name: 'Smiley', tags: 'smile happy face emoji smiley',
    svg: svg(V, `<circle cx="100" cy="100" r="86" fill="${yellow}"/><ellipse cx="72" cy="82" rx="9" ry="14" fill="${ink}"/><ellipse cx="128" cy="82" rx="9" ry="14" fill="${ink}"/>
<path d="M58 116 C72 152 128 152 142 116" ${pen(ink, 8)}/><ellipse cx="50" cy="118" rx="12" ry="7" fill="${pink}"/><ellipse cx="150" cy="118" rx="12" ry="7" fill="${pink}"/>`),
  },
  {
    id: 'check', name: 'Check badge', tags: 'check tick done approved verified ok',
    svg: svg(V, `<polygon points="${star(100, 100, 88, 76, 20)}" fill="${green}"/><path d="M64 102 L90 128 L138 76" ${pen(white, 14)}/>`),
  },
  {
    id: 'rainbow', name: 'Rainbow', tags: 'rainbow color pride happy weather',
    svg: svg('0 0 200 130', `${[[80, coral], [64, orange], [48, yellow], [32, green], [16, blue]].map(([r, c]) => `<path d="M${100 - Number(r)} 110 a${r} ${r} 0 0 1 ${2 * Number(r)} 0" stroke="${c}" stroke-width="16" fill="none"/>`).join('')}
<circle cx="22" cy="112" r="14" fill="${white}" stroke="#d0d0dc" stroke-width="3"/><circle cx="178" cy="112" r="14" fill="${white}" stroke="#d0d0dc" stroke-width="3"/>`),
  },
  {
    id: 'bolt', name: 'Lightning', tags: 'lightning bolt energy power fast flash',
    svg: svg(V, `<path d="M118 12 L46 112 H94 L80 188 L154 80 H106Z" fill="${yellow}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>`),
  },
  {
    id: 'thanks', name: 'Thank you', tags: 'thank you thanks label pill gratitude',
    svg: svg('0 0 200 90', `<rect x="10" y="10" width="180" height="70" rx="35" fill="${pink}"/>${label(100, 52, 17, white, 'THANK YOU')}
<path d="${heart(28, 45, 8)}" fill="${white}"/><path d="${heart(172, 45, 8)}" fill="${white}"/>`),
  },
  {
    id: 'crown', name: 'Crown', tags: 'crown king queen best royal winner doodle',
    svg: svg('0 0 200 160', `<path d="M30 130 L38 50 L76 94 L100 36 L124 94 L162 50 L170 130Z" fill="${yellow}" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
<circle cx="38" cy="46" r="8" fill="${coral}"/><circle cx="100" cy="32" r="8" fill="${coral}"/><circle cx="162" cy="46" r="8" fill="${coral}"/>
<rect x="30" y="122" width="140" height="16" rx="4" fill="${purple}"/>`),
  },
]
