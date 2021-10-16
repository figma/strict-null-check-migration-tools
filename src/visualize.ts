import * as fs from "fs";
import * as path from "path";
import {
  listStrictNullCheckEligibleFiles,
  getCheckedFiles,
  forEachFileInSrc,
  listStrictNullCheckEligibleCycles,
} from "./getStrictNullCheckEligibleFiles";
import { ImportTracker } from "./tsHelper";
import { findCycles } from "./findCycles";
import { ErrorCounter } from "./errorCounter";

const tsconfigPath = process.argv[2];
const srcRoot = path.dirname(tsconfigPath);
const countErrors = process.argv.indexOf("--countErrors") >= 0;

summary();

export interface DependencyNode {
  id: number;
  files: string[];
  checked: boolean;
  eligible: boolean;
  errorCount: number | null;

  // List of IDs of nodes dependent on this file.
  dependents: number[];

  // List of IDs of nodes this file depends on.
  dependencies: number[];

  // Depth of chain that depends on this file. A file that isn't imported
  // by anything has depth 0.
  dependentDepth: number;

  // Depth of chain of dependencies from this file. A file with no
  // dependencies has depth 0.
  dependencyDepth: number;
}

async function summary() {
  const allFiles = await forEachFileInSrc(srcRoot);
  const checkedFiles = await getCheckedFiles(tsconfigPath, srcRoot);
  const eligibleFiles = new Set([
    ...(await listStrictNullCheckEligibleFiles(srcRoot, checkedFiles)),
    ...(await listStrictNullCheckEligibleCycles(srcRoot, checkedFiles)).reduce(
      (a, b) => a.concat(b),
      []
    ),
  ]);
  const importTracker = new ImportTracker(srcRoot);

  let errorCounter = new ErrorCounter(tsconfigPath);
  if (countErrors) {
    errorCounter.start();
  }

  console.log(
    `Current strict null checking progress ${checkedFiles.size}/${allFiles.length}`
  );
  console.log(`Current eligible file count: ${eligibleFiles.size}`);

  const cycles = findCycles(srcRoot, allFiles);
  let nodes: DependencyNode[] = [];
  for (let i = 0; i < cycles.length; i++) {
    let files = cycles[i];
    let checked = true;
    for (const file of files) {
      if (!checkedFiles.has(file)) {
        checked = false;
        break;
      }
    }
    let eligible = false;
    if (!checked) {
      for (const file of files) {
        if (eligibleFiles.has(file)) {
          eligible = true;
          break;
        }
      }
    }

    let errorCount = null;
    if (eligible && countErrors) {
      const relativePath = path.relative(srcRoot, files[0]);
      console.log(`Counting errors for eligible file: '${relativePath}'`);
      errorCount = await errorCounter.tryCheckingFile(relativePath);
    }

    files.sort();

    nodes.push({
      id: i,
      files,
      checked,
      eligible,
      errorCount,
      dependents: [],
      dependencies: [],
      dependentDepth: -1,
      dependencyDepth: -1,
    });
  }

  if (countErrors) {
    errorCounter.end();
  }

  const fileToNodeMap = new Map<string, DependencyNode>();
  for (const node of nodes) {
    for (const file of node.files) {
      fileToNodeMap.set(file, node);
    }
  }

  makeDependenciesLists(nodes, fileToNodeMap, importTracker);
  makeDependentsLists(nodes, fileToNodeMap, importTracker);
  calculateDependencyDepth(nodes);
  calculateDependentDepth(nodes);

  // Turn into relative path before outputting
  for (const node of nodes) {
    node.files = node.files.map((file) => path.relative(srcRoot, file));
  }

  fs.writeFileSync(
    path.join(process.cwd(), "data.js"),
    `window.nodes = ${JSON.stringify(nodes)}`
  );
}

function makeDependenciesLists(
  nodes: DependencyNode[],
  fileToNodeMap: Map<string, DependencyNode>,
  importTracker: ImportTracker
) {
  for (const node of nodes) {
    for (const file of node.files) {
      for (const dependency of importTracker.getImports(file)) {
        // Ignore dependencies that are already part of the current cycle
        if (node.files.indexOf(dependency) >= 0) {
          continue;
        }
        let id = fileToNodeMap.get(dependency).id;
        // Avoid duplicates
        if (node.dependencies.indexOf(id) >= 0) {
          continue;
        }
        node.dependencies.push(id);
      }
    }
  }
}

function makeDependentsLists(
  nodes: DependencyNode[],
  fileToNodeMap: Map<string, DependencyNode>,
  importTracker: ImportTracker
) {
  for (const node of nodes) {
    for (const file of node.files) {
      for (const dependency of importTracker.getImports(file)) {
        // Ignore dependencies that are already part of the current cycle
        if (node.files.indexOf(dependency) >= 0) {
          continue;
        }
        let dependencyNode = fileToNodeMap.get(dependency);
        // Avoid duplicates
        if (dependencyNode.dependents.indexOf(node.id) < 0) {
          dependencyNode.dependents.push(node.id);
        }
      }
    }
  }
}

function calculateDependencyDepth(nodes: DependencyNode[]) {
  let remainingNodesToProcess = Array.from(nodes);
  let currentDepth = 0;
  while (remainingNodesToProcess.length > 0) {
    let nodesAtCurrentDepth: DependencyNode[] = [];

    remainingNodesToProcess = remainingNodesToProcess.filter((node) => {
      // We're looking for files that only import files that have already been
      // processed, i.e. assigned a dependencyDepth.
      let hasUnprocessedDependency = false;
      for (const dependencyId of node.dependencies) {
        const dependencyDepth = nodes[dependencyId].dependencyDepth;
        if (dependencyDepth === -1) {
          hasUnprocessedDependency = true;
          break;
        }
      }

      if (hasUnprocessedDependency) {
        return true;
      } else {
        nodesAtCurrentDepth.push(node);
        return false;
      }
    });

    for (const node of nodesAtCurrentDepth) {
      node.dependencyDepth = currentDepth;
    }

    currentDepth++;
  }
}

function calculateDependentDepth(nodes: DependencyNode[]) {
  let remainingNodesToProcess = Array.from(nodes);
  let currentDepth = 0;
  while (remainingNodesToProcess.length > 0) {
    let nodesAtCurrentDepth: DependencyNode[] = [];

    remainingNodesToProcess = remainingNodesToProcess.filter((node) => {
      // We're looking for files that only import files that have already been
      // processed, i.e. assigned a dependencyDepth.
      let hasUnprocessedDependents = false;
      for (const dependentId of node.dependents) {
        const dependentDepth = nodes[dependentId].dependentDepth;
        if (dependentDepth === -1) {
          hasUnprocessedDependents = true;
          break;
        }
      }

      if (hasUnprocessedDependents) {
        return true;
      } else {
        nodesAtCurrentDepth.push(node);
        return false;
      }
    });

    for (const node of nodesAtCurrentDepth) {
      node.dependentDepth = currentDepth;
    }

    currentDepth++;
  }
}
