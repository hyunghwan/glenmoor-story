export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
}

export async function pickWorkspaceDirectory(): Promise<FileSystemDirectoryHandle> {
  const picker = window.showDirectoryPicker as (() => Promise<FileSystemDirectoryHandle>) | undefined

  if (!picker) {
    throw new Error('File System Access API is unavailable in this browser.')
  }

  return picker()
}

export async function readJsonFile<T>(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<T | null> {
  const parts = relativePath.split('/').filter(Boolean)
  const fileName = parts.pop()

  if (!fileName) {
    return null
  }

  let current = rootHandle

  for (const part of parts) {
    try {
      current = await current.getDirectoryHandle(part)
    } catch {
      return null
    }
  }

  try {
    const fileHandle = await current.getFileHandle(fileName)
    const file = await fileHandle.getFile()
    return JSON.parse(await file.text()) as T
  } catch {
    return null
  }
}

export async function writeJsonFile(
  rootHandle: FileSystemDirectoryHandle,
  relativePath: string,
  value: unknown,
): Promise<void> {
  const parts = relativePath.split('/').filter(Boolean)
  const fileName = parts.pop()

  if (!fileName) {
    throw new Error('Missing file name')
  }

  let current = rootHandle

  for (const part of parts) {
    current = await current.getDirectoryHandle(part, { create: true })
  }

  const fileHandle = await current.getFileHandle(fileName, { create: true })
  const writable = await fileHandle.createWritable()
  await writable.write(JSON.stringify(value, null, 2))
  await writable.close()
}
