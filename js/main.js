// 앱 진입점. Phase 3에서 라우터·앱 셸을 연결합니다.

function renderPlaceholder(root) {
  root.innerHTML = `
    <main class="boot">
      <p class="label">PHASE 0 · 준비 완료</p>
      <h1>Travel Pick</h1>
      <p class="label boot-sub">DECIDE WHERE TO GO</p>
      <p class="muted">앱 셸과 화면은 다음 단계에서 붙습니다.</p>
    </main>`;
}

renderPlaceholder(document.getElementById('app'));
