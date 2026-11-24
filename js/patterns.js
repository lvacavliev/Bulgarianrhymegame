/* Rimoboy: rhyme patterns (M2). Data: BUILD.md section 4.2.
   beats: [group, beat]. beat = 1-based cell inside one cycle of `dur` cells.
   Every group in a cycle gets a new rhyme family and a new colour. */
(function () {
  'use strict';
  window.PATTERNS = [
    { id: 'aabb', name: 'AABB', def: true, dur: 16, beats: [[1, 4], [1, 8], [2, 12], [2, 16]],
      hint: 'Двойки рими в края на всеки бар' },
    { id: 'aaaa', name: 'AAAA', dur: 16, beats: [[1, 4], [1, 8], [1, 12], [1, 16]],
      hint: 'Четири бара на една рима' },
    { id: 'abab', name: 'ABAB', dur: 16, beats: [[1, 4], [2, 8], [1, 12], [2, 16]],
      hint: 'Кръстосана рима' },
    { id: 'aa_a', name: 'AA_A', dur: 32, beats: [[1, 4], [1, 8], [1, 16], [2, 20], [2, 24], [2, 32]],
      hint: 'Прескочи един бар' },
    { id: 'aAaA', name: 'aAaA', dur: 16, beats: [[1, 2], [1, 4], [1, 6], [1, 8], [2, 10], [2, 12], [2, 14], [2, 16]],
      hint: 'Двойно темпо: рима на всеки половин бар' },
    { id: 'aAbB', name: 'aAbB', dur: 16, beats: [[1, 2], [1, 4], [2, 6], [2, 8], [3, 10], [3, 12], [4, 14], [4, 16]],
      hint: 'Двойно темпо, двойки' },
    { id: 'aBaB', name: 'aBaB', dur: 16, beats: [[1, 2], [2, 4], [1, 6], [2, 8], [3, 10], [4, 12], [3, 14], [4, 16]],
      hint: 'Двойно темпо, кръстосано' },
    { id: 'aA_A', name: 'aA_A', dur: 16, beats: [[1, 2], [1, 4], [1, 8], [2, 10], [2, 12], [2, 16]],
      hint: 'Вътрешна рима в първия ред' },
    { id: '_AaA', name: '_AaA', dur: 16, beats: [[1, 4], [1, 6], [1, 8], [2, 12], [2, 14], [2, 16]],
      hint: 'Вътрешна рима във втория ред' },
    { id: '_A_A_B_B', name: '_A_A_B_B', dur: 32, beats: [[1, 8], [1, 16], [2, 24], [2, 32]],
      hint: 'Рима на всеки втори бар' },
  ];
  window.PATTERNS.byId = (id) => window.PATTERNS.find((p) => p.id === id) || window.PATTERNS[0];
})();
