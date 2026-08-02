/* eslint-disable-next-line no-unused-vars -- called from admin HTML pages */
function initStreamUpload(lessonId, lang) {
  var container = document.getElementById('stream-upload-container');
  if (!container) return;
  lang = lang || 'ru';

  var cfInput = document.getElementById('f-cf-uid');
  var urlInput = document.getElementById('f-video-url');
  var providerSel = document.getElementById('f-video-provider');
  var existingUid = cfInput ? cfInput.value.trim() : '';
  var provider = providerSel ? providerSel.value : 'cloudflare';
  var hasLocalVideo = urlInput && urlInput.value.trim().length > 0 && urlInput.value.trim().match(/\.(mp4|mov|webm|avi|mkv)$/i);

  var html = '' +
    '<div style="margin-top:0.5rem;border:1px solid var(--admin-border);border-radius:6px;padding:0.75rem;">' +
      '<div style="font-weight:600;font-size:0.85rem;margin-bottom:0.5rem;">Видео (Mux)</div>';

  if (existingUid) {
    html += '<div id="stream-existing" style="font-size:0.8rem;margin-bottom:0.5rem;color:var(--admin-success);">✅ Текущий ID: <code>' + esc(existingUid) + '</code> <span style="opacity:0.6;">(' + esc(provider === 'mux' ? 'Mux' : 'Cloudflare') + ')</span></div>';
  } else if (hasLocalVideo) {
    html += '<div style="font-size:0.8rem;margin-bottom:0.5rem;color:var(--admin-text-muted);">📁 Локальное видео: <code>' + esc(urlInput.value.trim()) + '</code></div>';
  }

  html += '<div><input type="file" id="stream-file-input" accept=".mp4,.mov,.webm" style="font-size:0.85rem;"></div>' +
    '<div style="margin-top:0.5rem;display:flex;gap:0.5rem;flex-wrap:wrap;">' +
      '<button class="btn btn--primary btn--sm" id="btn-stream-upload" disabled>' + (existingUid ? 'Заменить видео' : 'Загрузить через Mux') + '</button>';

  if (existingUid) {
    html += '<button class="btn btn--danger btn--sm" id="btn-stream-delete">Удалить видео</button>';
  }

  html += '</div>' +
    '<div id="stream-progress" style="display:none;margin-top:0.5rem;">' +
      '<div style="background:var(--admin-border);border-radius:4px;height:8px;overflow:hidden;">' +
        '<div id="stream-progress-bar" style="width:0%;height:100%;background:var(--admin-success);border-radius:4px;transition:width .3s;"></div>' +
      '</div>' +
      '<div id="stream-status" style="font-size:0.8rem;margin-top:0.3rem;"></div>' +
    '</div>' +
    '<div id="stream-result" style="display:none;margin-top:0.5rem;font-size:0.85rem;"></div>' +
    '<div style="font-size:0.75rem;margin-top:0.5rem;color:var(--admin-text-muted);">После загрузки ID попадёт в поле «Видео ID» — сохраните урок.</div>' +
  '</div>';

  container.innerHTML = html;

  var fileInput = document.getElementById('stream-file-input');
  var uploadBtn = document.getElementById('btn-stream-upload');
  var deleteBtn = document.getElementById('btn-stream-delete');

  fileInput.addEventListener('change', function () {
    uploadBtn.disabled = !fileInput.files.length;
  });

  if (deleteBtn) {
    deleteBtn.addEventListener('click', function () {
      if (!confirm('Удалить видео из этого урока? Видео останется на хостинге.')) return;
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Удаление...';
      var token = localStorage.getItem('admin_token');
      fetch('/api/admin/lessons/' + lessonId + '/video', {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + token }
      }).then(function (r) { return r.json(); }).then(function () {
        if (cfInput) { cfInput.value = ''; cfInput.dispatchEvent(new Event('input', { bubbles: true })); }
        location.reload();
      }).catch(function () {
        deleteBtn.disabled = false;
        deleteBtn.textContent = 'Удалить видео';
        alert('Ошибка удаления');
      });
    });
  }

  uploadBtn.addEventListener('click', async function () {
    var file = fileInput.files[0];
    if (!file) return;

    if (existingUid && !confirm('Загружается новое видео вместо текущего. Старое останется на хостинге. Продолжить?')) return;

    uploadBtn.disabled = true;
    fileInput.disabled = true;

    var progressDiv = document.getElementById('stream-progress');
    var progressBar = document.getElementById('stream-progress-bar');
    var statusDiv = document.getElementById('stream-status');
    var resultDiv = document.getElementById('stream-result');
    progressDiv.style.display = 'block';
    resultDiv.style.display = 'none';
    progressBar.style.background = 'var(--admin-success)';

    var token = localStorage.getItem('admin_token');

    try {
      var createRes = await fetch('/api/admin/lessons/' + lessonId + '/video/mux-upload', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: lang, filename: file.name })
      });
      var createData = await createRes.json();
      if (!createRes.ok) {
        showError(resultDiv, statusDiv, createData.error || 'Не удалось создать загрузку Mux');
        return;
      }

      statusDiv.textContent = 'Загрузка в Mux... (' + formatBytes(file.size) + ')';
      progressBar.style.width = '10%';

      var xhr = new XMLHttpRequest();
      xhr.open('PUT', createData.url, true);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');

      xhr.upload.onprogress = function (e) {
        if (e.lengthComputable) {
          var pct = Math.round((e.loaded / e.total) * 80 + 10);
          progressBar.style.width = pct + '%';
          statusDiv.textContent = 'Загрузка в Mux... ' + Math.round((e.loaded / e.total) * 100) + '%';
        }
      };

      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 400) {
          progressBar.style.width = '92%';
          statusDiv.textContent = 'Передано в Mux, обработка...';
          startPolling(createData.id, resultDiv, statusDiv, progressBar, cfInput, urlInput, providerSel);
        } else {
          showError(resultDiv, statusDiv, 'Mux rejected upload (HTTP ' + xhr.status + ')');
        }
      };

      xhr.onerror = function () {
        showError(resultDiv, statusDiv, 'Сетевая ошибка при загрузке в Mux.');
      };

      xhr.send(file);
    } catch (err) {
      showError(resultDiv, statusDiv, err.message);
    }
  });
}

function startPolling(uploadId, resultDiv, statusDiv, progressBar, cfInput, urlInput, providerSel) {
  var attempts = 0;
  var maxAttempts = 120;
  var statusLabels = {
    uploading: '📤 Загрузка/обработка',
    pending: '⏳ Ожидание',
    processing: '⚙️ Обработка',
    ready: '✅ Готово',
    error: '❌ Ошибка'
  };

  function poll() {
    attempts++;
    window.api.get('/api/admin/video-uploads/' + uploadId + '/status').then(function (data) {
      if (!data) { setTimeout(poll, 3000); return; }

      statusDiv.textContent = statusLabels[data.status] || data.status;
      var status = data.status;

      if (status === 'pending' || status === 'uploading' || status === 'processing') {
        setTimeout(poll, 3000);
      } else if (status === 'ready') {
        progressBar.style.width = '100%';
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span style="color:var(--admin-success);font-weight:600;">✅ Видео готово</span>' +
          '<div style="margin-top:0.3rem;font-size:0.8rem;">Mux playback ID: <code>' + esc(data.mux_playback_id || '') + '</code></div>' +
          '<div style="margin-top:0.3rem;font-size:0.8rem;color:var(--admin-text-muted);">ID подставлен в форму — нажмите «Сохранить».</div>';
        if (cfInput && data.mux_playback_id) {
          cfInput.value = data.mux_playback_id;
          cfInput.dispatchEvent(new Event('input', { bubbles: true }));
          cfInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        if (providerSel) {
          providerSel.value = 'mux';
        }
        if (urlInput && urlInput.value.trim()) {
          urlInput.value = '';
          urlInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        document.getElementById('stream-file-input').disabled = false;
      } else if (status === 'error') {
        progressBar.style.width = '100%';
        progressBar.style.background = 'var(--admin-danger)';
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span style="color:var(--admin-danger);font-weight:600;">❌ Ошибка</span>' +
          '<div style="margin-top:0.3rem;font-size:0.8rem;">' + esc(data.error_message || 'Неизвестная ошибка') + '</div>' +
          '<button class="btn btn--secondary btn--sm" style="margin-top:0.5rem;" onclick="location.reload()">Повторить</button>';
        document.getElementById('btn-stream-upload').disabled = false;
      }

      if (attempts >= maxAttempts && status !== 'ready' && status !== 'error') {
        resultDiv.style.display = 'block';
        resultDiv.innerHTML = '<span style="color:var(--admin-danger);">⏱ Таймаут ожидания. Проверьте статус позже.</span>';
      }
    }).catch(function () {
      if (attempts < maxAttempts) setTimeout(poll, 5000);
    });
  }

  setTimeout(poll, 2000);
}

function showError(resultDiv, statusDiv, msg) {
  var bar = document.getElementById('stream-progress-bar');
  if (bar) { bar.style.width = '100%'; bar.style.background = 'var(--admin-danger)'; }
  statusDiv.textContent = '❌ ' + msg;
  resultDiv.style.display = 'block';
  resultDiv.innerHTML = '<span style="color:var(--admin-danger);font-weight:600;">❌ ' + esc(msg) + '</span>' +
    '<button class="btn btn--secondary btn--sm" style="margin-top:0.5rem;display:block;" onclick="location.reload()">Повторить</button>';
  var uploadBtn = document.getElementById('btn-stream-upload');
  if (uploadBtn) uploadBtn.disabled = false;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  var k = 1024;
  var sizes = ['B', 'KB', 'MB', 'GB'];
  var i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
