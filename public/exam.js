const app = document.querySelector('#exam-app');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let attempt;
let answers = {};
let page = 0;
let submitting = false;
let startRequestId;
const storage = {
  get(key) { try { return localStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { localStorage.setItem(key, value); } catch { /* The examination still works without local storage. */ } },
  remove(key) { try { localStorage.removeItem(key); } catch { /* Best effort. */ } },
};
async function api(path, data) {
  const response = await fetch(path, { method: data ? 'POST' : 'GET', credentials: 'same-origin', headers: data ? { 'Content-Type': 'application/json' } : {}, body: data ? JSON.stringify(data) : undefined });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The filing desk could not complete that request. Please try again.');
  return result;
}
function save() { storage.set(`bcl-answers:${attempt.id}`, JSON.stringify({ answers, page })); }
function focusHeading() { document.querySelector('#question-heading, #result-heading')?.focus(); }
function loadAttempt(value) {
  attempt = value;
  answers = {};
  page = 0;
  try {
    const saved = JSON.parse(storage.get(`bcl-answers:${attempt.id}`));
    if (saved) {
      for (const q of attempt.questions) if (q.options.some(o => o.id === saved.answers?.[q.id])) answers[q.id] = saved.answers[q.id];
      page = Number.isInteger(saved.page) ? Math.max(0, Math.min(saved.page, attempt.questions.length - 1)) : 0;
    }
  } catch { /* Ignore stale or malformed local drafts. */ }
  if (attempt.result) showResult(attempt.result, false);
  else renderQuestion();
}
function renderQuestion(focus = false) {
  const q = attempt.questions[page];
  const complete = Object.keys(answers).length;
  app.innerHTML = `<div class="exam-progress"><span>QUESTION ${String(page + 1).padStart(2, '0')} / ${attempt.questions.length}</span><span id="answered-count">${complete} answered</span></div><progress value="${complete}" max="${attempt.questions.length}" aria-label="Questions answered">${complete} of ${attempt.questions.length}</progress><form id="question-form"><fieldset><legend id="question-heading" tabindex="-1">${escape(q.prompt)}</legend><div class="options">${q.options.map((option, i) => `<label class="option"><input type="radio" name="answer" value="${option.id}" ${answers[q.id] === option.id ? 'checked' : ''}><span class="option-letter" aria-hidden="true">${String.fromCharCode(65 + i)}</span><span>${escape(option.text)}</span></label>`).join('')}</div></fieldset><div class="question-actions"><button type="button" class="secondary" id="previous" ${page === 0 ? 'disabled' : ''}>← Previous</button>${page < attempt.questions.length - 1 ? '<button type="submit" class="primary">Next question →</button>' : '<button type="submit" class="primary">Review &amp; submit →</button>'}</div><p id="question-status" role="status" class="form-status"></p></form><nav class="question-jumps" aria-label="Jump to question">${attempt.questions.map((item, i) => `<button type="button" data-page="${i}" class="jump ${answers[item.id] ? 'answered' : ''}" ${i === page ? 'aria-current="step"' : ''} aria-label="Question ${i + 1}${answers[item.id] ? ', answered' : ', unanswered'}">${i + 1}</button>`).join('')}</nav><p class="small">You can revisit any answer before submission. Retries are welcome. A browser reload will restore saved answers when local storage is available.</p>`;
  document.querySelector('#question-form').addEventListener('change', event => {
    if (event.target.name !== 'answer') return;
    answers[q.id] = event.target.value;
    save();
    const count = Object.keys(answers).length;
    document.querySelector('#answered-count').textContent = `${count} answered`;
    document.querySelector('progress').value = count;
    const jump = document.querySelector(`[data-page="${page}"]`);
    jump.classList.add('answered');
    jump.setAttribute('aria-label', `Question ${page + 1}, answered`);
    document.querySelector('#question-status').textContent = '';
  });
  document.querySelector('#previous').addEventListener('click', () => { page--; save(); renderQuestion(true); });
  document.querySelectorAll('[data-page]').forEach(button => button.addEventListener('click', () => { page = Number(button.dataset.page); save(); renderQuestion(true); }));
  document.querySelector('#question-form').addEventListener('submit', event => {
    event.preventDefault();
    if (!answers[q.id]) {
      document.querySelector('#question-status').textContent = 'Please choose an answer before continuing.';
      document.querySelector('input[name="answer"]')?.focus();
      return;
    }
    if (page < attempt.questions.length - 1) { page++; save(); renderQuestion(true); }
    else showSubmission();
  });
  if (focus) focusHeading();
}
function showSubmission() {
  const missing = attempt.questions.findIndex(q => !answers[q.id]);
  if (missing !== -1) { page = missing; save(); renderQuestion(true); document.querySelector('#question-status').textContent = 'This question still needs an answer.'; return; }
  app.innerHTML = `<section class="submission"><p class="eyebrow">ALL FIFTEEN ANSWERS ON FILE</p><h2 id="question-heading" tabindex="-1">Ready for a determination?</h2><p>Your first submitted set of answers is final for this attempt. If you pass, an anonymous license is issued immediately. Personalization and sharing come afterward, if you want them.</p><div class="actions"><button id="submit-exam" class="primary">Submit examination</button><button id="back-to-answers" class="secondary">Review my answers</button></div><p role="status" id="submission-status"></p></section>`;
  focusHeading();
  document.querySelector('#back-to-answers').addEventListener('click', () => { page = 0; renderQuestion(true); });
  document.querySelector('#submit-exam').addEventListener('click', async () => {
    if (submitting) return;
    submitting = true;
    const button = document.querySelector('#submit-exam');
    button.disabled = true;
    document.querySelector('#back-to-answers').disabled = true;
    document.querySelector('#submission-status').textContent = 'The Bureau is considering your distinctions…';
    try {
      const result = await api(`/api/attempts/${attempt.id}/submit`, { answers });
      storage.remove(`bcl-answers:${attempt.id}`);
      showResult(result, true);
    } catch (error) {
      document.querySelector('#submission-status').textContent = `${error.message} You can safely submit again; an already saved result will be recovered.`;
      button.disabled = false;
      document.querySelector('#back-to-answers').disabled = false;
    } finally { submitting = false; }
  });
}
function showResult(result, fresh) {
  attempt.result = result;
  storage.remove(`bcl-answers:${attempt.id}`);
  const licenseUrl = result.licenseId ? `/license/${result.licenseId}` : null;
  app.innerHTML = `<section class="result ${result.passed ? 'passed' : 'failed'}"><p class="eyebrow">EXAMINATION DETERMINATION / ${escape(attempt.version)}</p>${result.passed ? `<div class="ceremony" aria-hidden="true"><span>EXAMINED</span><span>DISTINCTIONS NOTED</span><span>LICENSE ISSUED</span></div><h2 id="result-heading" tabindex="-1">Your opinion now has paperwork.</h2><p>You have demonstrated the minimum required familiarity. The Bureau hereby issues your Consciousness License, with all the imaginary privileges pertaining thereto.</p><a class="primary" href="${licenseUrl}">Receive your license →</a><p class="small">Already issued. Already anonymous. A handle, a download, and sharing are entirely optional.</p>` : `<h2 id="result-heading" tabindex="-1">A little further reading.</h2><p>You are not qualified for a license, but you remain legally entitled to an opinion. We regret this administrative limitation.</p><p>The explanations below are part of the service. There is no lifetime limit on trying again.</p>`}<p class="private-score">${result.score} of ${result.total} correct · ${result.passMark} required · This result is private.</p><div class="actions"><button class="secondary" id="retry">Take another examination</button><a href="/guide">Return to the field guide</a></div><p id="retry-status" role="status"></p></section><section class="review"><p class="eyebrow">EXAMINER’S NOTES / FOR YOUR RECORDS</p><h2>Review the distinctions.</h2>${result.review.map((item, i) => `<details class="review-item"><summary><span class="review-mark">${item.isCorrect ? 'Correct' : 'Revisit'}</span><span>${i + 1}. ${escape(item.prompt)}</span></summary><div><p><strong>Your answer:</strong> ${escape(item.selected)}</p>${!item.isCorrect ? `<p><strong>Best answer:</strong> ${escape(item.correct)}</p>` : ''}<p>${escape(item.explanation)}</p><p class="source-links"><a href="/guide#${escape(item.topic)}">Read the field note</a> · ${item.sources.map(s => `<a href="${escape(s.url)}" rel="noreferrer">${escape(s.title)}</a>`).join(' · ')}</p></div></details>`).join('')}</section>`;
  document.querySelector('#retry').addEventListener('click', () => start(true));
  if (fresh) focusHeading();
}
async function start(retry = false) {
  const button = document.querySelector('#retry');
  if (button) button.disabled = true;
  // Keep the same ID across network retries. A fresh deliberate attempt gets a new ID.
  startRequestId ||= crypto.randomUUID();
  try {
    const value = await api('/api/attempts', { requestId: startRequestId });
    startRequestId = null;
    loadAttempt(value);
    if (retry) focusHeading();
  } catch (error) {
    if (retry) { document.querySelector('#retry-status').textContent = error.message; button.disabled = false; }
    else showLoadError(error.message);
  }
}
function showLoadError(message) {
  app.innerHTML = `<p class="message" role="alert">${escape(message)}</p><button id="load-again" class="secondary">Try again</button>`;
  document.querySelector('#load-again').addEventListener('click', init);
}
async function init() {
  try {
    const data = await api('/api/attempt');
    if (data.attempt) loadAttempt(data.attempt);
    else if (data.recentLicense) {
      app.innerHTML = `<section class="result"><h2 id="result-heading" tabindex="-1">Your paperwork is still on file.</h2><p>Your temporary examination review has been cleared. Your issued license remains.</p><a class="primary" href="/license/${escape(data.recentLicense.id)}">Open your license →</a><button class="secondary" id="retry">Take another examination</button><p id="retry-status" role="status"></p></section>`;
      document.querySelector('#retry').addEventListener('click', () => start(true));
    } else await start();
  } catch (error) { showLoadError(error.message); }
}
init();
