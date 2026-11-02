import type { ModelId } from '../game/config';

// A set of self-contained illustrated miniatures. No fetched images or broken
// asset links: the window, model and plinth render on the very first visit.
export function miniatureSvg(id: ModelId): string {
  const base =
    '<ellipse cx="65" cy="87" rx="43" ry="10" fill="#070c09" opacity=".7"/>' +
    '<path d="M24 76 65 64 106 76 65 92Z" fill="#2e4036" stroke="#cac7af" stroke-width="1.5"/>' +
    '<path d="M24 76 65 92V97L24 82Z" fill="#1c2b24" stroke="#89978a"/>' +
    '<path d="M65 92 106 76V82L65 97Z" fill="#14201a" stroke="#89978a"/>' +
    '<path d="M32 77 65 68 98 77 65 87Z" fill="#c2ab76" fill-opacity=".12" stroke="#abb7a4" stroke-opacity=".5"/>';

  let model = '';
  if (id === 'lamp') {
    model =
      '<ellipse cx="65" cy="69" rx="13" ry="4" fill="#101d18" stroke="#ded5b9"/>' +
      '<path d="M62 69 63 31 67 31 68 69Z" fill="#b5b9ac" stroke="#efead9"/>' +
      '<path d="M60 31H70L72 24 58 24Z" fill="#697667" stroke="#e7ddc3"/>' +
      '<circle cx="65" cy="16" r="22" fill="#c9a66a" fill-opacity=".14"/>' +
      '<path d="M60 3H70L77 7 73 24H57L53 7Z" fill="#c9a66a" fill-opacity=".3" stroke="#f1e2bc" stroke-width="2"/>' +
      '<path d="M56 9H74M65 3V24M58 9 61 22M72 9 69 22M52 7 65 -1 78 7" stroke="#f0e7d1" stroke-width="1.5" fill="none"/>';
  } else if (id === 'tree') {
    model =
      '<path d="M64 73 62 44 58 30 64 23 69 42 70 73Z" fill="#7e7f67" stroke="#ddd2b4" stroke-width="1.7"/>' +
      '<path d="M65 55 47 38M65 46 79 30M64 38 54 20" stroke="#d5c7a7" stroke-width="3" fill="none"/>' +
      '<path d="M37 31Q25 14 42 10Q47 -2 61 4Q72 -8 85 4Q104 2 98 23Q108 37 91 43Q89 58 72 54Q54 64 44 49Q26 50 30 38Z" fill="#728e7d" fill-opacity=".67" stroke="#d3dfce" stroke-width="2"/>' +
      '<path d="M35 20q10 -9 22 -4 M67 7q11 1 14 11 M43 40q8 7 16 4 M76 37q11 3 16 -8 M54 26q16 -5 24 6" stroke="#e6e6d5" stroke-width="1.5" opacity=".75" fill="none"/>';
  } else if (id === 'bench') {
    model =
      '<path d="M33 63 71 51 93 58 54 72Z" fill="#88795f" stroke="#e7d8bd" stroke-width="1.8"/>' +
      '<path d="M34 45 70 33 92 42 55 54Z" fill="#927c60" stroke="#e7d8bd" stroke-width="1.8"/>' +
      '<path d="M34 45V59L55 68V54M70 33V49L92 58V42" stroke="#d5c9aa" stroke-width="1.8" fill="none"/>' +
      '<path d="M41 44 78 34M47 49 85 39M39 60 76 49M46 65 84 54" stroke="#ebdbba" stroke-width="1.4"/>' +
      '<path d="M43 68 40 77M83 62 85 76M32 57 28 70M93 58 99 69" stroke="#dfd8c7" stroke-width="3" fill="none"/>';
  } else if (id === 'limit') {
    model =
      '<path d="M63 75V45H68V75" fill="#a4afa5" stroke="#e6e3d2"/>' +
      '<circle cx="65" cy="27" r="25" fill="#eeebdd" stroke="#b6a888" stroke-width="2"/>' +
      '<circle cx="65" cy="27" r="21" fill="none" stroke="#bf8c7d" stroke-width="5"/>' +
      '<text x="65" y="35" text-anchor="middle" font-size="23" font-weight="700" font-family="Georgia, serif" fill="#1b2420">20</text>' +
      '<path d="M59 75 72 75" stroke="#e1d8c2" stroke-width="2"/>';
  } else if (id === 'bin') {
    model =
      '<path d="M48 76 42 32 84 32 80 76 65 82Z" fill="#5f7568" stroke="#e8e6ce" stroke-width="2"/>' +
      '<path d="M65 38V80M49 45 65 49 83 45M51 63 65 67 81 63" stroke="#c9d2be" stroke-width="1.4" opacity=".8" fill="none"/>' +
      '<path d="M39 31 45 20 82 20 89 31 66 39Z" fill="#9cae9c" stroke="#f0edcf" stroke-width="2"/>' +
      '<path d="M48 19Q65 6 81 19" fill="none" stroke="#bfcbb3" stroke-width="2"/>' +
      '<path d="M50 53h12v12H50z" fill="#d0c3a0" fill-opacity=".2" stroke="#e1d7b9"/>' +
      '<path d="M54 56l5 5M59 56l-5 5" stroke="#e8e0c8"/>' +
      '<path d="M54 80 49 86M77 80 82 86" fill="none" stroke="#d7d8c7" stroke-width="2"/>';
  } else {
    model =
      '<path d="M43 71V27L65 18 87 27V71L65 79Z" fill="#5c7381" fill-opacity=".8" stroke="#dbddce" stroke-width="2"/>' +
      '<path d="M43 27 65 35 87 27M65 35V79M43 36 65 43 87 36" stroke="#d5dfd6" stroke-width="1.5" fill="none"/>' +
      '<path d="M39 27 65 13 91 27 65 36Z" fill="#8d9a8e" stroke="#e5dfc7" stroke-width="1.8"/>' +
      '<path d="M49 45 59 48V61L49 58ZM70 48 80 44V58L70 61Z" fill="#c7d6d1" fill-opacity=".34" stroke="#e0e8de"/>' +
      '<path d="M59 75V65L65 67 71 65V75" stroke="#e5e4d9" fill="none"/>' +
      '<path d="M62 26 68 26M65 23V29" stroke="#e6d7af" stroke-width="2"/>';
  }

  return '<svg class="miniature-svg" viewBox="0 0 130 104" xmlns="http://www.w3.org/2000/svg" ' +
    'role="img" aria-label="Miniature ' + id + ' on a display base">' + base + model + '</svg>';
}
