// 테스트용 Web Storage 대역. quota(글자 수)를 넘기면 브라우저처럼 QuotaExceededError를 던진다.
export class MemoryStorage {
  constructor({ quota = Infinity } = {}) {
    this.map = new Map();
    this.quota = quota;
  }
  get length() {
    return this.map.size;
  }
  key(i) {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k) {
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    const value = String(v);
    const used = [...this.map].reduce((n, [key, val]) => (key === k ? n : n + key.length + val.length), 0);
    if (used + k.length + value.length > this.quota) {
      throw new DOMException('quota exceeded', 'QuotaExceededError');
    }
    this.map.set(k, value);
  }
  removeItem(k) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}
