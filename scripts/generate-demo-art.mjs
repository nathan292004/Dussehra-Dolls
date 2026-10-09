// Generate original vector-style placeholder illustrations, then rasterize for
// React Native Image compatibility. Set SHARP_MODULE to an installed sharp path.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const require = createRequire(import.meta.url);
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'artifacts/api-server/uploads/demo');
mkdirSync(output, { recursive: true });
const figures = [
  ['ganesha', 'GANESHA', '#f0ddc5', '#d58d62', '#c8533b', 'elephant'],
  ['krishna', 'KRISHNA', '#dce8de', '#75a8bc', '#e5b845', 'flute'],
  ['lakshmi', 'LAKSHMI', '#f1dce2', '#dba177', '#b94d63', 'lotus'],
  ['saraswati', 'SARASWATI', '#eee6d4', '#dba177', '#f9f1dd', 'veena'],
  ['durga', 'DURGA', '#ead9ca', '#dba177', '#b94136', 'trident'],
  ['shiva', 'SHIVA', '#dae4ea', '#83aebe', '#d9ab6a', 'moon'],
  ['hanuman', 'HANUMAN', '#efe1c9', '#c69070', '#dd7939', 'mace'],
  ['rama', 'RAMA', '#dce8d7', '#7eaaba', '#56866a', 'bow'],
  ['murugan', 'MURUGAN', '#dce6e3', '#dba177', '#277c80', 'spear'],
  ['balakrishna', 'LITTLE KRISHNA', '#e4e3f0', '#83aebe', '#e6b742', 'butter'],
  ['vishnu', 'VISHNU', '#dce2ef', '#83aebe', '#d9ad47', 'chakra'],
  ['ganesha-mini', 'MINI GANESHA', '#e7e5d9', '#c78864', '#769579', 'elephant'],
];
for (const [slug, label, background, skin, robe, kind] of figures) {
  const elephant = kind === 'elephant';
  const crown = kind === 'moon'
    ? '<path d="M218 134 Q215 77 239 65 Q280 72 274 137" fill="#343b43"/><path d="M278 86 A17 17 0 1 1 259 68 A13 13 0 1 0 278 86" fill="#fff5ce"/>'
    : '<path d="M195 140 L201 104 L220 117 L240 75 L260 117 L279 104 L285 140Z" fill="#d9ac4a" stroke="#af8037" stroke-width="3"/><rect x="196" y="131" width="88" height="15" rx="6" fill="#efcc6a"/><circle cx="240" cy="115" r="6" fill="#b54d46"/>';
  const accessories = {
    elephant: '<path d="M233 187 Q257 187 253 221 Q250 239 273 231" fill="none" stroke="'+skin+'" stroke-width="23" stroke-linecap="round"/><path d="M216 198 L205 215 L219 210 M263 198 L275 212 L261 208" fill="#fff7e2"/>',
    flute: '<path d="M183 230 L297 205" stroke="#b77839" stroke-width="10" stroke-linecap="round"/><path d="M270 105 Q303 60 307 77 Q314 111 274 129Z" fill="#348a72"/><ellipse cx="296" cy="90" rx="7" ry="12" fill="#315d9a"/>',
    lotus: '<g fill="#cf7190" stroke="#ac567c" stroke-width="2"><ellipse cx="240" cy="336" rx="72" ry="18"/><path d="M240 350 Q189 313 190 290 Q225 290 240 350 M240 350 Q291 313 290 290 Q255 290 240 350 M240 350 Q217 309 240 283 Q263 309 240 350"/></g>',
    veena: '<g transform="rotate(-27 242 262)"><ellipse cx="210" cy="292" rx="31" ry="29" fill="#aa693f"/><rect x="222" y="190" width="15" height="102" rx="5" fill="#b88047"/><path d="M229 194V306" stroke="#f0d396" stroke-width="3"/><circle cx="231" cy="195" r="13" fill="#d5aa59"/></g>',
    trident: '<path d="M334 298V155 M316 130V150 Q316 166 334 166 Q352 166 352 150V130 M334 120V162" fill="none" stroke="#bb913f" stroke-width="7" stroke-linecap="round"/>',
    moon: '<path d="M334 298V155 M316 130V150 Q316 166 334 166 Q352 166 352 150V130 M334 120V162" fill="none" stroke="#bb913f" stroke-width="7"/><path d="M223 171H257 M223 177H257 M223 183H257" stroke="#f8efdc" stroke-width="3"/>',
    mace: '<path d="M322 310L315 205" stroke="#ae8337" stroke-width="10"/><circle cx="315" cy="190" r="27" fill="#dab250" stroke="#ae8337" stroke-width="3"/><ellipse cx="240" cy="195" rx="28" ry="20" fill="#ead3b7"/><path d="M220 198Q240 216 260 198" fill="none" stroke="#795745" stroke-width="3"/>',
    bow: '<path d="M325 145 Q381 222 325 301Z" fill="none" stroke="#a77540" stroke-width="6"/><path d="M311 224H367 M358 216L367 224L358 232" stroke="#d7ad54" stroke-width="4" fill="none"/>',
    spear: '<path d="M328 309V183" stroke="#b18a3a" stroke-width="7"/><path d="M328 126 Q299 161 328 188 Q357 161 328 126" fill="#ecc868" stroke="#b18a3a" stroke-width="3"/>',
    butter: '<path d="M298 306 Q276 323 295 348H347 Q366 323 344 306Z" fill="#ad714f"/><ellipse cx="321" cy="306" rx="23" ry="8" fill="#fbf0d6"/><path d="M310 309V324 M324 309V319" stroke="#fbf0d6" stroke-width="8" stroke-linecap="round"/>',
    chakra: '<circle cx="327" cy="202" r="24" fill="none" stroke="#d3a23d" stroke-width="8"/><path d="M327 178V226 M303 202H351 M310 185L344 219 M310 219L344 185" stroke="#d3a23d" stroke-width="3"/><path d="M154 214 Q133 175 156 172 Q178 181 154 214" fill="#fff6dd"/>',
  }[kind];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="480" viewBox="0 0 480 480">
    <rect width="480" height="480" fill="${background}"/>
    <circle cx="240" cy="217" r="150" fill="#ffffff" opacity=".24"/>
    <path d="M83 356V208 A157 157 0 0 1 397 208V356" stroke="#fff" stroke-width="2" opacity=".45" fill="none"/>
    <ellipse cx="240" cy="374" rx="115" ry="16" fill="#665744" opacity=".12"/>
    <rect x="143" y="346" width="194" height="25" rx="10" fill="#b79055"/>
    <path d="M181 237 Q240 210 299 237 L313 338 Q240 361 167 338Z" fill="${robe}" stroke="#665744" stroke-opacity=".15" stroke-width="3"/>
    <path d="M187 248Q240 277 295 248 M187 323Q240 345 297 323" fill="none" stroke="#ebcb73" stroke-width="8"/>
    <path d="M187 245Q151 256 160 284 M293 245Q329 256 321 284" stroke="${skin}" stroke-width="21" stroke-linecap="round" fill="none"/>
    ${elephant ? `<ellipse cx="195" cy="179" rx="27" ry="35" fill="${skin}"/><ellipse cx="285" cy="179" rx="27" ry="35" fill="${skin}"/>` : ''}
    <rect x="226" y="209" width="28" height="32" rx="10" fill="${skin}"/>
    <ellipse cx="240" cy="178" rx="${elephant ? 48 : 41}" ry="49" fill="${skin}"/>
    ${crown}
    <path d="M215 178Q221 183 227 178 M253 178Q259 183 265 178" fill="none" stroke="#4d4140" stroke-width="3.5" stroke-linecap="round"/>
    <circle cx="240" cy="163" r="4" fill="#b64037"/>
    ${elephant ? '' : '<path d="M230 201Q240 208 250 201" fill="none" stroke="#945a47" stroke-width="3" stroke-linecap="round"/>'}
    <circle cx="198" cy="192" r="6" fill="#e3bc5c"/><circle cx="282" cy="192" r="6" fill="#e3bc5c"/>
    ${accessories}
    <text x="240" y="419" text-anchor="middle" font-family="sans-serif" font-size="20" letter-spacing="4" fill="#635544">${label}</text>
    <text x="240" y="448" text-anchor="middle" font-family="sans-serif" font-size="12" letter-spacing="3" fill="#82735f">GOLU • SAMPLE COLLECTION</text>
  </svg>`;
  await sharp(Buffer.from(svg)).png().toFile(path.join(output, `${slug}.png`));
}
console.log(`Generated ${figures.length} illustrated sample product images.`);
