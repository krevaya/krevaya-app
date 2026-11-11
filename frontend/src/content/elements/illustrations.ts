import { heart, star, svg, type LibraryItem } from './draw'

// Original flat illustrations. Each color is a plain 6-digit hex so the
// toolbar's recolor swatches can swap them one by one.

const purple = '#804ce5'
const lilac = '#9b87f5'
const deep = '#5a3fc0'
const wash = '#ece8ff'
const pink = '#ff8fb1'
const red = '#ff6b6b'
const yellow = '#ffd166'
const gold = '#f0a500'
const orange = '#ff9f43'
const green = '#57cc99'
const leaf = '#2f9e6e'
const blue = '#4dabf7'
const sky = '#d0ebff'
const ink = '#2b2d42'
const gray = '#a5a5b8'
const white = '#ffffff'
const brown = '#a47148'

const V = '0 0 200 200'

export const ILLUSTRATIONS: LibraryItem[] = [
  {
    id: 'plant', name: 'Potted plant', tags: 'plant leaf pot green home office nature',
    svg: svg(V, `<path d="M100 120 C98 90 100 70 100 50" stroke="${leaf}" stroke-width="5" fill="none" stroke-linecap="round"/>
<path d="M100 98 C70 98 54 78 50 56 C78 56 96 72 100 98Z" fill="${green}"/>
<path d="M100 82 C128 82 146 62 152 38 C122 38 104 56 100 82Z" fill="${leaf}"/>
<path d="M100 60 C88 50 86 32 96 16 C108 30 108 48 100 60Z" fill="${green}"/>
<path d="M66 120 H134 L124 180 H76Z" fill="${orange}"/><rect x="58" y="110" width="84" height="16" rx="4" fill="#e8822e"/>`),
  },
  {
    id: 'laptop', name: 'Laptop', tags: 'laptop computer work tech office screen',
    svg: svg(V, `<rect x="40" y="48" width="120" height="82" rx="8" fill="${ink}"/><rect x="48" y="56" width="104" height="66" rx="3" fill="${blue}"/>
<rect x="58" y="68" width="50" height="9" rx="4.5" fill="${white}"/><rect x="58" y="84" width="76" height="6" rx="3" fill="${sky}"/><rect x="58" y="96" width="60" height="6" rx="3" fill="${sky}"/>
<path d="M22 134 H178 L168 150 H32Z" fill="#c9c9d6"/><rect x="84" y="134" width="32" height="5" rx="2.5" fill="${gray}"/>`),
  },
  {
    id: 'coffee', name: 'Coffee', tags: 'coffee cup tea drink cafe morning mug',
    svg: svg(V, `<ellipse cx="104" cy="166" rx="66" ry="10" fill="${wash}"/>
<path d="M146 92 h8 a18 18 0 0 1 0 36 h-12" stroke="${pink}" stroke-width="10" fill="none"/>
<path d="M60 80 H148 L140 148 a14 14 0 0 1 -14 12 H82 a14 14 0 0 1 -14 -12Z" fill="${pink}"/>
<ellipse cx="104" cy="80" rx="44" ry="8" fill="#7a4a2a"/>
<path d="M88 40 c-8 10 8 16 0 26 M104 32 c-8 10 8 16 0 26 M120 40 c-8 10 8 16 0 26" stroke="#c9c9d6" stroke-width="5" fill="none" stroke-linecap="round"/>`),
  },
  {
    id: 'mountains', name: 'Mountains', tags: 'mountain landscape sun travel outdoor nature hike',
    svg: svg('0 0 200 170', `<rect x="10" y="10" width="180" height="150" rx="16" fill="${sky}"/><circle cx="142" cy="50" r="20" fill="${yellow}"/>
<path d="M10 136 L66 62 L104 112 L132 80 L190 140 V144 a16 16 0 0 1 -16 16 H26 a16 16 0 0 1 -16 -16Z" fill="${lilac}"/>
<path d="M66 62 L54 78 L62 76 L68 82 L76 74Z" fill="${white}"/>
<path d="M10 150 L58 112 L92 136 L140 102 L190 148 V144 a16 16 0 0 1 -16 16 H26 a16 16 0 0 1 -16 -16Z" fill="${deep}"/>`),
  },
  {
    id: 'balloons', name: 'Balloons', tags: 'balloon party birthday celebrate fun',
    svg: svg(V, `<path d="M70 124 C76 142 92 152 100 184 M100 106 C100 130 104 150 100 184 M132 122 C124 142 108 154 100 184" stroke="#8d8da6" stroke-width="2" fill="none"/>
<ellipse cx="70" cy="84" rx="30" ry="38" fill="${pink}"/><path d="M66 121 h8 l-4 7z" fill="${pink}"/>
<ellipse cx="132" cy="82" rx="30" ry="38" fill="${blue}"/><path d="M128 119 h8 l-4 7z" fill="${blue}"/>
<ellipse cx="100" cy="64" rx="32" ry="40" fill="${yellow}"/><path d="M96 103 h8 l-4 7z" fill="${yellow}"/>
<ellipse cx="88" cy="48" rx="6" ry="11" fill="${white}" opacity=".55"/>`),
  },
  {
    id: 'gift', name: 'Gift', tags: 'gift present box birthday christmas surprise',
    svg: svg(V, `<rect x="40" y="88" width="120" height="86" rx="6" fill="${purple}"/><rect x="32" y="66" width="136" height="30" rx="6" fill="${lilac}"/>
<rect x="92" y="66" width="16" height="108" fill="${yellow}"/>
<path d="M100 66 C80 36 54 46 64 60 C70 68 88 68 100 66Z" fill="${yellow}"/><path d="M100 66 C120 36 146 46 136 60 C130 68 112 68 100 66Z" fill="${yellow}"/>`),
  },
  {
    id: 'rocket', name: 'Rocket', tags: 'rocket space launch startup fast growth',
    svg: svg(V, `<path d="M88 148 C88 168 100 186 100 186 C100 186 112 168 112 148Z" fill="${orange}"/><path d="M94 148 C94 162 100 174 100 174 C100 174 106 162 106 148Z" fill="${yellow}"/>
<path d="M78 112 L54 150 L82 144Z" fill="${red}"/><path d="M122 112 L146 150 L118 144Z" fill="${red}"/>
<path d="M100 18 C130 44 132 100 120 150 H80 C68 100 70 44 100 18Z" fill="${wash}"/>
<path d="M100 18 C112 28 119 40 123 54 H77 C81 40 88 28 100 18Z" fill="${red}"/>
<circle cx="100" cy="88" r="14" fill="${blue}" stroke="${ink}" stroke-width="5"/>`),
  },
  {
    id: 'book', name: 'Open book', tags: 'book read study school learn library',
    svg: svg(V, `<path d="M16 62 V166 C50 158 80 160 100 172 C120 160 150 158 184 166 V62Z" fill="${purple}"/>
<path d="M100 60 C80 48 50 46 24 52 V156 C50 150 80 152 100 164Z" fill="${white}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
<path d="M100 60 C120 48 150 46 176 52 V156 C150 150 120 152 100 164Z" fill="${white}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
<path d="M40 76 C58 72 74 74 86 80 M40 96 C58 92 74 94 86 100 M40 116 C58 112 74 114 86 120 M114 80 C126 74 142 72 160 76 M114 100 C126 94 142 92 160 96 M114 120 C126 114 142 112 160 116" stroke="#c9c9d6" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  },
  {
    id: 'camera', name: 'Camera', tags: 'camera photo photography picture travel',
    svg: svg(V, `<path d="M72 64 L82 44 H118 L128 64Z" fill="${ink}"/><rect x="28" y="62" width="144" height="102" rx="14" fill="${ink}"/>
<circle cx="100" cy="113" r="37" fill="${wash}"/><circle cx="100" cy="113" r="27" fill="${blue}"/><circle cx="100" cy="113" r="12" fill="${ink}"/><circle cx="108" cy="105" r="5" fill="${white}"/>
<rect x="140" y="74" width="20" height="10" rx="3" fill="${pink}"/><rect x="40" y="74" width="20" height="6" rx="3" fill="${yellow}"/>`),
  },
  {
    id: 'bulb', name: 'Light bulb', tags: 'idea light bulb think creative tip',
    svg: svg(V, `<path d="M100 12 V26 M42 38 l10 10 M158 38 l-10 10 M28 94 H42 M158 94 H172" stroke="${yellow}" stroke-width="6" stroke-linecap="round"/>
<path d="M100 40 a52 52 0 0 0 -30 94 c6 5 8 12 8 18 h44 c0 -6 2 -13 8 -18 A52 52 0 0 0 100 40Z" fill="${yellow}"/>
<path d="M74 80 a30 30 0 0 1 22 -16" stroke="${white}" stroke-width="6" fill="none" stroke-linecap="round"/>
<rect x="78" y="152" width="44" height="12" rx="4" fill="#8d8da6"/><rect x="82" y="166" width="36" height="10" rx="4" fill="#6c6c85"/><path d="M90 178 h20 l-4 8 h-12z" fill="${ink}"/>`),
  },
  {
    id: 'cactus', name: 'Cactus', tags: 'cactus plant desert succulent pot',
    svg: svg(V, `<rect x="84" y="40" width="32" height="100" rx="16" fill="${green}"/>
<path d="M84 100 H66 a12 12 0 0 1 -12 -12 V70 a8 8 0 0 1 16 0 V86 H84Z" fill="${green}"/>
<path d="M116 88 H134 a12 12 0 0 0 12 -12 V58 a8 8 0 0 0 -16 0 V74 H116Z" fill="${green}"/>
<path d="M100 54 V128" stroke="${leaf}" stroke-width="3" stroke-linecap="round"/><circle cx="100" cy="40" r="8" fill="${red}"/>
<path d="M64 140 H136 L128 182 H72Z" fill="${pink}"/><rect x="58" y="132" width="84" height="14" rx="4" fill="#f06f98"/>`),
  },
  {
    id: 'house', name: 'House', tags: 'house home real estate building property',
    svg: svg(V, `<rect x="124" y="52" width="14" height="30" fill="#c0392b"/><path d="M36 98 L100 42 L164 98Z" fill="${red}"/>
<rect x="52" y="94" width="96" height="78" fill="${yellow}"/><rect x="88" y="124" width="24" height="48" rx="3" fill="${purple}"/>
<rect x="62" y="108" width="20" height="20" rx="2" fill="${blue}"/><rect x="118" y="108" width="20" height="20" rx="2" fill="${blue}"/>
<rect x="24" y="170" width="152" height="8" rx="4" fill="${green}"/>`),
  },
  {
    id: 'sunny', name: 'Sun and cloud', tags: 'weather sun cloud sky summer day',
    svg: svg(V, `<path d="M80 22 V34 M80 126 V138 M22 80 H34 M126 80 H138 M39 39 l8 8 M113 113 l8 8 M39 121 l8 -8 M113 47 l8 -8" stroke="${orange}" stroke-width="6" stroke-linecap="round"/>
<circle cx="80" cy="80" r="34" fill="${yellow}"/>
<path d="M60 160 a28 28 0 0 1 4 -56 a38 38 0 0 1 72 -6 a30 30 0 0 1 12 62Z" fill="${wash}" stroke="${sky}" stroke-width="4"/>`),
  },
  {
    id: 'tree', name: 'Tree', tags: 'tree nature park apple garden green',
    svg: svg(V, `<rect x="90" y="118" width="20" height="58" rx="4" fill="${brown}"/>
<circle cx="100" cy="82" r="48" fill="${green}"/><circle cx="68" cy="104" r="30" fill="#3bb27f"/><circle cx="132" cy="104" r="30" fill="#3bb27f"/>
<circle cx="86" cy="70" r="6" fill="${red}"/><circle cx="120" cy="88" r="6" fill="${red}"/><circle cx="70" cy="108" r="6" fill="${red}"/><circle cx="136" cy="112" r="6" fill="${red}"/>`),
  },
  {
    id: 'cupcake', name: 'Cupcake', tags: 'cupcake cake dessert bakery sweet birthday food',
    svg: svg(V, `<path d="M58 110 H142 L130 176 H70Z" fill="${blue}"/><path d="M80 110 L84 176 M100 110 V176 M120 110 L116 176" stroke="#339af0" stroke-width="4"/>
<path d="M50 114 C40 92 62 78 74 82 C74 60 100 54 108 68 C120 54 146 64 138 86 C156 88 160 110 150 114Z" fill="${pink}"/>
<path d="M76 96 l6 -3 M96 86 l6 2 M120 98 l5 -4 M88 106 l6 1 M132 104 l4 3" stroke="${yellow}" stroke-width="4" stroke-linecap="round"/>
<path d="M104 48 C106 38 112 32 118 30" stroke="${leaf}" stroke-width="3" fill="none"/><circle cx="104" cy="56" r="10" fill="${red}"/>`),
  },
  {
    id: 'plane', name: 'Paper plane', tags: 'paper plane send message email launch',
    svg: svg(V, `<path d="M24 160 c20 -12 30 8 50 -4" stroke="#c9c9d6" stroke-width="4" fill="none" stroke-dasharray="6 8" stroke-linecap="round"/>
<polygon points="20,98 180,30 96,122" fill="${white}" stroke="${purple}" stroke-width="5" stroke-linejoin="round"/>
<polygon points="96,122 180,30 132,168" fill="${wash}" stroke="${purple}" stroke-width="5" stroke-linejoin="round"/>
<polygon points="96,122 108,162 120,146" fill="${lilac}"/>`),
  },
  {
    id: 'headphones', name: 'Headphones', tags: 'headphones music audio podcast listen',
    svg: svg(V, `<path d="M44 124 V100 a56 56 0 0 1 112 0 V124" stroke="${ink}" stroke-width="12" fill="none" stroke-linecap="round"/>
<rect x="30" y="110" width="38" height="60" rx="14" fill="${purple}"/><rect x="132" y="110" width="38" height="60" rx="14" fill="${purple}"/>
<rect x="60" y="118" width="12" height="44" rx="6" fill="${ink}"/><rect x="128" y="118" width="12" height="44" rx="6" fill="${ink}"/>`),
  },
  {
    id: 'calendar', name: 'Calendar', tags: 'calendar date event schedule plan day',
    svg: svg(V, `<rect x="36" y="44" width="128" height="124" rx="12" fill="${white}" stroke="${ink}" stroke-width="5"/>
<path d="M36 56 a12 12 0 0 1 12 -12 H152 a12 12 0 0 1 12 12 V80 H36Z" fill="${red}"/>
<rect x="64" y="30" width="10" height="26" rx="5" fill="${ink}"/><rect x="126" y="30" width="10" height="26" rx="5" fill="${ink}"/>
${[60, 86, 112, 138].flatMap((x) => [102, 126, 150].map((y) => `<circle cx="${x}" cy="${y}" r="7" fill="${x === 112 && y === 126 ? purple : '#d9d9e3'}"/>`)).join('')}`),
  },
  {
    id: 'envelope', name: 'Letter', tags: 'mail email letter envelope message newsletter',
    svg: svg(V, `<rect x="28" y="56" width="144" height="100" rx="10" fill="#e8b33a"/>
<rect x="44" y="38" width="112" height="70" rx="6" fill="${white}" stroke="#e6e1f7" stroke-width="3"/>
<path d="M60 56 H140 M60 70 H124" stroke="#c9c9d6" stroke-width="5" stroke-linecap="round"/>
<path d="M28 74 L100 118 L172 74 V146 a10 10 0 0 1 -10 10 H38 a10 10 0 0 1 -10 -10Z" fill="${yellow}"/>
<path d="${heart(100, 132, 12)}" fill="${red}"/>`),
  },
  {
    id: 'trophy', name: 'Trophy', tags: 'trophy award winner prize cup champion',
    svg: svg(V, `<path d="M66 58 H44 a20 20 0 0 0 24 38 M134 58 H156 a20 20 0 0 1 -24 38" stroke="${gold}" stroke-width="8" fill="none"/>
<path d="M62 42 H138 V78 a38 38 0 0 1 -76 0Z" fill="${yellow}"/><rect x="92" y="114" width="16" height="26" fill="${gold}"/>
<rect x="68" y="140" width="64" height="16" rx="4" fill="${purple}"/><rect x="58" y="156" width="84" height="16" rx="4" fill="${deep}"/>
<polygon points="${star(100, 76, 15, 6.5, 5)}" fill="${white}"/>`),
  },
  {
    id: 'island', name: 'Island', tags: 'island beach palm holiday summer travel sea',
    svg: svg(V, `<circle cx="52" cy="46" r="16" fill="${orange}"/><rect x="14" y="146" width="172" height="34" rx="10" fill="${blue}"/>
<ellipse cx="100" cy="148" rx="62" ry="16" fill="${yellow}"/>
<path d="M104 146 C100 120 96 96 108 70" stroke="${brown}" stroke-width="9" fill="none" stroke-linecap="round"/>
<path d="M108 70 C90 54 66 58 56 72 C74 66 90 68 108 70Z" fill="${green}"/><path d="M108 70 C124 50 148 52 158 66 C140 62 124 64 108 70Z" fill="#3bb27f"/>
<path d="M108 70 C104 48 112 34 126 28 C120 44 116 56 108 70Z" fill="${green}"/><path d="M108 70 C96 74 84 90 84 104 C92 92 100 82 108 70Z" fill="#3bb27f"/>`),
  },
  {
    id: 'clock', name: 'Clock', tags: 'clock time hour deadline watch',
    svg: svg(V, `<circle cx="100" cy="100" r="72" fill="${purple}"/><circle cx="100" cy="100" r="58" fill="${white}"/>
<path d="M100 50 v10 M100 140 v10 M50 100 h10 M140 100 h10" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
<path d="M100 100 V66 M100 100 L124 114" stroke="${ink}" stroke-width="6" stroke-linecap="round"/><circle cx="100" cy="100" r="6" fill="${red}"/>`),
  },
  {
    id: 'bag', name: 'Shopping bag', tags: 'shopping bag shop store buy sale retail',
    svg: svg(V, `<path d="M76 72 V58 a24 24 0 0 1 48 0 V72" stroke="${ink}" stroke-width="7" fill="none" stroke-linecap="round"/>
<path d="M46 66 H154 L164 178 H36Z" fill="${pink}"/><path d="${heart(100, 122, 22)}" fill="${white}"/>`),
  },
  {
    id: 'night', name: 'Night sky', tags: 'moon stars night sleep dream sky',
    svg: svg(V, `<rect x="14" y="14" width="172" height="172" rx="24" fill="${ink}"/>
<circle cx="92" cy="104" r="46" fill="${yellow}"/><circle cx="114" cy="88" r="40" fill="${ink}"/>
<polygon points="${star(146, 52, 10, 4, 5)}" fill="${yellow}"/><polygon points="${star(158, 126, 7, 3, 5)}" fill="${white}"/><polygon points="${star(48, 46, 6, 2.5, 5)}" fill="${white}"/>
<circle cx="138" cy="160" r="3" fill="${white}"/><circle cx="40" cy="160" r="2.5" fill="${yellow}"/>`),
  },
  {
    id: 'phone', name: 'Phone chat', tags: 'phone mobile chat message social app',
    svg: svg(V, `<rect x="58" y="24" width="80" height="154" rx="14" fill="${ink}"/><rect x="65" y="38" width="66" height="122" rx="4" fill="${wash}"/>
<rect x="72" y="50" width="42" height="16" rx="8" fill="${purple}"/><rect x="84" y="72" width="40" height="16" rx="8" fill="${pink}"/><rect x="72" y="94" width="34" height="16" rx="8" fill="${purple}"/>
<rect x="86" y="166" width="24" height="5" rx="2.5" fill="#8d8da6"/>
<circle cx="146" cy="52" r="20" fill="${red}"/><path d="${heart(146, 53, 10)}" fill="${white}"/>`),
  },
  {
    id: 'pizza', name: 'Pizza', tags: 'pizza food slice lunch restaurant',
    svg: svg(V, `<path d="M100 178 L40 52 Q100 26 160 52Z" fill="${yellow}"/><path d="M40 52 Q100 26 160 52 L153 67 Q100 42 47 67Z" fill="#e8a33d"/>
<circle cx="100" cy="80" r="11" fill="${red}"/><circle cx="76" cy="102" r="9" fill="${red}"/><circle cx="118" cy="114" r="9" fill="${red}"/><circle cx="98" cy="144" r="7" fill="${red}"/>
<path d="M86 122 l6 4 M122 86 l4 6 M110 160 l3 -5" stroke="${green}" stroke-width="4" stroke-linecap="round"/>`),
  },
  {
    id: 'megaphone', name: 'Megaphone', tags: 'megaphone announce news marketing loud promo',
    svg: svg(V, `<path d="M62 114 L72 156 H90 L82 118Z" fill="${ink}"/><path d="M50 82 L130 42 V158 L50 118Z" fill="${red}"/>
<rect x="28" y="78" width="28" height="44" rx="6" fill="${ink}"/><ellipse cx="130" cy="100" rx="10" ry="58" fill="${pink}"/>
<path d="M152 66 l16 -10 M156 100 h20 M152 134 l16 10" stroke="${yellow}" stroke-width="6" stroke-linecap="round"/>`),
  },
  {
    id: 'globe', name: 'Globe', tags: 'globe world earth travel global map',
    svg: svg(V, `<circle cx="100" cy="100" r="68" fill="${blue}"/>
<path d="M60 64 C74 54 92 58 96 70 C100 84 84 88 80 100 C76 112 60 108 54 96 C46 84 50 72 60 64Z" fill="${green}"/>
<path d="M112 112 C126 104 146 110 150 124 C152 140 136 154 122 150 C110 146 104 124 112 112Z" fill="${green}"/>
<path d="M118 50 C132 48 148 58 150 72 C136 74 124 68 118 50Z" fill="${green}"/>
<path d="M52 136 a68 68 0 0 0 30 26" stroke="${white}" stroke-width="5" fill="none" stroke-linecap="round" opacity=".5"/>`),
  },
]
