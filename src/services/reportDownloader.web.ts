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
  URL.revokeObjectURL(objectUrl);

  return `browser-download:${filename}`;
}
