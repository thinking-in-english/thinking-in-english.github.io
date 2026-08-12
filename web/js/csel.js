/**
 * Custom dropdown ("csel") — replaces native <select> so we control the
 * popup width and text wrapping. iOS Safari renders native selects in a
 * narrow floating menu which breaks long lesson names.
 *
 * Markup:
 *   <div class="csel" id="mySel">
 *     <button type="button" class="csel-trigger">
 *       <span class="csel-value"></span>
 *       <span class="csel-caret">▾</span>
 *     </button>
 *     <input type="hidden" id="myInput">
 *   </div>
 *
 * Use APP.csel.setOptions(containerId, hiddenId, options) to fill it, and
 * read the current value from the hidden input (a native 'change' event
 * is dispatched on it whenever the user picks a new option).
 */
window.APP = window.APP || {};

APP.csel = (function () {

  var currentSheet = null;

  /**
   * @param {string} containerId id of the .csel wrapper
   * @param {string} hiddenId id of the hidden input inside it
   * @param {Array<{value:string, label:string}>} options
   * @param {string|number} [selectedValue] initial value; defaults to first
   */
  function setOptions(containerId, hiddenId, options, selectedValue) {
    var container = document.getElementById(containerId);
    var hidden = document.getElementById(hiddenId);
    if (!container || !hidden) { return; }

    container._cselOptions = options;
    var initial = String(selectedValue !== undefined ? selectedValue : (options[0] && options[0].value));
    setValue(container, hidden, initial, false);

    if (!container._cselWired) {
      container._cselWired = true;
      container.querySelector('.csel-trigger').addEventListener('click', function () {
        openSheet(container, hidden);
      });
    }
  }

  function setValue(container, hidden, value, dispatchChange) {
    hidden.value = String(value);
    var options = container._cselOptions || [];
    var found = options.find(function (o) { return String(o.value) === String(value); });
    container.querySelector('.csel-value').textContent = found ? found.label : String(value);
    if (dispatchChange) {
      hidden.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function openSheet(container, hidden) {
    closeSheet();

    var options = container._cselOptions || [];
    var backdrop = document.createElement('div');
    backdrop.className = 'csel-backdrop';

    var sheet = document.createElement('div');
    sheet.className = 'csel-sheet';

    options.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'csel-option';
      if (String(opt.value) === String(hidden.value)) {
        btn.classList.add('is-selected');
      }
      btn.innerHTML = '<span class="csel-option-check">' +
        (String(opt.value) === String(hidden.value) ? '✓' : '') +
        '</span><span class="csel-option-text"></span>';
      btn.querySelector('.csel-option-text').textContent = opt.label;
      btn.addEventListener('click', function () {
        setValue(container, hidden, opt.value, true);
        closeSheet();
      });
      sheet.appendChild(btn);
    });

    backdrop.addEventListener('click', function (e) {
      if (e.target === backdrop) { closeSheet(); }
    });

    document.body.appendChild(backdrop);
    backdrop.appendChild(sheet);
    currentSheet = backdrop;

    var esc = function (e) {
      if (e.key === 'Escape') { closeSheet(); }
    };
    document.addEventListener('keydown', esc);
    backdrop._escHandler = esc;
  }

  function closeSheet() {
    if (!currentSheet) { return; }
    if (currentSheet._escHandler) {
      document.removeEventListener('keydown', currentSheet._escHandler);
    }
    currentSheet.remove();
    currentSheet = null;
  }

  return { setOptions: setOptions };
})();
