// 한국어 문장 도우미. DOM 없음.

// 마지막 글자에 받침이 있으면 [받침 있을 때, 없을 때] 중 앞의 조사를 붙인다. 한글이 아니면 받침 없는 쪽.
export function josa(word, [withTail, noTail]) {
  const c = word.charCodeAt(word.length - 1);
  const hangul = c >= 0xAC00 && c <= 0xD7A3;
  const tail = hangul && (c - 0xAC00) % 28 > 0;
  return word + (tail ? withTail : noTail);
}

// 결과 공유 문장
export function shareText({ me, them, L, R, result }) {
  const ending = result === 'win' ? '이겼다!' : result === 'lose' ? '졌다…' : '비겼다!';
  return `ULSAN HD FC 일대일축구에서 ${josa(me, ['으로', '로'])} ${josa(them, ['을', '를'])} ${L}:${R}로 ${ending}`;
}
