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
const verify = document.querySelector('#verify-x');
const outcomes = {
  verified: 'X sign-in completed. Your account verification is recorded below.',
  'x-token': 'X sign-in returned, but the Bureau could not complete the token exchange. Your license has not been verified. Please try again.',
  'x-profile': 'X sign-in succeeded, but X did not supply a usable account identity. Your license has not been verified. Please try again.',
  'x-revoke': 'The Bureau could not confirm that X revoked the temporary access token, so verification was not saved. You can revoke the app in X’s connected-app settings.',
  cancelled: 'X sign-in was cancelled. Your license has not changed.',
  unavailable: 'X verification could not be completed. Your license has not changed. Please try again.',
  'account-mismatch': 'This license is already bound to a different X account. Sign in with that original account.',
  expired: 'A newer change replaced this sign-in. Please start again if you still want to verify.',
  removed: 'Your license is now anonymous. Future downloads use the updated record.',
};
// Query strings describe a redirect outcome; only the server record determines verification.
const outcome = new URL(location.href).searchParams.get('x');
if (outcome) {
  const authStatus = document.querySelector('#auth-status');
  authStatus.textContent = outcome === 'verified' && record.dataset.xVerified !== 'true'
    ? 'No X verification is currently on file for this license. Please try signing in again.'
    : Object.hasOwn(outcomes, outcome) ? outcomes[outcome] : '';
  authStatus.hidden = !authStatus.textContent;
  if (!authStatus.hidden) authStatus.scrollIntoView({ block: 'center' });
  history.replaceState(null, '', `/license/${id}`);
}
try {
  const response = await fetch(`/api/licenses/${id}/editor`);
  if (!response.ok) throw new Error();
  const access = await response.json();
  document.querySelector('#personalization').hidden = !access.canEdit;
  verify.disabled = !access.xAvailable;
  if (access.canEdit && !access.xAvailable) message.textContent = 'X sign-in is not available at this address. Your license remains available.';
} catch { status.textContent = 'Editing access could not be checked. Reload to try again.'; }
verify.addEventListener('click', async () => {
  verify.disabled = true;
  message.textContent = 'Opening X sign-in…';
  try {
    const response = await fetch(`/api/licenses/${id}/verify-x`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'X sign-in could not be opened.');
    const target = new URL(result.url);
    if (target.origin !== 'https://x.com' || target.pathname !== '/i/oauth2/authorize') throw new Error('X sign-in returned an unexpected address.');
    location.assign(target.href);
  } catch (error) { message.textContent = error.message; verify.disabled = false; }
});
document.querySelector('#remove-handle')?.addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  message.textContent = 'Updating the record…';
  try {
    const response = await fetch(`/api/licenses/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: '' }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'The name could not be removed.');
    location.assign(`/license/${id}?x=removed`);
  } catch (error) { message.textContent = error.message; button.disabled = false; }
});
