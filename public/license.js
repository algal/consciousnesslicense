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
  try { await navigator.share({ title: 'Consciousness License', text: 'Certifies familiarity with the dispute. Does not certify that the dispute has been resolved.', url: permanentUrl }); }
  catch (error) { if (error.name !== 'AbortError') status.textContent = 'Sharing could not be opened. You can copy the URL instead.'; }
});
try {
  const response = await fetch(`/api/licenses/${id}/editor`);
  if (!response.ok) throw new Error();
  const access = await response.json();
  document.querySelector('#personalization').hidden = !access.canEdit;
} catch { status.textContent = 'Editing access could not be checked. Reload to try again.'; }
document.querySelector('#handle-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.target.querySelector('button');
  const input = document.querySelector('#handle');
  const message = document.querySelector('#handle-status');
  button.disabled = true;
  message.textContent = 'Updating the record…';
  try {
    const response = await fetch(`/api/licenses/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ handle: input.value }) });
    const license = await response.json();
    if (!response.ok) throw new Error(license.error || 'The handle could not be saved.');
    input.value = license.handle ?? '';
    document.querySelector('#license-name').textContent = license.handle ? `@${license.handle}` : 'An informed anonymous bearer.';
    document.title = `${license.handle ? `@${license.handle}` : 'An anonymous bearer'} · Consciousness License · Bureau of Consciousness Licensing`;
    message.textContent = license.handle ? 'Handle saved. Future downloads use your updated record.' : 'Your license is anonymous. Future downloads use your updated record.';
  } catch (error) { message.textContent = error.message; }
  finally { button.disabled = false; }
});
