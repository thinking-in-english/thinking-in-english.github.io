/**
 * Modal — friendly in-app replacement for window.confirm / window.alert.
 * Returns a Promise so callers can await the user's choice.
 */
window.APP = window.APP || {};

APP.modal = (function () {

  function els() {
    return {
      backdrop: document.getElementById('modalBackdrop'),
      icon: document.getElementById('modalIcon'),
      title: document.getElementById('modalTitle'),
      msg: document.getElementById('modalMsg'),
      ok: document.getElementById('modalOkBtn'),
      cancel: document.getElementById('modalCancelBtn'),
      actions: document.querySelector('#modalBackdrop .modal-actions')
    };
  }

  function open(opts, mode) {
    var e = els();
    e.icon.textContent = opts.icon || (mode === 'confirm' ? '❓' : 'ℹ️');
    e.title.textContent = opts.title || (mode === 'confirm' ? 'Are you sure?' : 'Heads up');
    if (opts.html) {
      e.msg.innerHTML = opts.html;
    } else {
      e.msg.textContent = opts.message || '';
    }
    e.msg.className = 'modal-msg' + (opts.scrollable ? ' scrollable' : '');
    e.ok.textContent = opts.okLabel || 'OK';
    e.cancel.textContent = opts.cancelLabel || 'Cancel';
    e.ok.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');

    if (mode === 'confirm') {
      e.actions.classList.remove('single');
      e.cancel.hidden = false;
    } else {
      e.actions.classList.add('single');
      e.cancel.hidden = true;
    }

    e.backdrop.hidden = false;
    return new Promise(function (resolve) {
      function cleanup(result) {
        e.backdrop.hidden = true;
        e.ok.removeEventListener('click', onOk);
        e.cancel.removeEventListener('click', onCancel);
        e.backdrop.removeEventListener('click', onBackdrop);
        document.removeEventListener('keydown', onKey);
        resolve(result);
      }
      function onOk() { cleanup(true); }
      function onCancel() { cleanup(false); }
      function onBackdrop(evt) { if (evt.target === e.backdrop) { cleanup(false); } }
      function onKey(evt) {
        if (evt.key === 'Escape') { cleanup(false); }
        else if (evt.key === 'Enter') { cleanup(true); }
      }
      e.ok.addEventListener('click', onOk);
      e.cancel.addEventListener('click', onCancel);
      e.backdrop.addEventListener('click', onBackdrop);
      document.addEventListener('keydown', onKey);
    });
  }

  function confirm(opts) { return open(opts || {}, 'confirm'); }
  function notice(opts) { return open(opts || {}, 'notice'); }

  return { confirm: confirm, notice: notice };
})();