import type { ScanCandidate } from '../types'

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

const IGNORED_DIR_NAMES = new Set(['.git', 'node_modules', 'dist', '.asset-workbench'])
const IGNORED_PREFIXES = ['output/web-game/', 'coverage/', '.omx/']

function shouldIgnorePath(relativePath: string): boolean {
  return IGNORED_PREFIXES.some((prefix) => relativePath.startsWith(prefix))
}

export async function walkWorkspace(rootHandle: FileSystemDirectoryHandle): Promise<{
  files: ScanCandidate[]
  ignoredPaths: string[]
}> {
  const files: ScanCandidate[] = []
  const ignoredPaths: string[] = []

  async function visitDirectory(handle: FileSystemDirectoryHandle, prefix: string): Promise<void> {
    const entries = handle.entries as (() => AsyncIterable<[string, FileSystemHandle]>) | undefined
    if (!entries) {
      throw new Error('Directory handle iteration is unavailable in this browser.')
    }

    for await (const [name, childHandle] of entries.call(handle)) {
      const relativePath = prefix ? `${prefix}/${name}` : name

      if (shouldIgnorePath(relativePath)) {
        ignoredPaths.push(relativePath)
        continue
      }

      if (childHandle.kind === 'directory') {
        const directoryHandle = childHandle as FileSystemDirectoryHandle
        if (IGNORED_DIR_NAMES.has(name)) {
          ignoredPaths.push(relativePath)
          continue
        }

        await visitDirectory(directoryHandle, relativePath)
        continue
      }

      const fileHandle = childHandle as FileSystemFileHandle
      const extension = name.includes('.') ? name.split('.').at(-1)?.toLowerCase() ?? '' : ''
      const file = await fileHandle.getFile()

      files.push({
        relativePath,
        name,
        extension,
        file,
        handle: fileHandle,
      })
    }
  }

  await visitDirectory(rootHandle, '')

  return {
    files,
    ignoredPaths: ignoredPaths.sort(),
  }
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
