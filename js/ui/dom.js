// DOM 생성 도우미. 문자열 자식은 항상 텍스트 노드로 넣는다(innerHTML 사용 안 함 → XSS 방지).

const SVG_NS = 'http://www.w3.org/2000/svg';

function setProps(el, props, isSvg) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === 'class') {
      const cls = Array.isArray(value) ? value.filter(Boolean).join(' ') : value;
      if (cls) el.setAttribute('class', cls);
    } else if (key === 'style' && typeof value === 'object') {
      for (const [prop, v] of Object.entries(value)) {
        if (v == null) continue;
        if (prop.startsWith('--')) el.style.setProperty(prop, v);
        else el.style[prop] = v;
      }
    } else if (key === 'dataset') {
      Object.assign(el.dataset, value);
    } else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (!isSvg && (key === 'value' || key === 'checked')) {
      el[key] = value;
    } else {
      el.setAttribute(key, value === true ? '' : String(value));
    }
  }
}

function appendChildren(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** HTML 요소 만들기: h('button', { class: 'btn', onClick }, '라벨', iconEl) */
export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  setProps(el, props, false);
  appendChildren(el, children);
  return el;
}

/** SVG 요소 만들기 */
export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  setProps(el, props, true);
  appendChildren(el, children);
  return el;
}

/** 컨테이너 내용을 통째로 바꾸기 */
export function mount(container, ...nodes) {
  container.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
}
