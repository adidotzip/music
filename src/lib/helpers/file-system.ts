import { isMobile } from '$lib/helpers/utils/ua.ts'

export const isFileSystemAccessSupported: boolean = 'showDirectoryPicker' in globalThis

export type FileEntity = File | FileSystemFileHandle

const supportedExtensions = ['aac', 'mp3', 'ogg', 'wav', 'flac', 'm4a', 'opus', 'webm']
const supportedExtensionsWithDot = supportedExtensions.map((ext) => `.${ext}`)

export const isSupportedFile = (fileName: string): boolean => {
    // On Windows .MP3 and .mp3 are both valid file extensions
    const fileNameLower = fileName.toLowerCase()

    return supportedExtensionsWithDot.some((ext) => fileNameLower.endsWith(ext))
}

export const getFilesFromEntry = async (entry: any): Promise<File[]> => {
    if (entry.isFile) {
        return new Promise<File[]>((resolve) => {
            entry.file(
                (file: File) => {
                    resolve(isSupportedFile(file.name) ? [file] : [])
                },
                () => resolve([]),
            )
        })
    } else if (entry.isDirectory) {
        const dirReader = entry.createReader()
        const allFiles: File[] = []

        const readAllEntries = (): Promise<any[]> => {
            return new Promise((resolve) => {
                const entriesList: any[] = []
                const read = () => {
                    dirReader.readEntries(
                        (results: any[]) => {
                            if (results.length === 0) {
                                resolve(entriesList)
                            } else {
                                entriesList.push(...results)
                                read()
                            }
                        },
                        () => resolve(entriesList),
                    )
                }
                read()
            })
        }

        try {
            const entries = await readAllEntries()
            for (const childEntry of entries) {
                const childFiles = await getFilesFromEntry(childEntry)
                allFiles.push(...childFiles)
            }
        } catch (e) {
            console.error(e)
        }
        return allFiles
    }
    return []
}

export const getFilesFromDataTransfer = async (
    dataTransfer: DataTransfer | null,
): Promise<File[]> => {
    if (!dataTransfer) return []

    const items = Array.from(dataTransfer.items ?? [])

    const entryPromises = items.map((item) => {
        const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null
        if (entry) {
            return getFilesFromEntry(entry)
        }

        const file = item.getAsFile()
        if (file && isSupportedFile(file.name)) {
            return Promise.resolve([file])
        }
        return Promise.resolve([])
    })

    const results = await Promise.all(entryPromises)
    return results.flat()
}

export const getFileHandlesRecursively = async (
    directory: FileSystemDirectoryHandle,
): Promise<FileSystemFileHandle[]> => {
    const files: FileSystemFileHandle[] = []

    for await (const handle of directory.values()) {
        if (handle.kind === 'file') {
            const isValidFile = isSupportedFile(handle.name)

            if (isValidFile) {
                files.push(handle)
            }
        } else if (handle.kind === 'directory') {
            const additionalFiles = await getFileHandlesRecursively(handle)

            files.push(...additionalFiles)
        }
    }
    return files
}

const getFilesFromLegacyInputEvent = (e: Event): File[] => {
    const { files } = e.target as HTMLInputElement
    if (!files) {
        return []
    }

    return Array.from(files).filter((file) => isSupportedFile(file.name))
}

export const getFilesFromLegacyDirectory = (): Promise<File[]> => {
    const directoryElement = document.createElement('input')
    directoryElement.type = 'file'

    // Mobile devices do not support directory selection,
    // so allow them to pick individual files instead.
    if (isMobile()) {
        directoryElement.accept = supportedExtensionsWithDot.join(', ')

        directoryElement.multiple = true
    } else {
        directoryElement.setAttribute('webkitdirectory', '')
        directoryElement.setAttribute('directory', '')
    }

    const { promise, resolve: resolvePromise } = Promise.withResolvers<File[]>()

    const resolve = (files: File[]) => {
        directoryElement.remove()
        resolvePromise(files)
    }

    directoryElement.addEventListener('change', (e) => {
        resolve(getFilesFromLegacyInputEvent(e))
    })

    directoryElement.addEventListener('cancel', () => {
        resolve([])
    })

    directoryElement.addEventListener('error', () => {
        resolve([])
    })

    // See https://stackoverflow.com/questions/47664777/javascript-file-input-onchange-not-working-ios-safari-only
    directoryElement.style.position = 'fixed'
    directoryElement.style.top = '-100000px'
    directoryElement.style.left = '-100000px'
    document.body.appendChild(directoryElement)

    directoryElement.click()

    return promise
}
