// 파일 내려받기·이름 규칙 (PRD F13-7: TravelPick_<이름>_<YYYYMMDD>.<확장자>)

export function yyyymmdd(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
}

/** 파일 이름에 쓸 수 없는 글자를 _로 */
export function exportFileName(name, ext, date = new Date()) {
  const safe = String(name).replace(/[\\/:*?"<>|\s]+/g, '_').replace(/^_+|_+$/g, '') || '여행';
  return `TravelPick_${safe}_${yyyymmdd(date)}.${ext}`;
}

export function downloadText(filename, text, mime = 'application/json') {
  downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}

export function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
