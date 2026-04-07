const FileSystem: any = require('expo-file-system/legacy');

export async function savePlatformReportFile(
  filename: string,
  contents: string,
  mimeType: string
) {
  if (FileSystem.StorageAccessFramework) {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();

    if (!permissions.granted) {
      throw new Error('Folder access was not granted.');
    }

    const fileUri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      filename,
      mimeType
    );

    await FileSystem.writeAsStringAsync(fileUri, contents);
    return fileUri;
  }

  const path = `${FileSystem.documentDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, contents);
  return path;
}
