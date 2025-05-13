document.addEventListener('DOMContentLoaded', function () {
  // トポロジーキャンバスがあれば初期化
  const topologyCanvas = document.getElementById('topology-canvas');
  if (topologyCanvas && typeof topologyData !== 'undefined') {
    initializeTopology(topologyCanvas, topologyData);
  }

  // トラフィックシミュレーションボタン
  const simulateTrafficBtn = document.getElementById('simulate-traffic');
  if (simulateTrafficBtn) {
    simulateTrafficBtn.addEventListener('click', function () {
      alert('この機能は実装中です...');
    });
  }
});

// トポロジーの描画
function initializeTopology(canvas, data) {
  // キャンバスの幅と高さを設定
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;

  // SVG要素を作成
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', width);
  svg.setAttribute('height', height);
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  canvas.appendChild(svg);

  // ルーターの位置を計算（円状に配置）
  const routerPositions = {};
  const centerX = width / 2;
  const centerY = height / 2;
  const radius = Math.min(width, height) * 0.35;

  data.routers.forEach((router, index) => {
    const angle = (2 * Math.PI * index) / data.routers.length;
    const x = centerX + radius * Math.cos(angle);
    const y = centerY + radius * Math.sin(angle);
    routerPositions[router.id] = { x, y };
  });

  // リンクを描画（ルーターの間の線）
  data.links.forEach(link => {
    const pos1 = routerPositions[link.endpoint1.routerId];
    const pos2 = routerPositions[link.endpoint2.routerId];

    if (pos1 && pos2) {
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', pos1.x);
      line.setAttribute('y1', pos1.y);
      line.setAttribute('x2', pos2.x);
      line.setAttribute('y2', pos2.y);
      line.setAttribute('stroke', link.isUp ? '#2ecc71' : '#e74c3c');
      line.setAttribute('stroke-width', 3);

      // リンク情報をツールチップとして表示
      line.setAttribute('data-link-id', link.id);
      line.setAttribute('class', 'link');

      line.addEventListener('mouseover', function (e) {
        showTooltip(e, `リンク ${link.id}: ${link.isUp ? '稼働中' : '停止中'}`);
      });

      line.addEventListener('mouseout', function () {
        hideTooltip();
      });

      svg.appendChild(line);
    }
  });

  // ルーターをノードとして描画
  data.routers.forEach(router => {
    const pos = routerPositions[router.id];

    if (pos) {
      // ルーターのノード（円）
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pos.x);
      circle.setAttribute('cy', pos.y);
      circle.setAttribute('r', 20);
      circle.setAttribute('fill', '#3498db');

      // ルーター情報をツールチップとして表示
      circle.setAttribute('data-router-id', router.id);
      circle.setAttribute('class', 'router');

      circle.addEventListener('mouseover', function (e) {
        const interfaceInfo = router.interfaces.map(iface =>
          `${iface.name}: ${iface.ip} (${iface.isUp ? 'UP' : 'DOWN'})`
        ).join('<br>');

        showTooltip(e, `<strong>${router.name}</strong> (${router.id})<br>${interfaceInfo}`);
      });

      circle.addEventListener('mouseout', function () {
        hideTooltip();
      });

      circle.addEventListener('click', function () {
        window.location.href = `/router/${router.id}`;
      });

      svg.appendChild(circle);

      // ルーター名のラベル
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', pos.x);
      text.setAttribute('y', pos.y + 35);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#2c3e50');
      text.textContent = router.name;
      svg.appendChild(text);
    }
  });

  // ズーム機能
  const zoomIn = document.getElementById('zoom-in');
  const zoomOut = document.getElementById('zoom-out');
  const resetView = document.getElementById('reset-view');

  let scale = 1;
  let translateX = 0;
  let translateY = 0;

  if (zoomIn) {
    zoomIn.addEventListener('click', function () {
      scale *= 1.2;
      updateTransform();
    });
  }

  if (zoomOut) {
    zoomOut.addEventListener('click', function () {
      scale /= 1.2;
      updateTransform();
    });
  }

  if (resetView) {
    resetView.addEventListener('click', function () {
      scale = 1;
      translateX = 0;
      translateY = 0;
      updateTransform();
    });
  }

  function updateTransform() {
    svg.style.transform = `translate(${translateX}px, ${translateY}px) scale(${scale})`;
  }

  // ドラッグ機能
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;

  svg.addEventListener('mousedown', function (e) {
    if (e.target === svg) {
      isDragging = true;
      dragStartX = e.clientX - translateX;
      dragStartY = e.clientY - translateY;
    }
  });

  document.addEventListener('mousemove', function (e) {
    if (isDragging) {
      translateX = e.clientX - dragStartX;
      translateY = e.clientY - dragStartY;
      updateTransform();
    }
  });

  document.addEventListener('mouseup', function () {
    isDragging = false;
  });
}

// ツールチップ
let tooltip = null;

function showTooltip(event, content) {
  if (!tooltip) {
    tooltip = document.createElement('div');
    tooltip.className = 'tooltip';
    tooltip.style.position = 'absolute';
    tooltip.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    tooltip.style.color = 'white';
    tooltip.style.padding = '5px 10px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.zIndex = '1000';
    tooltip.style.pointerEvents = 'none';
    document.body.appendChild(tooltip);
  }

  tooltip.innerHTML = content;
  tooltip.style.left = (event.pageX + 10) + 'px';
  tooltip.style.top = (event.pageY + 10) + 'px';
  tooltip.style.display = 'block';
}

function hideTooltip() {
  if (tooltip) {
    tooltip.style.display = 'none';
  }
}
