/// <reference types="vite/client" />

declare global {
  interface Window {
    showDirectoryPicker?: () => Promise<FileSystemDirectoryHandle>
  }

  interface FileSystemDirectoryHandle {
    entries?: () => AsyncIterable<[string, FileSystemHandle]>
  }
}

export {}
