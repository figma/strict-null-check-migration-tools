import * as path from 'path'
import * as fs from 'fs'
import * as ts from 'typescript'

/**
 * Given a file, return the list of files it imports as absolute paths.
 */
export function getImportsForFile(file: string, srcRoot: string) {
  // Follow symlink so directory check works.
  file = fs.realpathSync(file)

  if (fs.lstatSync(file).isDirectory()) {
    const index = path.join(file, "index.ts")
    const indexTsx = path.join(file, "index.tsx")
    const indexJs = path.join(file, "index.js")
    if (fs.existsSync(index)) {
      // https://basarat.gitbooks.io/typescript/docs/tips/barrel.html
      console.warn(`Warning: Barrel import: ${path.relative(srcRoot, file)}`)
      file = index
    } else if (fs.existsSync(indexTsx)) {
      console.warn(`Warning: Barrel import: ${path.relative(srcRoot, file)}`)
      file = indexTsx
    } else if (fs.existsSync(indexJs)) {
      // Don't bother analyzing imports of js files.
      return [];
    } else {
      throw new Error(`Warning: Importing a directory without an index.ts file: ${path.relative(srcRoot, file)}`)
    }
  }

  const fileInfo = ts.preProcessFile(fs.readFileSync(file).toString());
  return fileInfo.importedFiles
    .map(importedFile => importedFile.fileName)
    // remove svg, css, less imports
    .filter(fileName => !fileName.endsWith(".less") && !fileName.endsWith(".css") && !fileName.endsWith(".svg") && !fileName.endsWith(".json"))
    .filter(fileName => !fileName.endsWith(".js") && !fileName.endsWith(".jsx")) // Assume .js/.jsx imports have a .d.ts available
    .filter(x => /\//.test(x)) // remove node modules (the import must contain '/')
    .map(fileName => {
      if (/(^\.\/)|(^\.\.\/)/.test(fileName)) {
        return path.join(path.dirname(file), fileName)
      }
      // In some repos, we configure TS paths (https://www.typescriptlang.org/tsconfig#paths).
      // We could make this script properly understand those... but it's easier to just hardcode this
      // specific path for now. 
      // We essentially just turn an import of `src/...` into an import relative to the src root, 
      // which works because that's exactly how we've configured our path mapping.
      // If we use this script on other repos, we may need to update this section.
      if (/^src/.test(fileName)) {
        return path.join(srcRoot, fileName);
      }
      return path.join(srcRoot, fileName);
    }).map(fileName => {
      if (fs.existsSync(`${fileName}.ts`)) {
        return `${fileName}.ts`
      }
      if (fs.existsSync(`${fileName}.tsx`)) {
        return `${fileName}.tsx`
      }
      if (fs.existsSync(`${fileName}.d.ts`)) {
        return `${fileName}.d.ts`
      }
      if (fs.existsSync(`${fileName}`)) {
        return fileName
      }
      console.warn(`Warning: Unresolved import ${path.relative(srcRoot, fileName)} ` +
                   `in ${path.relative(srcRoot, file)}`)
      return null
    }).filter(fileName => !!fileName)
}

/**
 * This class memoizes the list of imports for each file.
 */
export class ImportTracker {
  private imports = new Map<string, string[]>()

  constructor(private srcRoot: string) {}

  public getImports(file: string): string[] {
    if (this.imports.has(file)) {
      return this.imports.get(file)
    }
    const imports = getImportsForFile(file, this.srcRoot)
    this.imports.set(file, imports)
    return imports
  }
}
