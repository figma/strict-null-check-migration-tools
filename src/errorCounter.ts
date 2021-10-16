import * as fs from "fs";
import { spawn, ChildProcessWithoutNullStreams, execSync } from "child_process";

const buildCompletePattern =
  /Found (\d+) errors?\. Watching for file changes\./gi;

const MODE: "removeFromExclude" | "addToInclude" = "addToInclude";

export class ErrorCounter {
  private tscProcess: ChildProcessWithoutNullStreams;
  private tsconfigCopyPath: string;
  private originalConfig: any;

  constructor(private tsconfigPath: string) {}

  public start(): void {
    this.tsconfigCopyPath =
      this.tsconfigPath + `copy${Math.floor(Math.random() * (1 << 16))}.json`;

    // Make a copy of tsconfig because we're going to keep modifying it.
    execSync(`cp ${this.tsconfigPath} ${this.tsconfigCopyPath}`);
    this.originalConfig = JSON.parse(
      fs.readFileSync(this.tsconfigCopyPath).toString()
    );

    // Opens TypeScript in watch mode so that it can (hopefully) incrementally
    // compile as we add and remove files from the whitelist.
    this.tscProcess = spawn("node_modules/typescript/bin/tsc", [
      "-p",
      this.tsconfigCopyPath,
      "--watch",
      "--noEmit",
    ]);
  }

  public end(): void {
    this.tscProcess.kill();
    execSync(`rm ${this.tsconfigCopyPath}`);
  }

  public async tryCheckingFile(relativeFilePath: string): Promise<number> {
    return new Promise<number>((resolve) => {
      const listener = (data: any) => {
        const textOut = data.toString();
        const match = buildCompletePattern.exec(textOut);

        if (match) {
          this.tscProcess.stdout.removeListener("data", listener);
          const errorCount = +match[1];
          resolve(errorCount);
        }
      };

      this.tscProcess.stdout.on("data", listener);

      switch (MODE) {
        case "addToInclude":
          // Create a new config with the file added to files
          const files = new Set(this.originalConfig.files);
          files.add("./" + relativeFilePath);
          fs.writeFileSync(
            this.tsconfigCopyPath,
            JSON.stringify(
              {
                ...this.originalConfig,
                files: [...files],
              },
              null,
              2
            )
          );
          break;
        case "removeFromExclude":
          // Create a new config with the file removed from excludes
          const exclude = new Set(this.originalConfig.exclude);
          exclude.delete("./" + relativeFilePath);
          fs.writeFileSync(
            this.tsconfigCopyPath,
            JSON.stringify(
              {
                ...this.originalConfig,
                exclude: [...exclude],
              },
              null,
              2
            )
          );
      }
    });
  }
}
