import { minimatch } from "minimatch";

const ignoredFiles = process.env.INPUT_IGNORE_FILES ?? "";

export const shouldIgnoreFile = (file: string): boolean => {
  const globPatterns = ignoredFiles.split(",");
  return globPatterns.some((globPattern) => {
    const shouldIgnore = minimatch(file, globPattern);
    if (shouldIgnore) {
      console.log(`Ignoring file ${file} because it matched ${globPattern}`);
    }
    return shouldIgnore;
  });
};
