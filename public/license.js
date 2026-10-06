const record = document.querySelector('[data-license-id]');
const id = record.dataset.licenseId;
const permanentUrl = document.querySelector('#permanent-url').value;
const status = document.querySelector('#license-status');
const download = document.querySelector('#download');
const copy = document.querySelector('#copy-url');
const share = document.querySelector('#share');
download.hidden = false;
copy.hidden = false;
share.hidden = !navigator.share;

download.addEventListener('click', async () => {
  download.disabled = true;
  status.textContent = 'Preparing your paperwork…';
  let objectUrl;
  try {
    const response = await fetch(`/license/${id}/certificate.svg`);
    if (!response.ok) throw new Error('The certificate could not be retrieved. Please try again.');
    objectUrl = URL.createObjectURL(await response.blob());
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the PNG.');
    context.drawImage(image, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('This browser could not prepare the PNG.');
    const pngUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = pngUrl;
    link.download = `consciousness-license-${id}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(pngUrl), 60000);
    status.textContent = 'Your PNG is ready. Include the permanent URL if you choose to share it.';
  } catch (error) {
    status.textContent = `${error.message} `;
    const fallback = document.createElement('a');
    fallback.href = `/license/${id}/certificate.svg`;
    fallback.textContent = 'Download the SVG instead.';
    status.append(fallback);
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    download.disabled = false;
  }
});
copy.addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(permanentUrl); status.textContent = 'Permanent URL copied. Sharing remains entirely your affair.'; }
  catch { document.querySelector('#permanent-url').select(); status.textContent = 'Select and copy the permanent URL above.'; }
});
share.addEventListener('click', async () => {
  try { await navigator.share({ title: 'Consciousness License', text: 'The Bureau hereby certifies that the bearer is competent to discuss the philosophy of consciousness.', url: permanentUrl }); }
  catch (error) { if (error.name !== 'AbortError') status.textContent = 'Sharing could not be opened. You can copy the URL instead.'; }
});
const message = document.querySelector('#handle-status');
const prepare = document.querySelector('#prepare-post');
let challenge;
function displayChallenge(value) {
  challenge = value;
  document.querySelector('#post-proof').hidden = !value;
  if (!value) return;
  document.querySelector('#proof-handle').value = value.handle;
  document.querySelector('#proof-text').value = value.text;
  document.querySelector('#compose-post').href = `https://x.com/intent/post?${new URLSearchParams({ text: value.text })}`;
  document.querySelector('#proof-expiry').textContent = `Publish and submit before ${new Date(value.expiresAt * 1000).toLocaleTimeString()}. ${value.checksRemaining} checks remaining. Preparing again restarts the verification window.`;
}
async function api(path, method, data) {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'The record could not be updated. Please try again.');
  return result;
}
const outcome = new URL(location.href).searchParams.get('updated');
if (outcome) {
  const notice = document.querySelector('#auth-status');
  notice.textContent = outcome === 'verified' && record.dataset.xVerified === 'true' ? 'Your X account is verified. The permanent URL is unchanged.' : outcome === 'name' ? 'Your license’s name has been updated.' : '';
  notice.hidden = !notice.textContent;
  history.replaceState(null, '', `/license/${id}`);
}
try {
  const response = await fetch(`/api/licenses/${id}/editor`);
  if (!response.ok) throw new Error();
  const access = await response.json();
  document.querySelector('#personalization').hidden = !access.canEdit;
  prepare.disabled = !access.postAvailable;
  displayChallenge(access.challenge);
  if (access.canEdit && !access.postAvailable) message.textContent = 'Post verification is temporarily unavailable. You can still save a self-declared handle.';
} catch { status.textContent = 'Editing access could not be checked. Reload to try again.'; }
document.querySelector('#prepare-form').addEventListener('submit', async event => {
  event.preventDefault();
  prepare.disabled = true;
  message.textContent = 'Preparing your verification statement…';
  try {
    displayChallenge(await api(`/api/licenses/${id}/post-challenge`, 'POST', { handle: document.querySelector('#proof-handle').value }));
    message.textContent = 'Publish the complete prepared text, then submit the URL of that post below.';
  } catch (error) { message.textContent = error.message; }
  finally { prepare.disabled = false; }
});
document.querySelector('#copy-proof').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(challenge.text); message.textContent = 'Verification post text copied.'; }
  catch { document.querySelector('#proof-text').select(); message.textContent = 'Select and copy the prepared text above.'; }
});
document.querySelector('#verify-post-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!challenge) return;
  const button = event.target.querySelector('button');
  button.disabled = true;
  message.textContent = 'Checking the submitted post…';
  try {
    await api(`/api/licenses/${id}/verify-post`, 'POST', { url: document.querySelector('#post-url').value, nonce: challenge.nonce });
    location.assign(`/license/${id}?updated=verified`);
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
async function saveHandle(handle, button) {
  button.disabled = true;
  message.textContent = 'Updating the record…';
  try {
    await api(`/api/licenses/${id}`, 'PATCH', { handle });
    location.assign(`/license/${id}?updated=name`);
  } catch (error) { message.textContent = error.message; button.disabled = false; }
}
document.querySelector('#handle-form')?.addEventListener('submit', event => {
  event.preventDefault();
  saveHandle(document.querySelector('#handle').value, event.target.querySelector('button'));
});
document.querySelector('#remove-handle')?.addEventListener('click', event => saveHandle('', event.currentTarget));
