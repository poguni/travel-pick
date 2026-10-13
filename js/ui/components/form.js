// 입력 컴포넌트. 글자 입력은 칸을 벗어나거나 Enter를 누를 때 onCommit 한 번 호출.
// 화면을 다시 그려도 포커스를 되찾을 수 있도록 모든 입력에 고정 id를 준다.
import { h } from '../dom.js';

/** 라벨(Mono) + 입력 + 도움말/오류 */
export function field({ id, label, hint, children, className }) {
  const hintId = hint ? `${id}-hint` : null;
  return h(
    'div',
    { class: ['field', className] },
    h('label', { class: 'field__label', for: id }, label),
    children,
    hint && h('span', { class: 'field__hint', id: hintId }, hint),
  );
}

/** onCommit(value): change(칸 벗어남) 또는 Enter에서 값이 바뀌었을 때만 */
export function textInput({ id, value = '', onCommit, type = 'text', placeholder, list, inputmode, min, max, step, maxlength, disabled, hint, ariaLabel, className }) {
  let committed = String(value ?? '');
  const commit = (el) => {
    if (el.value === committed) return;
    committed = el.value;
    el.dataset.committed = committed; // 다시 그릴 때 "저장 안 된 입력"인지 판단용 (main.js withFocusKept)
    onCommit?.(el.value);
  };
  return h('input', {
    id,
    dataset: { committed },
    class: ['input', className],
    type,
    value: committed,
    placeholder,
    list,
    inputmode,
    min,
    max,
    step,
    maxlength,
    disabled,
    'aria-label': ariaLabel,
    'aria-describedby': hint ? `${id}-hint` : null,
    autocomplete: 'off',
    // 칸을 벗어날 때는 포커스가 다음 칸으로 옮겨진 뒤에 저장(=다시 그리기)해야 그 클릭이 사라지지 않는다
    onChange: (e) => {
      const el = e.target;
      setTimeout(() => commit(el), 0);
    },
    onKeydown: (e) => {
      if (e.key === 'Enter' && !e.isComposing && e.target.form == null) {
        e.preventDefault();
        commit(e.target);
      }
    },
  });
}

export function selectInput({ id, value, options, onCommit, ariaLabel, className }) {
  return h(
    'select',
    { id, class: ['input', 'input--select', className], 'aria-label': ariaLabel, onChange: (e) => onCommit?.(e.target.value) },
    options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)),
  );
}

export function datalist(id, values) {
  return h('datalist', { id }, values.map((v) => h('option', { value: v })));
}

/**
 * 선택 버튼 묶음 (단일 또는 다중). selected: 값 또는 값 배열.
 * 버튼 id = `${idPrefix}-${value}` (다시 그린 뒤 포커스 복원용)
 */
export function choiceGroup({ label, idPrefix, options, selected, onSelect, variant = 'chip' }) {
  const isOn = (v) => (Array.isArray(selected) ? selected.includes(v) : selected === v);
  return h(
    'div',
    { class: ['choices', `choices--${variant}`], role: 'group', 'aria-label': label },
    options.map((o) =>
      h(
        'button',
        {
          type: 'button',
          id: `${idPrefix}-${o.value}`,
          class: 'choice',
          'aria-pressed': String(isOn(o.value)),
          disabled: o.disabled,
          title: o.title,
          onClick: () => onSelect(o.value),
        },
        o.label,
      ),
    ),
  );
}
