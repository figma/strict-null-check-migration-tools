import * as fs from 'fs'
import * as path from 'path'
import * as glob from 'glob'
import { ImportTracker } from './tsHelper'
import { findCycles } from './findCycles'

function considerFile(file: string): boolean {
  return (file.endsWith('.ts') || file.endsWith('.tsx')) &&
         !file.endsWith('.stories.tsx')
}

function hasUncheckedImport(file: string, importsTracker: ImportTracker, checkedFiles: Set<string>): boolean {
  const imports = importsTracker.getImports(file)
  for (const imp of imports) {
    if (!checkedFiles.has(imp)) {
      return true
    }
  }
  return false
}

export function forEachFileInSrc(srcRoot: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    glob(`${srcRoot}/**/*.ts?(x)`, (err, files) => {
      if (err) {
        return reject(err)
      }

      return resolve(files.filter(considerFile))
    })
  })
}

/**
 * This function returns the list of files that could be whitelisted next, because
 * they don't depend on any file that hasn't been whitelisted.
 */
export async function listStrictNullCheckEligibleFiles(
  srcRoot: string,
  checkedFiles: Set<string>): Promise<string[]> {

  const importsTracker = new ImportTracker(srcRoot)

  const files = await forEachFileInSrc(srcRoot)
  return files.filter(file => {
    if (checkedFiles.has(file)) {
      return false
    }
    return !hasUncheckedImport(file, importsTracker, checkedFiles)
  })
}

/**
 * This function returns the list of cycles of files that could be whitelisted next, because
 * none of the file in that cycle don't depend on any file that hasn't been whitelisted.
 */
export async function listStrictNullCheckEligibleCycles(
  srcRoot: string,
  checkedFiles: Set<string>): Promise<string[][]> {

  const importsTracker = new ImportTracker(srcRoot)

  const files = await forEachFileInSrc(srcRoot)
  const cycles = findCycles(srcRoot, files)
  return cycles.filter(filesInCycle => {
    // A single file is not a cycle
    if (filesInCycle.length <= 1) {
      return false
    }

    let cycleIsChecked = true
    for (const file of filesInCycle) {
      if (!checkedFiles.has(file)) {
        cycleIsChecked = false
        break
      }
    }

    // The whole cycle has already been whitelisted
    if (cycleIsChecked) {
      return false
    }

    // All imports of all files in the cycle must have
    // been whitelisted for the cycle to be eligible
    for (const file of files) {
      if (hasUncheckedImport(file, importsTracker, checkedFiles)) {
        return false
      }
    }
    return true
  })
}

interface TSConfig {
  files: string[]
  include: string[]
  exclude: string[]
}

/**
 * This function returns the list of files that have already been whitelisted into
 * --strictNullChecks.
 */
export async function getCheckedFiles(tsconfigPath: string, srcRoot: string): Promise<Set<string>> {
  const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath).toString()) as TSConfig

  const set = new Set<string>();

  await Promise.all(tsconfig.include.map(file => {
    return new Promise<void>((resolve, reject) => {
      glob(path.join(srcRoot, file), (err, files) => {
        if (err) {
          return reject(err)
        }

        for (const file of files) {
          if (considerFile(file)) {
            set.add(file)
          }
        }
        resolve()
      })
    });
  }));

  await Promise.all(tsconfig.exclude.map(file => {
    return new Promise<void>((resolve, reject) => {
      glob(path.join(srcRoot, file), (err, files) => {
        if (err) {
          return reject(err)
        }

        for (const file of files) {
          set.delete(file)
        }
        resolve()
      })
    });
  }));

  (tsconfig.files || []).forEach(include => {
    if (considerFile(include)) {
      set.add(path.join(srcRoot, include))
    }
  });

  return set
}
