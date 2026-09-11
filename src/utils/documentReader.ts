async function extractTextFromPdf(file: File): Promise<string> {
  let releaseDocument: (() => Promise<void>) | null = null
  try {
    // PDF.js is by far the heaviest optional dependency in the app. Load it
    // only after a user actually chooses a PDF instead of charging every
    // canvas session for the parser on initial startup.
    const pdfjs = await import('pdfjs-dist')
    // Bundled, not fetched from a CDN. This worker runs as same-origin script in
    // the app's own context, so serving it from cdnjs handed a third party the
    // ability to execute code next to the user's session — with no integrity
    // check and no CSP to fall back on. Vite emits it as a local asset, which
    // also keeps the worker and the library on exactly the same version.
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url,
    ).toString()

    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(arrayBuffer),
      // A PDF here is untrusted input — it arrives by email or download and is
      // opened by the importer. Only text is wanted, so the font pipeline is
      // switched off: it is the part that turns document-supplied data into
      // installed faces and system lookups, and it buys nothing for extraction.
      // (pdf.js 6 removed `isEvalSupported`; the eval path it guarded is gone.)
      disableFontFace: true,
      useSystemFonts: false,
    })
    releaseDocument = () => loadingTask.destroy()
    const pdf = await loadingTask.promise
    releaseDocument = async () => {
      try {
        await pdf.cleanup()
      } finally {
        await loadingTask.destroy()
      }
    }
    let fullText = ''

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i)
      try {
        const textContent = await page.getTextContent()
        const pageText = textContent.items
          .map((item) => ('str' in item ? item.str : ''))
          .filter(Boolean)
          .join(' ')
        fullText += `--- Page ${i} ---\n${pageText}\n`
      } finally {
        page.cleanup()
      }
    }
    return fullText
  } catch (error) {
    console.error('Error parsing PDF:', error)
    return `[Failed to extract text from PDF: ${file.name}]`
  } finally {
    await releaseDocument?.().catch(() => undefined)
  }
}

function readTextFromFile(file: File): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      resolve((e.target?.result as string) || '')
    }
    reader.onerror = () => {
      resolve(`[Failed to read text file: ${file.name}]`)
    }
    reader.readAsText(file)
  })
}

export async function extractFileContent(file: File): Promise<string> {
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'pdf') {
    return extractTextFromPdf(file)
  }
  return readTextFromFile(file)
}
