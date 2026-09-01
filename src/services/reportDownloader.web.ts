export async function savePlatformReportFile(
  filename: string,
  contents: string,
  mimeType: string
) {
  const blob = new Blob([contents], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Keep the Blob URL alive long enough for browsers to begin the asynchronous download.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);

  return `browser-download:${filename}`;
}
