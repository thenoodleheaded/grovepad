let pendingFiles: File[] = []

export function stagePendingImport(files: File[]): void {
  pendingFiles = files
}

export function takePendingImport(): File[] {
  const files = pendingFiles
  pendingFiles = []
  return files
}
